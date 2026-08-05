import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, prisma } from '@sonder/database';
import { createCipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import forge from 'node-forge';

const MAX_CERTIFICATE_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.pfx', '.p12']);
const json = (value: unknown) => value as Prisma.InputJsonValue;

export type CertificateUpload = {
  originalname: string;
  size: number;
  buffer: Buffer;
};

export type CertificateMetadata = {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
};

@Injectable()
export class CertificateService {
  private readonly root = resolve(process.env.CERTIFICATE_LOCAL_PATH ?? '.data/certificates');
  private readonly key = this.readEncryptionKey();

  validatePkcs12(buffer: Buffer, password: string): CertificateMetadata {
    if (!password) throw new BadRequestException('Informe a senha do certificado.');
    try {
      const asn1 = forge.asn1.fromDer(buffer.toString('binary'), false);
      const store = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
      const certBagOid = forge.pki.oids.certBag as string;
      const bags = store.getBags({ bagType: certBagOid })[certBagOid] ?? [];
      const certificate = bags.find((bag: { cert?: forge.pki.Certificate }) => bag.cert)?.cert;
      if (!certificate) throw new Error('Certificado ausente');
      const name = (attributes: forge.pki.CertificateField[]) =>
        attributes.map((item) => `${item.shortName ?? item.name ?? 'OID'}=${item.value}`).join(', ');
      return {
        subject: name(certificate.subject.attributes),
        issuer: name(certificate.issuer.attributes),
        serialNumber: certificate.serialNumber,
        validFrom: certificate.validity.notBefore.toISOString(),
        validTo: certificate.validity.notAfter.toISOString(),
      };
    } catch {
      throw new BadRequestException('Arquivo PKCS#12 inválido ou senha incorreta.');
    }
  }

  async status(organizationId: string, clinicId: string) {
    await this.assertClinic(organizationId, clinicId);
    const file = await prisma.fileObject.findFirst({
      where: {
        organizationId,
        bucket: 'certificates',
        metadata: { path: ['clinicId'], equals: clinicId },
        status: 'AVAILABLE',
      },
      select: { id: true, metadata: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const metadata = (file?.metadata ?? {}) as Record<string, unknown>;
    return {
      configured: Boolean(file),
      passwordConfigured: Boolean(file),
      downloadAllowed: false,
      storage: file ? 'privado' : 'não configurado',
      certificateId: file?.id,
      subject: metadata.subject,
      issuer: metadata.issuer,
      serialNumber: metadata.serialNumber,
      validFrom: metadata.validFrom,
      validTo: metadata.validTo,
      uploadedAt: file?.createdAt,
    };
  }

  async replace(organizationId: string, clinicId: string, actorId: string, file: CertificateUpload, password: string) {
    await this.assertClinic(organizationId, clinicId);
    if (!file?.buffer) throw new BadRequestException('Envie o arquivo do certificado.');
    const extension = file.originalname.toLowerCase().match(/\.(pfx|p12)$/)?.[0] ?? '';
    if (!ALLOWED_EXTENSIONS.has(extension)) throw new BadRequestException('Envie um arquivo .pfx ou .p12.');
    if (!file.size || file.size > MAX_CERTIFICATE_BYTES) throw new BadRequestException('O certificado deve ter no máximo 5 MB.');
    const metadata = this.validatePkcs12(file.buffer, password);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const objectKey = `${organizationId}/${clinicId}/${randomUUID()}${extension}`;
    const absolutePath = resolve(this.root, objectKey);
    if (!absolutePath.startsWith(`${this.root}/`)) throw new BadRequestException('Caminho de storage inválido.');
    await mkdir(resolve(absolutePath, '..'), { recursive: true, mode: 0o700 });
    await writeFile(absolutePath, file.buffer, { mode: 0o600, flag: 'wx' });
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    try {
      const result = await prisma.$transaction(async (tx) => {
        const previous = await tx.fileObject.findMany({
          where: {
            organizationId,
            bucket: 'certificates',
            metadata: { path: ['clinicId'], equals: clinicId },
            status: 'AVAILABLE',
          },
          select: { id: true, objectKey: true },
        });
        await tx.fileObject.updateMany({ where: { id: { in: previous.map((item) => item.id) } }, data: { status: 'REJECTED' } });
        const created = await tx.fileObject.create({
          data: {
            organizationId,
            bucket: 'certificates',
            objectKey,
            originalName: file.originalname,
            mimeType: 'application/x-pkcs12',
            extension,
            sizeBytes: BigInt(file.size),
            checksum,
            status: 'AVAILABLE',
            antivirusStatus: 'NOT_APPLICABLE',
            encryption: json({ password: this.encrypt(password), algorithm: 'AES-256-GCM' }),
            createdById: actorId,
            metadata: json({ clinicId, ...metadata }),
          },
          select: { id: true },
        });
        await tx.auditEvent.create({
          data: {
            actorId, action: 'certificate.replaced', entity: 'FileObject', entityId: created.id,
            clinicId, changes: { checksum, ...metadata }, correlationId: randomUUID(),
          },
        });
        return { created, previous };
      });
      await Promise.all(result.previous.map((item) => rm(resolve(this.root, item.objectKey), { force: true })));
      return this.status(organizationId, clinicId);
    } catch (error) {
      await rm(absolutePath, { force: true });
      throw error;
    }
  }

  async remove(organizationId: string, clinicId: string, actorId: string) {
    await this.assertClinic(organizationId, clinicId);
    const files = await prisma.fileObject.findMany({
      where: {
        organizationId,
        bucket: 'certificates',
        metadata: { path: ['clinicId'], equals: clinicId },
        status: 'AVAILABLE',
      },
      select: { id: true, objectKey: true },
    });
    if (!files.length) throw new NotFoundException('Certificado não encontrado.');
    await prisma.$transaction([
      prisma.fileObject.updateMany({ where: { id: { in: files.map((item) => item.id) } }, data: { status: 'REJECTED' } }),
      prisma.auditEvent.create({
        data: {
          actorId, action: 'certificate.removed', entity: 'FileObject', clinicId,
          changes: { removed: true }, correlationId: randomUUID(),
        },
      }),
    ]);
    await Promise.all(files.map((item) => rm(resolve(this.root, item.objectKey), { force: true })));
    return { success: true };
  }

  private encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
  }

  private readEncryptionKey() {
    const value = process.env.ENCRYPTION_MASTER_KEY;
    if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw new BadRequestException('ENCRYPTION_MASTER_KEY inválida.');
    return Buffer.from(value, 'hex');
  }

  private async assertClinic(organizationId: string, clinicId: string) {
    const clinic = await prisma.clinic.findFirst({ where: { id: clinicId, organizationId }, select: { id: true } });
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');
  }
}
