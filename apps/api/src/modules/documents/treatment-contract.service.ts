import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, prisma } from '@sonder/database';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  buildServerFrozenContent,
  DEFAULT_PATIENT_FOLDERS,
  defaultFolderNameForTemplateType,
  hashDocumentContent,
} from '../operations/operations-documents.utils';
import {
  SYSTEM_CONTRACT_ALLOWED_VARIABLES,
  SYSTEM_CONTRACT_BODY,
  SYSTEM_CONTRACT_TEMPLATE_NAME,
} from './contract-template.defaults';
import { renderStructuredTemplate } from './template-renderer';
import {
  buildPaymentTerms,
  isTreatmentPaymentMethod,
  type PaymentProfile,
} from './payment-terms';

const json = (value: unknown) => value as Prisma.InputJsonValue;
const SOURCE_TYPE = 'TREATMENT_CONTRACT';

function formatCpf(value?: string | null): string {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length !== 11) return value?.trim() || 'não informado';
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatAddress(input: {
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}): string {
  const line = [
    [input.street, input.number].filter(Boolean).join(', '),
    input.complement,
    input.district,
    [input.city, input.state].filter(Boolean).join(' / '),
    input.postalCode ? `CEP ${input.postalCode}` : '',
  ].filter((part) => part && String(part).trim());
  return line.join(' — ') || 'não informado';
}

