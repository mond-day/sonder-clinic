-- Sonder Clinic 1.1.0 — migrações aditivas (preserva dados existentes)

CREATE TYPE "AnamnesisTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "AnamnesisResponseStatus" AS ENUM ('DRAFT', 'AWAITING_SIGNATURE', 'SIGNED', 'EXPIRED', 'SUPERSEDED');
CREATE TYPE "AnamnesisSignatureRole" AS ENUM ('PATIENT', 'GUARDIAN', 'PROFESSIONAL');
CREATE TYPE "SignatureMethod" AS ENUM ('DRAWN', 'REMOTE_LINK', 'A1', 'REMOTE', 'MOCK_A1');
CREATE TYPE "ClinicalCorrectionKind" AS ENUM ('ADDENDUM', 'CORRECTION');
CREATE TYPE "PayableStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');
CREATE TYPE "UserInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "UserInvitation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "UserInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedById" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserInvitation_tokenHash_key" ON "UserInvitation"("tokenHash");
CREATE INDEX "UserInvitation_organizationId_email_status_idx" ON "UserInvitation"("organizationId", "email", "status");
ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AppointmentStatusEvent" (
    "id" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "previousStatus" "AppointmentStatus",
    "nextStatus" "AppointmentStatus" NOT NULL,
    "reasonCode" TEXT,
    "reasonText" TEXT,
    "previousStartAt" TIMESTAMP(3),
    "nextStartAt" TIMESTAMP(3),
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppointmentStatusEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AppointmentStatusEvent_appointmentId_createdAt_idx" ON "AppointmentStatusEvent"("appointmentId", "createdAt");
ALTER TABLE "AppointmentStatusEvent" ADD CONSTRAINT "AppointmentStatusEvent_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "appointmentId" UUID;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "receivableId" UUID;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "labCaseId" UUID;

CREATE TABLE "TaskChecklistItem" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "completedById" UUID,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "TaskChecklistItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TaskChecklistItem_taskId_sortOrder_idx" ON "TaskChecklistItem"("taskId", "sortOrder");
ALTER TABLE "TaskChecklistItem" ADD CONSTRAINT "TaskChecklistItem_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TaskParticipant" (
    "taskId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    CONSTRAINT "TaskParticipant_pkey" PRIMARY KEY ("taskId", "userId")
);
ALTER TABLE "TaskParticipant" ADD CONSTRAINT "TaskParticipant_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TaskComment" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TaskComment_taskId_createdAt_idx" ON "TaskComment"("taskId", "createdAt");
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TaskAttachment" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TaskAttachment_taskId_createdAt_idx" ON "TaskAttachment"("taskId", "createdAt");
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TaskRecurrence" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "frequency" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "endsAt" TIMESTAMP(3),
    "nextOccurrence" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "TaskRecurrence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TaskRecurrence_taskId_key" ON "TaskRecurrence"("taskId");
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Laboratory" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "addressJson" JSONB NOT NULL DEFAULT '{}',
    "specialties" JSONB NOT NULL DEFAULT '[]',
    "defaultLeadDays" INTEGER,
    "pricingJson" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Laboratory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Laboratory_organizationId_status_idx" ON "Laboratory"("organizationId", "status");
