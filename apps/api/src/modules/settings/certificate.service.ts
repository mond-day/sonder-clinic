import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, prisma } from '@sonder/database';
import { createStorageAdapter, type StorageAdapter } from '@sonder/storage';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import forge from 'node-forge';

const MAX_CERTIFICATE_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.pfx', '.p12']);
const CERTIFICATE_KIND = 'certificate-a1';
const LEGACY_CERTIFICATE_ROOT = resolve(process.env.CERTIFICATE_LOCAL_PATH ?? '.data/certificates');
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
  private readonly key = this.readEncryptionKey();
  private readonly storage: StorageAdapter = createStorageAdapter();

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
    const file = await this.findActive(organizationId, clinicId);
    const metadata = (file?.metadata ?? {}) as Record<string, unknown>;
    return {
      configured: Boolean(file),
      passwordConfigured: Boolean(file),
      downloadAllowed: false,
      storage: file
        ? `${this.storage.driver}:${file.bucket}`
        : this.storage.enabled
          ? `${this.storage.driver}:não configurado`
          : 'desabilitado',
      storageDriver: this.storage.driver,
      storageEnabled: this.storage.enabled,
      storageDisabledReason: this.storage.disabledReason ?? null,
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
    if (!this.storage.enabled) {
      throw new BadRequestException(
        this.storage.disabledReason
          ?? 'Storage desabilitado — configure STORAGE_DRIVER=local ou MinIO/S3 com credenciais.',
      );
    }
    if (!file?.buffer) throw new BadRequestException('Envie o arquivo do certificado.');
    const extension = file.originalname.toLowerCase().match(/\.(pfx|p12)$/)?.[0] ?? '';
    if (!ALLOWED_EXTENSIONS.has(extension)) throw new BadRequestException('Envie um arquivo .pfx ou .p12.');
    if (!file.size || file.size > MAX_CERTIFICATE_BYTES) throw new BadRequestException('O certificado deve ter no máximo 5 MB.');
    const metadata = this.validatePkcs12(file.buffer, password);

    let stored;
    try {
      stored = await this.storage.putObject({
        organizationId,
        clinicId,
        filename: `certificate${extension}`,
        contentType: 'application/x-pkcs12',
        body: file.buffer,
        keyPrefix: 'certificates',
        metadata: {
          kind: CERTIFICATE_KIND,
          clinicId,
        },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Falha ao gravar no storage.';
      throw new BadRequestException(detail);
    }

    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    try {
      const result = await prisma.$transaction(async (tx) => {
        const previous = await this.findActiveMany(tx, organizationId, clinicId);
        await tx.fileObject.updateMany({
          where: { id: { in: previous.map((item) => item.id) } },
          data: { status: 'REJECTED' },
        });
        const created = await tx.fileObject.create({
          data: {
            organizationId,
            bucket: stored.bucket,
            objectKey: stored.objectKey,
            originalName: file.originalname,
            mimeType: 'application/x-pkcs12',
            extension,
            sizeBytes: BigInt(file.size),
            checksum,
            status: 'AVAILABLE',
            antivirusStatus: 'NOT_APPLICABLE',
            encryption: json({ password: this.encrypt(password), algorithm: 'AES-256-GCM' }),
            createdById: actorId,
            metadata: json({
              clinicId,
              kind: CERTIFICATE_KIND,
              storageDriver: stored.driver,
              ...metadata,
            }),
          },
          select: { id: true },
        });
        await tx.auditEvent.create({
          data: {
            actorId,
            action: 'certificate.replaced',
            entity: 'FileObject',
            entityId: created.id,
            clinicId,
            changes: { checksum, storageDriver: stored.driver, ...metadata },
            correlationId: randomUUID(),
          },
        });
        return { created, previous };
      });
      await Promise.all(result.previous.map((item) => this.safeDelete(item.bucket, item.objectKey)));
      return this.status(organizationId, clinicId);
    } catch (error) {
      await this.safeDelete(stored.bucket, stored.objectKey);
      throw error;
    }
  }

  /**
   * Assina um payload com a chave privada do PKCS#12 armazenado.
   * Sem certificado válido/expirado → erro explícito (nunca simula sucesso).
   */
  async signWithA1(organizationId: string, clinicId: string, payload: string) {
    await this.assertClinic(organizationId, clinicId);
    const file = await this.findActive(organizationId, clinicId);
    if (!file) {
      throw new BadRequestException('Certificado A1 não configurado para esta clínica.');
    }
    const metadata = (file.metadata ?? {}) as Record<string, unknown>;
    const validTo = metadata.validTo ? new Date(String(metadata.validTo)) : null;
    if (validTo && Number.isFinite(validTo.getTime()) && validTo.getTime() < Date.now()) {
      throw new BadRequestException('Certificado A1 expirado. Faça o upload de um certificado válido.');
    }

    const encryption = await prisma.fileObject.findFirst({
      where: { id: file.id },
      select: { encryption: true, objectKey: true, bucket: true },
    });
    if (!encryption) throw new BadRequestException('Certificado A1 não encontrado no armazenamento.');
    const enc = (encryption.encryption ?? {}) as { password?: string };
    if (!enc.password) throw new BadRequestException('Senha do certificado A1 indisponível.');

    let buffer: Buffer;
    try {
      buffer = await this.storage.getObject(encryption.objectKey);
    } catch {
      if (encryption.bucket === 'certificates') {
        const { readFile } = await import('node:fs/promises');
        buffer = await readFile(resolve(LEGACY_CERTIFICATE_ROOT, encryption.objectKey)).catch(() => {
          throw new BadRequestException('Arquivo do certificado A1 inacessível no storage.');
        });
      } else {
        throw new BadRequestException('Arquivo do certificado A1 inacessível no storage.');
      }
    }

    const password = this.decrypt(enc.password);
    try {
      const asn1 = forge.asn1.fromDer(buffer.toString('binary'), false);
      const store = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
      const keyBagOid = forge.pki.oids.pkcs8ShroudedKeyBag as string;
      const certBagOid = forge.pki.oids.certBag as string;
      const keyBags = store.getBags({ bagType: keyBagOid })[keyBagOid] ?? [];
      const certBags = store.getBags({ bagType: certBagOid })[certBagOid] ?? [];
      const privateKey = keyBags.find((bag: { key?: forge.pki.PrivateKey }) => bag.key)?.key;
      const certificate = certBags.find((bag: { cert?: forge.pki.Certificate }) => bag.cert)?.cert;
      if (!privateKey || !certificate) {
        throw new Error('Chave ou certificado ausente no PKCS#12');
      }
      const md = forge.md.sha256.create();
      md.update(payload, 'utf8');
      const signature = forge.util.encode64((privateKey as forge.pki.rsa.PrivateKey).sign(md));
      return {
        algorithm: 'SHA256withRSA',
        signature,
        subject: String(metadata.subject ?? ''),
        serialNumber: String(metadata.serialNumber ?? certificate.serialNumber),
        validTo: metadata.validTo ? String(metadata.validTo) : certificate.validity.notAfter.toISOString(),
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Não foi possível assinar com o certificado A1 armazenado.');
    }
  }

  async remove(organizationId: string, clinicId: string, actorId: string) {
    await this.assertClinic(organizationId, clinicId);
    const files = await this.findActiveMany(prisma, organizationId, clinicId);
    if (!files.length) throw new NotFoundException('Certificado não encontrado.');
    await prisma.$transaction([
      prisma.fileObject.updateMany({
        where: { id: { in: files.map((item) => item.id) } },
        data: { status: 'REJECTED' },
      }),
      prisma.auditEvent.create({
        data: {
          actorId,
          action: 'certificate.removed',
          entity: 'FileObject',
          clinicId,
          changes: { removed: true },
          correlationId: randomUUID(),
        },
      }),
    ]);
    await Promise.all(files.map((item) => this.safeDelete(item.bucket, item.objectKey)));
    return { success: true };
  }

  private async findActive(organizationId: string, clinicId: string) {
    const rows = await this.findActiveMany(prisma, organizationId, clinicId);
    return rows[0] ?? null;
  }

  private findActiveMany(
    client: { fileObject: { findMany: typeof prisma.fileObject.findMany } },
    organizationId: string,
    clinicId: string,
  ) {
    return client.fileObject.findMany({
      where: {
        organizationId,
        status: 'AVAILABLE',
        OR: [
          {
            AND: [
              { metadata: { path: ['clinicId'], equals: clinicId } },
              { metadata: { path: ['kind'], equals: CERTIFICATE_KIND } },
            ],
          },
          {
            bucket: 'certificates',
            metadata: { path: ['clinicId'], equals: clinicId },
          },
        ],
      },
      select: { id: true, bucket: true, objectKey: true, metadata: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async safeDelete(bucket: string, objectKey: string) {
    try {
      if (this.storage.enabled) {
        await this.storage.deleteObject(objectKey);
      }
    } catch {
      // fallback legado: objetos gravados em .data/certificates antes do adapter unificado
    }
    if (bucket === 'certificates') {
      await rm(resolve(LEGACY_CERTIFICATE_ROOT, objectKey), { force: true }).catch(() => undefined);
    }
  }

  private encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
  }

  private decrypt(payload: string) {
    const [ivPart, tagPart, dataPart] = payload.split('.');
    if (!ivPart || !tagPart || !dataPart) throw new BadRequestException('Criptografia do certificado inválida.');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivPart, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
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