function formatDate(value?: Date | string | null): string {
  if (!value) return 'não informado';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'não informado';
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function moneyText(value: Prisma.Decimal | string | number): string {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function templatePaymentProfile(structured: unknown): PaymentProfile | null {
  if (!structured || typeof structured !== 'object' || Array.isArray(structured)) return null;
  const value = (structured as Record<string, unknown>).paymentProfile;
  if (value === 'CASH' || value === 'CARD' || value === 'INSTALLMENT') return value;
  return null;
}

@Injectable()
export class TreatmentContractService {
  async listTreatmentDocuments(organizationId: string, treatmentId: string) {
    const plan = await prisma.treatmentPlan.findFirst({
      where: { id: treatmentId, organizationId },
      select: { id: true },
    });
    if (!plan) throw new NotFoundException('Plano de tratamento não encontrado.');
    return prisma.generatedDocument.findMany({
      where: {
        organizationId,
        OR: [
          { treatmentId },
          { sourceType: SOURCE_TYPE, sourceId: treatmentId },
        ],
        archivedAt: null,
      },
      include: {
        template: { select: { id: true, name: true, type: true, signatureRules: true } },
        signatures: { orderBy: { signedAt: 'asc' } },
        signatureRequests: { orderBy: { createdAt: 'desc' } },
        folder: { select: { id: true, name: true } },
      },
      orderBy: { generatedAt: 'desc' },
    });
  }

  async ensureTreatmentContract(input: {
    organizationId: string;
    actorId?: string;
    treatmentId: string;
    paymentMethod: string;
    installments?: number;
    dueDate?: Date;
  }) {
    const plan = await prisma.treatmentPlan.findFirst({
      where: { id: input.treatmentId, organizationId: input.organizationId },
      include: {
        items: { include: { procedure: true }, orderBy: { sortOrder: 'asc' } },
        receivables: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!plan) throw new NotFoundException('Plano de tratamento não encontrado.');
    if (plan.status !== 'APPROVED') {
      throw new ConflictException('O contrato só é gerado após a aprovação integral do plano.');
    }

    const existing = await prisma.generatedDocument.findFirst({
      where: {
        organizationId: input.organizationId,
        sourceType: SOURCE_TYPE,
        sourceId: plan.id,
        sourceVersion: plan.version,
        status: { not: 'CANCELLED' },
      },
    });
    if (existing) return this.hydrate(existing.id);

    const paymentMethod = isTreatmentPaymentMethod(input.paymentMethod)
      ? input.paymentMethod
      : (plan.receivables[0]?.paymentMethod && isTreatmentPaymentMethod(plan.receivables[0].paymentMethod)
        ? plan.receivables[0].paymentMethod
        : 'OTHER');
    const installments = Math.min(24, Math.max(1, Math.floor(input.installments ?? 1)));
    const dueDate = input.dueDate ?? plan.receivables[0]?.dueDate ?? new Date();

    const approvedItems = plan.items.filter((item) => (
      item.status !== 'CANCELLED' && ['APPROVED', 'IN_PROGRESS', 'COMPLETED'].includes(item.status)
    ));
    if (!approvedItems.length) {
      throw new ConflictException('Não há procedimentos aprovados para gerar o contrato.');
    }

    const [patient, professional, clinic] = await Promise.all([
      prisma.patient.findFirst({
        where: { id: plan.patientId, organizationId: input.organizationId },
        include: {
          guardians: {
            include: { guardian: true },
            orderBy: [{ isPrimary: 'desc' }, { isLegalGuardian: 'desc' }],
          },
        },
      }),
      prisma.professional.findFirst({
        where: { id: plan.professionalId },
        select: { id: true, name: true, croNumber: true, croState: true, cpf: true },
      }),
      prisma.clinic.findFirst({
        where: { id: plan.clinicId, organizationId: input.organizationId },
        select: { id: true, tradeName: true, legalName: true, taxId: true, phone: true, email: true, settingsJson: true },
      }),
    ]);
    if (!patient || !professional || !clinic) {
      throw new NotFoundException('Dados da clínica, paciente ou profissional indisponíveis.');
    }

    const legalGuardian = patient.guardians.find((row) => row.canSign && row.isLegalGuardian)
      ?? patient.guardians.find((row) => row.canSign)
      ?? null;
    const guardian = patient.isMinor ? legalGuardian?.guardian ?? null : null;
    const payment = buildPaymentTerms({
      paymentMethod,
      installments,
      total: approvedItems.reduce((sum, item) => sum + Number(item.total), 0),
      dueDate,
    });

    const unit = await prisma.unit.findFirst({
      where: { clinicId: clinic.id, status: 'ACTIVE' },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    const clinicAddress = unit?.name ? `Unidade ${unit.name}` : 'endereço da clínica cadastrado no sistema';

    const context = {
      clinic: {
        tradeName: clinic.tradeName,
        legalName: clinic.legalName,
        taxId: clinic.taxId || 'não informado',
        address: clinicAddress,
        phone: clinic.phone || 'não informado',
        email: clinic.email || 'não informado',
      },
      patient: {
        fullName: patient.fullName,
        cpf: formatCpf(patient.cpf),
        birthDate: formatDate(patient.birthDate),
        address: formatAddress(patient),
        phone: patient.primaryPhone,
        email: patient.email || 'não informado',
      },
      guardian: {
        name: guardian?.name ?? '',
        cpf: guardian?.cpf ? formatCpf(guardian.cpf) : '',
        relationship: guardian?.relationship ?? '',
      },
      professional: {
        name: professional.name,
        cro: professional.croNumber
          ? `CRO/${professional.croState ?? '??'} ${professional.croNumber}`
          : 'CRO não informado',
        cpf: formatCpf(professional.cpf),
      },
      treatment: {
        title: plan.title,
        createdAt: formatDate(plan.presentedAt ?? plan.createdAt),
        validUntil: formatDate(plan.validUntil),
        subtotal: moneyText(plan.subtotal),
        discount: moneyText(plan.discount),
        total: moneyText(approvedItems.reduce((sum, item) => sum + Number(item.total), 0)),
        notes: plan.notes?.trim() || 'nenhuma observação adicional',
        items: approvedItems.map((item) => ({
          procedureName: item.procedure.name,
          toothFdi: item.toothFdi ?? '',
          face: item.face ?? '',
          quantity: String(item.quantity),
          plannedSessions: String(item.plannedSessions),
          unitPrice: moneyText(item.unitPrice),
          discount: moneyText(item.discount),
          total: moneyText(item.total),
        })),
      },
      payment,
    };

    const template = await this.resolveTemplate(input.organizationId, payment.profile);
    const structured = (template.structuredContent ?? {}) as Record<string, unknown>;
    const rendered = renderStructuredTemplate(structured, context);
    const generatedAt = new Date();
    const frozenContent = buildServerFrozenContent({
      clinicalContent: {
        titulo: rendered.title || template.name,
        corpo: rendered.body,
        renderedText: rendered.renderedText,
        renderedHtml: rendered.renderedHtml,
        payment: {
          profile: payment.profile,
          method: payment.method,
          summary: payment.summary,
          installments: payment.installments,
        },
        treatmentSnapshot: {
          treatmentId: plan.id,
          version: plan.version,
          title: plan.title,
          validUntil: plan.validUntil?.toISOString() ?? null,
          items: context.treatment.items,
          subtotal: context.treatment.subtotal,
          discount: context.treatment.discount,
          total: context.treatment.total,
          notes: plan.notes,
        },
      },
      patient,
      professional,
      clinic,
      template: { id: template.id, name: template.name, type: template.type, version: template.version },
      generatedAt,
    });
    const contentHash = hashDocumentContent(frozenContent);
    const folderId = await this.resolveFolder(input.organizationId, plan.patientId, template.type);

    await this.supersedeUnsigned(input.organizationId, plan.id, plan.version, input.actorId);

    try {
      const created = await prisma.$transaction(async (tx) => {
        const document = await tx.generatedDocument.create({
          data: {
            organizationId: input.organizationId,
            clinicId: plan.clinicId,
            templateId: template.id,
            templateVersion: template.version,
            patientId: plan.patientId,
            professionalId: professional.id,
            treatmentId: plan.id,
            folderId,
            generatedById: input.actorId,
            frozenContent: json(frozenContent),
            contentHash,
            validationCode: randomBytes(18).toString('base64url'),
            status: 'GENERATED',
            generatedAt,
            sourceType: SOURCE_TYPE,
            sourceId: plan.id,
            sourceVersion: plan.version,
          },
        });
        await tx.documentEvent.create({
          data: {
            generatedDocumentId: document.id,
            type: 'DOCUMENT_GENERATED',
            actorId: input.actorId,
            payload: json({
              sourceType: SOURCE_TYPE,
              sourceId: plan.id,
              sourceVersion: plan.version,
              paymentMethod,
              installments,
              contentHash,
            }),
          },
        });
        await tx.auditEvent.create({
          data: {
            actorId: input.actorId,
            action: 'document.generated',
            entity: 'GeneratedDocument',
            entityId: document.id,
            clinicId: plan.clinicId,
            changes: json({
              type: 'CONTRACT',
              treatmentId: plan.id,
              version: plan.version,
              paymentMethod,
              installments,
            }),
            correlationId: randomUUID(),
          },
        });
        return document;
      });
      return this.hydrate(created.id);
    } catch (error) {
      const duplicated = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      const uniqueRace = error instanceof Error && /GeneratedDocument_source_active_key|unique/i.test(error.message);
      if (duplicated || uniqueRace) {
        const raced = await prisma.generatedDocument.findFirst({
          where: {
            organizationId: input.organizationId,
            sourceType: SOURCE_TYPE,
            sourceId: plan.id,
            sourceVersion: plan.version,
            status: { not: 'CANCELLED' },
          },
        });
        if (raced) return this.hydrate(raced.id);
      }
      throw error;
    }
  }

  private async hydrate(id: string) {
    return prisma.generatedDocument.findUniqueOrThrow({
      where: { id },
      include: {
        template: true,
        signatures: { orderBy: { signedAt: 'asc' } },
        signatureRequests: { orderBy: { createdAt: 'desc' } },
        folder: true,
      },
    });
  }

  private async supersedeUnsigned(
    organizationId: string,
    treatmentId: string,
    currentVersion: number,
    actorId?: string,
  ) {
    const previous = await prisma.generatedDocument.findMany({
      where: {
        organizationId,
        sourceType: SOURCE_TYPE,
        sourceId: treatmentId,
        sourceVersion: { not: currentVersion },
        status: { in: ['GENERATED', 'PARTIALLY_SIGNED'] },
      },
      select: { id: true, signatures: { select: { id: true } } },
    });
    const unsigned = previous.filter((doc) => doc.signatures.length === 0);
    if (!unsigned.length) return;
    await prisma.generatedDocument.updateMany({
      where: { id: { in: unsigned.map((doc) => doc.id) } },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: actorId,
        cancelReason: 'Substituído por nova versão do plano aprovado.',
      },
    });
  }

  private async resolveTemplate(organizationId: string, profile: PaymentProfile) {
    const published = await prisma.documentTemplate.findMany({
      where: { organizationId, type: 'CONTRACT', status: 'PUBLISHED', active: true },
      orderBy: [{ isSystem: 'asc' }, { publishedAt: 'desc' }],
    });
    const byProfile = published.find((row) => templatePaymentProfile(row.structuredContent) === profile);
    if (byProfile) return byProfile;
    const customGeneric = published.find((row) => !row.isSystem && !templatePaymentProfile(row.structuredContent));
    if (customGeneric) return customGeneric;
    const system = published.find((row) => row.isSystem);
    if (system) return system;
    return this.ensureSystemTemplate(organizationId);
  }

  private async ensureSystemTemplate(organizationId: string) {
    const existing = await prisma.documentTemplate.findFirst({
      where: { organizationId, type: 'CONTRACT', isSystem: true },
      orderBy: { version: 'desc' },
    });
    if (existing?.status === 'PUBLISHED' && existing.active) return existing;
    if (existing) {
      return prisma.documentTemplate.update({
        where: { id: existing.id },
        data: {
          status: 'PUBLISHED',
          active: true,
          publishedAt: new Date(),
          structuredContent: json({
            title: SYSTEM_CONTRACT_TEMPLATE_NAME,
            header: '',
            body: SYSTEM_CONTRACT_BODY,
            footer: 'Documento eletrônico. Valide a autenticidade pelo QR Code. Redação-base do sistema; revise juridicamente antes de usar em produção.',
            signature: '{{professional.name}} — {{professional.cro}}',
          }),
          allowedVariables: json([...SYSTEM_CONTRACT_ALLOWED_VARIABLES]),
          signatureRules: json({
            requiredRoles: ['PATIENT', 'CLINIC'],
            minSignatures: 2,
            serviceProviderSigner: 'CLINIC',
          }),
        },
      });
    }
    return prisma.documentTemplate.create({
      data: {
        organizationId,
        type: 'CONTRACT',
        name: SYSTEM_CONTRACT_TEMPLATE_NAME,
        isSystem: true,
        status: 'PUBLISHED',
        active: true,
        version: 1,
        publishedAt: new Date(),
        structuredContent: json({
          title: SYSTEM_CONTRACT_TEMPLATE_NAME,
          header: '',
          body: SYSTEM_CONTRACT_BODY,
          footer: 'Documento eletrônico. Valide a autenticidade pelo QR Code. Redação-base do sistema; revise juridicamente antes de usar em produção.',
          signature: '{{professional.name}} — {{professional.cro}}',
        }),
        allowedVariables: json([...SYSTEM_CONTRACT_ALLOWED_VARIABLES]),
        signatureRules: json({
          requiredRoles: ['PATIENT', 'CLINIC'],
          minSignatures: 2,
          serviceProviderSigner: 'CLINIC',
        }),
      },
    });
  }

  private async resolveFolder(organizationId: string, patientId: string, templateType: string) {
    const existing = await prisma.patientDocumentFolder.findMany({
      where: { organizationId, patientId, archivedAt: null },
    });
    const existingNames = new Set(existing.map((folder) => folder.name));
    const missing = DEFAULT_PATIENT_FOLDERS.filter((folder) => !existingNames.has(folder.name));
    if (missing.length) {
      await prisma.patientDocumentFolder.createMany({
        data: missing.map((folder) => ({
          organizationId,
          patientId,
          name: folder.name,
          isSystem: true,
          sortOrder: folder.sortOrder,
        })),
        skipDuplicates: true,
      });
    }
    const folders = await prisma.patientDocumentFolder.findMany({
      where: { organizationId, patientId, archivedAt: null },
    });
    const preferred = defaultFolderNameForTemplateType(templateType);
    return folders.find((folder) => folder.name === preferred)?.id
      ?? folders.find((folder) => folder.name === 'Contratos')?.id
      ?? folders[0]?.id;
  }
}

export { SOURCE_TYPE as TREATMENT_CONTRACT_SOURCE_TYPE };