ALTER TABLE "Laboratory" ADD CONSTRAINT "Laboratory_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Laboratory" ADD CONSTRAINT "Laboratory_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LabCase" ADD COLUMN IF NOT EXISTS "laboratoryId" UUID;
ALTER TABLE "LabCase" ADD COLUMN IF NOT EXISTS "detailedStage" TEXT NOT NULL DEFAULT 'REQUEST_CREATED';
ALTER TABLE "LabCase" ADD CONSTRAINT "LabCase_laboratoryId_fkey"
  FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "LabCaseStageEvent" (
    "id" UUID NOT NULL,
    "labCaseId" UUID NOT NULL,
    "stage" TEXT NOT NULL,
    "notes" TEXT,
    "trackingCode" TEXT,
    "actorId" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "LabCaseStageEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LabCaseStageEvent_labCaseId_occurredAt_idx" ON "LabCaseStageEvent"("labCaseId", "occurredAt");
ALTER TABLE "LabCaseStageEvent" ADD CONSTRAINT "LabCaseStageEvent_labCaseId_fkey"
  FOREIGN KEY ("labCaseId") REFERENCES "LabCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LabCaseAttachment" (
    "id" UUID NOT NULL,
    "labCaseId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "label" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'DOCUMENT',
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LabCaseAttachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LabCaseAttachment_labCaseId_createdAt_idx" ON "LabCaseAttachment"("labCaseId", "createdAt");
ALTER TABLE "LabCaseAttachment" ADD CONSTRAINT "LabCaseAttachment_labCaseId_fkey"
  FOREIGN KEY ("labCaseId") REFERENCES "LabCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClinicalEntry" ADD COLUMN IF NOT EXISTS "treatmentItemId" UUID;
ALTER TABLE "ClinicalEntry" ADD COLUMN IF NOT EXISTS "treatmentSessionId" UUID;
ALTER TABLE "ClinicalEntry" ADD COLUMN IF NOT EXISTS "toothFdi" TEXT;
ALTER TABLE "ClinicalEntry" ADD COLUMN IF NOT EXISTS "region" TEXT;
ALTER TABLE "ClinicalEntry" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS "ClinicalEntry_treatmentItemId_clinicalDate_idx" ON "ClinicalEntry"("treatmentItemId", "clinicalDate");
CREATE INDEX IF NOT EXISTS "ClinicalEntry_appointmentId_idx" ON "ClinicalEntry"("appointmentId");

ALTER TABLE "ClinicalEntryCorrection" ADD COLUMN IF NOT EXISTS "kind" "ClinicalCorrectionKind" NOT NULL DEFAULT 'ADDENDUM';
ALTER TABLE "ClinicalEntryCorrection" ADD COLUMN IF NOT EXISTS "renderedText" TEXT;

CREATE TABLE "ClinicalEntryAttachment" (
    "id" UUID NOT NULL,
    "clinicalEntryId" UUID NOT NULL,
    "patientMediaId" UUID NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClinicalEntryAttachment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClinicalEntryAttachment_clinicalEntryId_patientMediaId_key"
  ON "ClinicalEntryAttachment"("clinicalEntryId", "patientMediaId");
ALTER TABLE "ClinicalEntryAttachment" ADD CONSTRAINT "ClinicalEntryAttachment_clinicalEntryId_fkey"
  FOREIGN KEY ("clinicalEntryId") REFERENCES "ClinicalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnamnesisTemplate" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "AnamnesisTemplate" ADD COLUMN IF NOT EXISTS "status" "AnamnesisTemplateStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "AnamnesisTemplate" ADD COLUMN IF NOT EXISTS "isSystemDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AnamnesisTemplate" ADD COLUMN IF NOT EXISTS "sourceTemplateId" UUID;
ALTER TABLE "AnamnesisTemplate" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "AnamnesisTemplate" ADD COLUMN IF NOT EXISTS "publishedById" UUID;
ALTER TABLE "AnamnesisTemplate" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);
ALTER TABLE "AnamnesisTemplate" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "AnamnesisTemplate" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS "AnamnesisTemplate_organizationId_audience_status_idx"
  ON "AnamnesisTemplate"("organizationId", "audience", "status");
UPDATE "AnamnesisTemplate" SET "status" = 'PUBLISHED', "publishedAt" = COALESCE("publishedAt", "createdAt"), "isSystemDefault" = true
  WHERE "active" = true AND "status" = 'DRAFT';

ALTER TABLE "AnamnesisResponse" ADD COLUMN IF NOT EXISTS "status" "AnamnesisResponseStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "AnamnesisResponse" ADD COLUMN IF NOT EXISTS "riskAssessment" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "AnamnesisResponse" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "AnamnesisResponse" ADD COLUMN IF NOT EXISTS "supersededById" UUID;
ALTER TABLE "AnamnesisResponse" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AnamnesisResponse" ALTER COLUMN "validUntil" DROP NOT NULL;
UPDATE "AnamnesisResponse" SET "status" = 'SIGNED', "completedAt" = COALESCE("signedAt", "createdAt")
  WHERE "signedAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "AnamnesisResponse_organizationId_status_createdAt_idx"
  ON "AnamnesisResponse"("organizationId", "status", "createdAt");

CREATE TABLE "AnamnesisSignature" (
    "id" UUID NOT NULL,
    "anamnesisResponseId" UUID NOT NULL,
    "signerId" UUID,
    "signerName" TEXT NOT NULL,
    "signerRole" "AnamnesisSignatureRole" NOT NULL,
    "method" "SignatureMethod" NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "signedHash" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnamnesisSignature_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AnamnesisSignature_anamnesisResponseId_signedAt_idx"
  ON "AnamnesisSignature"("anamnesisResponseId", "signedAt");
ALTER TABLE "AnamnesisSignature" ADD CONSTRAINT "AnamnesisSignature_anamnesisResponseId_fkey"
  FOREIGN KEY ("anamnesisResponseId") REFERENCES "AnamnesisResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AnamnesisSignatureRequest" (
    "id" UUID NOT NULL,
    "anamnesisResponseId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "signerRole" "AnamnesisSignatureRole" NOT NULL,
    "signerName" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnamnesisSignatureRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AnamnesisSignatureRequest_tokenHash_key" ON "AnamnesisSignatureRequest"("tokenHash");
CREATE INDEX "AnamnesisSignatureRequest_anamnesisResponseId_expiresAt_idx"
  ON "AnamnesisSignatureRequest"("anamnesisResponseId", "expiresAt");
ALTER TABLE "AnamnesisSignatureRequest" ADD CONSTRAINT "AnamnesisSignatureRequest_anamnesisResponseId_fkey"
  FOREIGN KEY ("anamnesisResponseId") REFERENCES "AnamnesisResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FinanceCategory" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinanceCategory_organizationId_name_kind_key" ON "FinanceCategory"("organizationId", "name", "kind");
CREATE INDEX "FinanceCategory_organizationId_kind_active_idx" ON "FinanceCategory"("organizationId", "kind", "active");

CREATE TABLE "CostCenter" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CostCenter_organizationId_name_key" ON "CostCenter"("organizationId", "name");
CREATE INDEX "CostCenter_organizationId_active_idx" ON "CostCenter"("organizationId", "active");

CREATE TABLE "Payable" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" UUID,
    "costCenterId" UUID,
    "supplierName" TEXT,
    "originalAmount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dueDate" DATE NOT NULL,
    "status" "PayableStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Payable_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Payable_organizationId_clinicId_dueDate_status_idx"
  ON "Payable"("organizationId", "clinicId", "dueDate", "status");
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PayablePayment" (
    "id" UUID NOT NULL,
    "payableId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayablePayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PayablePayment_payableId_paidAt_idx" ON "PayablePayment"("payableId", "paidAt");
ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_payableId_fkey"
  FOREIGN KEY ("payableId") REFERENCES "Payable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FinanceRecurrence" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "frequency" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "nextOccurrence" DATE NOT NULL,
    "endsAt" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinanceRecurrence_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FinanceRecurrence_organizationId_clinicId_active_nextOccurrence_idx"
  ON "FinanceRecurrence"("organizationId", "clinicId", "active", "nextOccurrence");

CREATE TABLE "CommissionPeriod" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "referenceMonth" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommissionPeriod_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommissionPeriod_clinicId_referenceMonth_key" ON "CommissionPeriod"("clinicId", "referenceMonth");
CREATE INDEX "CommissionPeriod_organizationId_clinicId_status_idx" ON "CommissionPeriod"("organizationId", "clinicId", "status");

CREATE TABLE "CommissionEvent" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "ruleId" UUID NOT NULL,
    "periodId" UUID,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "basisAmount" DECIMAL(12,2) NOT NULL,
    "commissionAmount" DECIMAL(12,2) NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'FORECASTED',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "CommissionEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CommissionEvent_organizationId_clinicId_professionalId_occurredAt_idx"
  ON "CommissionEvent"("organizationId", "clinicId", "professionalId", "occurredAt");
CREATE INDEX "CommissionEvent_periodId_status_idx" ON "CommissionEvent"("periodId", "status");
ALTER TABLE "CommissionEvent" ADD CONSTRAINT "CommissionEvent_periodId_fkey"
  FOREIGN KEY ("periodId") REFERENCES "CommissionPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
