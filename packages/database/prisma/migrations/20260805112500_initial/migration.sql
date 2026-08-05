-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EntityStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('NIBO', 'ABACATEPAY', 'EVOLUTION', 'CHATWOOT', 'GOOGLE_CALENDAR', 'OPENAI');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'DISABLED', 'ERROR');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ClinicalEntryStatus" AS ENUM ('DRAFT', 'SIGNED', 'CORRECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TreatmentStatus" AS ENUM ('DRAFT', 'PRESENTED', 'PARTIALLY_APPROVED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ToothFindingStatus" AS ENUM ('EXISTING', 'PLANNED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'GENERATED', 'PARTIALLY_SIGNED', 'SIGNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING', 'UPLOADED', 'SCANNING', 'AVAILABLE', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReceivableStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REFUNDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('FORECASTED', 'GENERATED', 'RELEASED', 'PAID', 'REVERSED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "taxId" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Cuiaba',
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clinic" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "taxId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "settingsJson" JSONB NOT NULL DEFAULT '{}',
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Cuiaba',
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chair" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#176B5B',
    "isSchedulingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Chair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Professional" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT,
    "croNumber" TEXT,
    "croState" TEXT,
    "professionalType" TEXT NOT NULL DEFAULT 'DENTIST',
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Professional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "preferredName" TEXT,
    "cpf" TEXT,
    "passportNumber" TEXT,
    "birthDate" DATE,
    "email" TEXT,
    "primaryPhone" TEXT NOT NULL,
    "secondaryPhone" TEXT,
    "isMinor" BOOLEAN NOT NULL DEFAULT false,
    "status" "PatientStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientClinic" (
    "patientId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "internalCode" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "PatientClinic_pkey" PRIMARY KEY ("patientId","clinicId")
);

-- CreateTable
CREATE TABLE "Guardian" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "relationship" TEXT NOT NULL,

    CONSTRAINT "Guardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientGuardian" (
    "patientId" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "isLegalGuardian" BOOLEAN NOT NULL DEFAULT true,
    "canSign" BOOLEAN NOT NULL DEFAULT true,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PatientGuardian_pkey" PRIMARY KEY ("patientId","guardianId")
);

-- CreateTable
CREATE TABLE "PatientAlert" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PatientAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "chairId" UUID,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "source" TEXT NOT NULL DEFAULT 'INTERNAL',
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "scopeType" TEXT NOT NULL DEFAULT 'CLINIC',
    "scopeId" UUID NOT NULL,
    "encryptedCredentials" TEXT,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "status" "IntegrationStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationJob" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookReceipt" (
    "id" UUID NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "eventId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "WebhookReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "clinicId" UUID,
    "changes" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "correlationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalRecord" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalEntry" (
    "id" UUID NOT NULL,
    "clinicalRecordId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "appointmentId" UUID,
    "treatmentId" UUID,
    "type" TEXT NOT NULL,
    "structuredData" JSONB NOT NULL DEFAULT '{}',
    "renderedText" TEXT NOT NULL,
    "clinicalDate" TIMESTAMP(3) NOT NULL,
    "status" "ClinicalEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "signedAt" TIMESTAMP(3),
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalEntryCorrection" (
    "id" UUID NOT NULL,
    "clinicalEntryId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "correctedContent" JSONB NOT NULL,
    "signatureHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalEntryCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateClinicalNote" (
    "id" UUID NOT NULL,
    "clinicalRecordId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivateClinicalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnamnesisTemplate" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "schemaJson" JSONB NOT NULL,
    "validityMonths" INTEGER NOT NULL DEFAULT 6,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnamnesisTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnamnesisResponse" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "alerts" JSONB NOT NULL DEFAULT '[]',
    "completedById" UUID NOT NULL,
    "signedById" UUID,
    "signedAt" TIMESTAMP(3),
    "validUntil" DATE NOT NULL,
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnamnesisResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Odontogram" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "dentitionType" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Odontogram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OdontogramCondition" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "icon" TEXT,
    "rules" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "OdontogramCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToothFinding" (
    "id" UUID NOT NULL,
    "odontogramId" UUID NOT NULL,
    "conditionId" UUID NOT NULL,
    "toothFdi" TEXT NOT NULL,
    "face" TEXT,
    "status" "ToothFindingStatus" NOT NULL DEFAULT 'EXISTING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToothFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Procedure" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "internalCode" TEXT NOT NULL,
    "tussCode" TEXT,
    "name" TEXT NOT NULL,
    "specialty" TEXT,
    "defaultDuration" INTEGER NOT NULL,
    "defaultSessions" INTEGER NOT NULL DEFAULT 1,
    "requiresTooth" BOOLEAN NOT NULL DEFAULT false,
    "requiresFace" BOOLEAN NOT NULL DEFAULT false,
    "requiresConsent" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Procedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceTable" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" DATE NOT NULL,
    "validUntil" DATE,

    CONSTRAINT "PriceTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceTableItem" (
    "id" UUID NOT NULL,
    "priceTableId" UUID NOT NULL,
    "procedureId" UUID NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountRules" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "PriceTableItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentPlan" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "status" "TreatmentStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "presentedAt" TIMESTAMP(3),
    "validUntil" DATE,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "priceSnapshot" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentItem" (
    "id" UUID NOT NULL,
    "treatmentPlanId" UUID NOT NULL,
    "procedureId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "toothFdi" TEXT,
    "face" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "plannedSessions" INTEGER NOT NULL DEFAULT 1,
    "estimatedMinutes" INTEGER,
    "materialCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "laboratoryCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "warrantyDays" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "TreatmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentSession" (
    "id" UUID NOT NULL,
    "treatmentItemId" UUID NOT NULL,
    "appointmentId" UUID,
    "professionalId" UUID NOT NULL,
    "executionNotes" TEXT NOT NULL,
    "materials" JSONB NOT NULL DEFAULT '[]',
    "complications" TEXT,
    "patientSignatureHash" TEXT,
    "professionalSignatureHash" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreatmentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "structuredContent" JSONB NOT NULL,
    "allowedVariables" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "signatureRules" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedDocument" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "patientId" UUID NOT NULL,
    "treatmentId" UUID,
    "frozenContent" JSONB NOT NULL,
    "fileId" UUID,
    "contentHash" TEXT NOT NULL,
    "validationCode" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'GENERATED',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,

    CONSTRAINT "GeneratedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSignature" (
    "id" UUID NOT NULL,
    "generatedDocumentId" UUID NOT NULL,
    "signerId" TEXT,
    "signerName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "signedHash" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileObject" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extension" TEXT,
    "sizeBytes" BIGINT NOT NULL,
    "checksum" TEXT,
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING',
    "antivirusStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "encryption" JSONB NOT NULL DEFAULT '{}',
    "createdById" UUID NOT NULL,
    "retentionUntil" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientMedia" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "toothFdi" TEXT,
    "appointmentId" UUID,
    "treatmentId" UUID,
    "examDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageAnnotation" (
    "id" UUID NOT NULL,
    "patientMediaId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "coordinates" JSONB NOT NULL,
    "text" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receivable" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "treatmentId" UUID,
    "description" TEXT NOT NULL,
    "originalAmount" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "surcharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(12,2) NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "ReceivableStatus" NOT NULL DEFAULT 'OPEN',
    "paymentMethod" TEXT,
    "provider" "IntegrationProvider",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "receivableId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "method" TEXT NOT NULL,
    "provider" "IntegrationProvider",
    "externalId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "authorizedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "dueDate" DATE NOT NULL,
    "paidAt" TIMESTAMP(3),
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialReconciliation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "summary" JSONB NOT NULL DEFAULT '{}',
    "divergences" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "FinancialReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID,
    "professionalId" UUID,
    "procedureId" UUID,
    "specialty" TEXT,
    "basis" TEXT NOT NULL,
    "calculationType" TEXT NOT NULL,
    "value" DECIMAL(12,4) NOT NULL,
    "deductions" JSONB NOT NULL DEFAULT '{}',
    "reversalBehavior" TEXT NOT NULL DEFAULT 'REVERSE',
    "validFrom" DATE NOT NULL,
    "validUntil" DATE,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionEntry" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "treatmentItemId" UUID,
    "paymentId" UUID,
    "triggeringEvent" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "baseAmount" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'FORECASTED',
    "competence" DATE NOT NULL,
    "closingId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionClosing" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionClosing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingChannel" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID,
    "unitId" UUID,
    "professionalId" UUID,
    "type" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "encryptedCredentials" TEXT,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessagingChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "requiresConsent" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageDelivery" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "patientId" UUID,
    "appointmentId" UUID,
    "channelId" UUID NOT NULL,
    "templateId" UUID,
    "recipient" TEXT NOT NULL,
    "renderedContent" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "externalId" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationPreference" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "optedIn" BOOLEAN NOT NULL DEFAULT true,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,

    CONSTRAINT "CommunicationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "action" JSONB NOT NULL,
    "allowedHours" JSONB NOT NULL DEFAULT '{}',
    "frequency" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "clinicalWarnings" JSONB NOT NULL DEFAULT '[]',
    "ignoredWarnings" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "aiMetadata" JSONB,
    "contentHash" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_taxId_key" ON "Organization"("taxId");

-- CreateIndex
CREATE INDEX "Clinic_organizationId_idx" ON "Clinic"("organizationId");

-- CreateIndex
CREATE INDEX "Unit_clinicId_idx" ON "Unit"("clinicId");

-- CreateIndex
CREATE INDEX "Chair_unitId_idx" ON "Chair"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "User_organizationId_email_key" ON "User"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_code_key" ON "Role"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Professional_userId_key" ON "Professional"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Professional_cpf_key" ON "Professional"("cpf");

-- CreateIndex
CREATE INDEX "Patient_organizationId_fullName_idx" ON "Patient"("organizationId", "fullName");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_organizationId_cpf_key" ON "Patient"("organizationId", "cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_organizationId_passportNumber_key" ON "Patient"("organizationId", "passportNumber");

-- CreateIndex
CREATE INDEX "Appointment_organizationId_startAt_idx" ON "Appointment"("organizationId", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_professionalId_startAt_endAt_idx" ON "Appointment"("professionalId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "Appointment_chairId_startAt_endAt_idx" ON "Appointment"("chairId", "startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_clinicId_provider_scopeType_scopeId_key" ON "IntegrationConnection"("clinicId", "provider", "scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "OutboxEvent_processedAt_createdAt_idx" ON "OutboxEvent"("processedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookReceipt_provider_eventId_key" ON "WebhookReceipt"("provider", "eventId");

-- CreateIndex
CREATE INDEX "AuditEvent_clinicId_createdAt_idx" ON "AuditEvent"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entity_entityId_idx" ON "AuditEvent"("entity", "entityId");

-- CreateIndex
CREATE INDEX "ClinicalRecord_organizationId_patientId_idx" ON "ClinicalRecord"("organizationId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalRecord_clinicId_patientId_key" ON "ClinicalRecord"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "ClinicalEntry_clinicalRecordId_clinicalDate_idx" ON "ClinicalEntry"("clinicalRecordId", "clinicalDate");

-- CreateIndex
CREATE INDEX "ClinicalEntryCorrection_clinicalEntryId_createdAt_idx" ON "ClinicalEntryCorrection"("clinicalEntryId", "createdAt");

-- CreateIndex
CREATE INDEX "PrivateClinicalNote_clinicalRecordId_createdAt_idx" ON "PrivateClinicalNote"("clinicalRecordId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnamnesisTemplate_organizationId_name_version_key" ON "AnamnesisTemplate"("organizationId", "name", "version");

-- CreateIndex
CREATE INDEX "AnamnesisResponse_organizationId_patientId_createdAt_idx" ON "AnamnesisResponse"("organizationId", "patientId", "createdAt");

-- CreateIndex
CREATE INDEX "Odontogram_organizationId_patientId_recordedAt_idx" ON "Odontogram"("organizationId", "patientId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OdontogramCondition_organizationId_code_key" ON "OdontogramCondition"("organizationId", "code");

-- CreateIndex
CREATE INDEX "ToothFinding_odontogramId_toothFdi_idx" ON "ToothFinding"("odontogramId", "toothFdi");

-- CreateIndex
CREATE UNIQUE INDEX "Procedure_organizationId_internalCode_key" ON "Procedure"("organizationId", "internalCode");

-- CreateIndex
CREATE INDEX "PriceTable_organizationId_active_idx" ON "PriceTable"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PriceTableItem_priceTableId_procedureId_key" ON "PriceTableItem"("priceTableId", "procedureId");

-- CreateIndex
CREATE INDEX "TreatmentPlan_organizationId_clinicId_patientId_idx" ON "TreatmentPlan"("organizationId", "clinicId", "patientId");

-- CreateIndex
CREATE INDEX "TreatmentItem_treatmentPlanId_sortOrder_idx" ON "TreatmentItem"("treatmentPlanId", "sortOrder");

-- CreateIndex
CREATE INDEX "TreatmentSession_treatmentItemId_completedAt_idx" ON "TreatmentSession"("treatmentItemId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_organizationId_name_version_key" ON "DocumentTemplate"("organizationId", "name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedDocument_validationCode_key" ON "GeneratedDocument"("validationCode");

-- CreateIndex
CREATE INDEX "GeneratedDocument_organizationId_patientId_generatedAt_idx" ON "GeneratedDocument"("organizationId", "patientId", "generatedAt");

-- CreateIndex
CREATE INDEX "DocumentSignature_generatedDocumentId_signedAt_idx" ON "DocumentSignature"("generatedDocumentId", "signedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FileObject_objectKey_key" ON "FileObject"("objectKey");

-- CreateIndex
CREATE INDEX "FileObject_organizationId_status_idx" ON "FileObject"("organizationId", "status");

-- CreateIndex
CREATE INDEX "PatientMedia_organizationId_patientId_createdAt_idx" ON "PatientMedia"("organizationId", "patientId", "createdAt");

-- CreateIndex
CREATE INDEX "ImageAnnotation_patientMediaId_version_idx" ON "ImageAnnotation"("patientMediaId", "version");

-- CreateIndex
CREATE INDEX "Receivable_organizationId_clinicId_dueDate_status_idx" ON "Receivable"("organizationId", "clinicId", "dueDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_receivableId_status_idx" ON "Payment"("receivableId", "status");

-- CreateIndex
CREATE INDEX "Refund_paymentId_createdAt_idx" ON "Refund"("paymentId", "createdAt");

-- CreateIndex
CREATE INDEX "Expense_organizationId_clinicId_dueDate_idx" ON "Expense"("organizationId", "clinicId", "dueDate");

-- CreateIndex
CREATE INDEX "FinancialReconciliation_organizationId_clinicId_createdAt_idx" ON "FinancialReconciliation"("organizationId", "clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "CommissionRule_organizationId_active_priority_idx" ON "CommissionRule"("organizationId", "active", "priority");

-- CreateIndex
CREATE INDEX "CommissionEntry_organizationId_clinicId_professionalId_comp_idx" ON "CommissionEntry"("organizationId", "clinicId", "professionalId", "competence");

-- CreateIndex
CREATE INDEX "CommissionClosing_organizationId_clinicId_periodStart_idx" ON "CommissionClosing"("organizationId", "clinicId", "periodStart");

-- CreateIndex
CREATE INDEX "MessagingChannel_organizationId_status_idx" ON "MessagingChannel"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_organizationId_name_key" ON "MessageTemplate"("organizationId", "name");

-- CreateIndex
CREATE INDEX "MessageDelivery_organizationId_status_createdAt_idx" ON "MessageDelivery"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationPreference_organizationId_patientId_channel_ca_key" ON "CommunicationPreference"("organizationId", "patientId", "channel", "category");

-- CreateIndex
CREATE INDEX "AutomationRule_organizationId_active_trigger_idx" ON "AutomationRule"("organizationId", "active", "trigger");

-- CreateIndex
CREATE INDEX "Prescription_organizationId_patientId_createdAt_idx" ON "Prescription"("organizationId", "patientId", "createdAt");

-- AddForeignKey
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chair" ADD CONSTRAINT "Chair_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Professional" ADD CONSTRAINT "Professional_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientClinic" ADD CONSTRAINT "PatientClinic_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientClinic" ADD CONSTRAINT "PatientClinic_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientGuardian" ADD CONSTRAINT "PatientGuardian_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientGuardian" ADD CONSTRAINT "PatientGuardian_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAlert" ADD CONSTRAINT "PatientAlert_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_chairId_fkey" FOREIGN KEY ("chairId") REFERENCES "Chair"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationJob" ADD CONSTRAINT "IntegrationJob_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEntry" ADD CONSTRAINT "ClinicalEntry_clinicalRecordId_fkey" FOREIGN KEY ("clinicalRecordId") REFERENCES "ClinicalRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEntryCorrection" ADD CONSTRAINT "ClinicalEntryCorrection_clinicalEntryId_fkey" FOREIGN KEY ("clinicalEntryId") REFERENCES "ClinicalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateClinicalNote" ADD CONSTRAINT "PrivateClinicalNote_clinicalRecordId_fkey" FOREIGN KEY ("clinicalRecordId") REFERENCES "ClinicalRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnamnesisResponse" ADD CONSTRAINT "AnamnesisResponse_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AnamnesisTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToothFinding" ADD CONSTRAINT "ToothFinding_odontogramId_fkey" FOREIGN KEY ("odontogramId") REFERENCES "Odontogram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToothFinding" ADD CONSTRAINT "ToothFinding_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "OdontogramCondition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceTableItem" ADD CONSTRAINT "PriceTableItem_priceTableId_fkey" FOREIGN KEY ("priceTableId") REFERENCES "PriceTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceTableItem" ADD CONSTRAINT "PriceTableItem_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "Procedure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentItem" ADD CONSTRAINT "TreatmentItem_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "TreatmentPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentItem" ADD CONSTRAINT "TreatmentItem_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "Procedure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentSession" ADD CONSTRAINT "TreatmentSession_treatmentItemId_fkey" FOREIGN KEY ("treatmentItemId") REFERENCES "TreatmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSignature" ADD CONSTRAINT "DocumentSignature_generatedDocumentId_fkey" FOREIGN KEY ("generatedDocumentId") REFERENCES "GeneratedDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMedia" ADD CONSTRAINT "PatientMedia_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageAnnotation" ADD CONSTRAINT "ImageAnnotation_patientMediaId_fkey" FOREIGN KEY ("patientMediaId") REFERENCES "PatientMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_closingId_fkey" FOREIGN KEY ("closingId") REFERENCES "CommissionClosing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageDelivery" ADD CONSTRAINT "MessageDelivery_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "MessagingChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageDelivery" ADD CONSTRAINT "MessageDelivery_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
