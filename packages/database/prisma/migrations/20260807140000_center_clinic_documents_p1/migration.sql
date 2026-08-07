-- Center Clinic QA: documents domain (additive)

DO $$ BEGIN
  CREATE TYPE "DocumentTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PrescriptionStatus" AS ENUM ('DRAFT', 'REVIEWED', 'SIGNED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Templates: versioning / publish / archive
ALTER TABLE "DocumentTemplate"
  ADD COLUMN IF NOT EXISTS "status" "DocumentTemplateStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "sourceTemplateId" UUID,
  ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "publishedById" UUID,
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "DocumentTemplate"
SET
  "status" = CASE WHEN "active" THEN 'PUBLISHED'::"DocumentTemplateStatus" ELSE 'ARCHIVED'::"DocumentTemplateStatus" END,
  "publishedAt" = COALESCE("publishedAt", "createdAt"),
  "archivedAt" = CASE WHEN NOT "active" THEN COALESCE("archivedAt", "createdAt") ELSE "archivedAt" END
WHERE "status" = 'DRAFT'::"DocumentTemplateStatus" OR "publishedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "DocumentTemplate_organizationId_status_type_idx"
  ON "DocumentTemplate"("organizationId", "status", "type");

-- Folders (logical grouping; not physical storage moves)
CREATE TABLE IF NOT EXISTS "PatientDocumentFolder" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientDocumentFolder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PatientDocumentFolder_patientId_name_key"
  ON "PatientDocumentFolder"("patientId", "name");

CREATE INDEX IF NOT EXISTS "PatientDocumentFolder_organizationId_patientId_sortOrder_idx"
  ON "PatientDocumentFolder"("organizationId", "patientId", "sortOrder");

-- Generated documents
ALTER TABLE "GeneratedDocument"
  ADD COLUMN IF NOT EXISTS "professionalId" UUID,
  ADD COLUMN IF NOT EXISTS "folderId" UUID,
  ADD COLUMN IF NOT EXISTS "generatedById" UUID,
  ADD COLUMN IF NOT EXISTS "cancelledById" UUID,
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archivedById" UUID;

CREATE INDEX IF NOT EXISTS "GeneratedDocument_organizationId_patientId_folderId_idx"
  ON "GeneratedDocument"("organizationId", "patientId", "folderId");

CREATE INDEX IF NOT EXISTS "GeneratedDocument_organizationId_status_generatedAt_idx"
  ON "GeneratedDocument"("organizationId", "status", "generatedAt");

DO $$ BEGIN
  ALTER TABLE "GeneratedDocument"
    ADD CONSTRAINT "GeneratedDocument_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "PatientDocumentFolder"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "DocumentSignature_generatedDocumentId_role_idx"
  ON "DocumentSignature"("generatedDocumentId", "role");

CREATE TABLE IF NOT EXISTS "DocumentSignatureRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "generatedDocumentId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "signerRole" TEXT NOT NULL,
  "signerName" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentSignatureRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentSignatureRequest_tokenHash_key"
  ON "DocumentSignatureRequest"("tokenHash");

CREATE INDEX IF NOT EXISTS "DocumentSignatureRequest_generatedDocumentId_expiresAt_idx"
  ON "DocumentSignatureRequest"("generatedDocumentId", "expiresAt");

DO $$ BEGIN
  ALTER TABLE "DocumentSignatureRequest"
    ADD CONSTRAINT "DocumentSignatureRequest_generatedDocumentId_fkey"
    FOREIGN KEY ("generatedDocumentId") REFERENCES "GeneratedDocument"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "DocumentEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "generatedDocumentId" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "actorId" UUID,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DocumentEvent_generatedDocumentId_createdAt_idx"
  ON "DocumentEvent"("generatedDocumentId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "DocumentEvent"
    ADD CONSTRAINT "DocumentEvent_generatedDocumentId_fkey"
    FOREIGN KEY ("generatedDocumentId") REFERENCES "GeneratedDocument"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Patient media: archive + folders + display name
ALTER TABLE "PatientMedia"
  ADD COLUMN IF NOT EXISTS "displayName" TEXT,
  ADD COLUMN IF NOT EXISTS "folderId" UUID,
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archivedById" UUID;

CREATE INDEX IF NOT EXISTS "PatientMedia_organizationId_patientId_folderId_idx"
  ON "PatientMedia"("organizationId", "patientId", "folderId");

CREATE INDEX IF NOT EXISTS "PatientMedia_organizationId_patientId_archivedAt_idx"
  ON "PatientMedia"("organizationId", "patientId", "archivedAt");

DO $$ BEGIN
  ALTER TABLE "PatientMedia"
    ADD CONSTRAINT "PatientMedia_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "PatientDocumentFolder"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ImageAnnotation"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Prescriptions: structured lifecycle
ALTER TABLE "Prescription"
  ADD COLUMN IF NOT EXISTS "folderId" UUID,
  ADD COLUMN IF NOT EXISTS "frozenIdentity" JSONB,
  ADD COLUMN IF NOT EXISTS "validationCode" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedById" UUID,
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledById" UUID,
  ADD COLUMN IF NOT EXISTS "cancelReason" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Prescription" ADD COLUMN IF NOT EXISTS "status_enum" "PrescriptionStatus";

UPDATE "Prescription"
SET "status_enum" = CASE UPPER(COALESCE("status"::text, 'DRAFT'))
  WHEN 'REVIEWED' THEN 'REVIEWED'::"PrescriptionStatus"
  WHEN 'SIGNED' THEN 'SIGNED'::"PrescriptionStatus"
  WHEN 'CANCELLED' THEN 'CANCELLED'::"PrescriptionStatus"
  ELSE 'DRAFT'::"PrescriptionStatus"
END
WHERE "status_enum" IS NULL;

ALTER TABLE "Prescription" ALTER COLUMN "status_enum" SET DEFAULT 'DRAFT'::"PrescriptionStatus";
ALTER TABLE "Prescription" ALTER COLUMN "status_enum" SET NOT NULL;
ALTER TABLE "Prescription" DROP COLUMN IF EXISTS "status";
ALTER TABLE "Prescription" RENAME COLUMN "status_enum" TO "status";

CREATE UNIQUE INDEX IF NOT EXISTS "Prescription_validationCode_key"
  ON "Prescription"("validationCode");

CREATE INDEX IF NOT EXISTS "Prescription_organizationId_patientId_status_idx"
  ON "Prescription"("organizationId", "patientId", "status");

DO $$ BEGIN
  ALTER TABLE "Prescription"
    ADD CONSTRAINT "Prescription_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "PatientDocumentFolder"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PrescriptionProtocol" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "professionalId" UUID,
  "name" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "items" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrescriptionProtocol_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PrescriptionProtocol_organizationId_name_professionalId_idx"
  ON "PrescriptionProtocol"("organizationId", "name", "professionalId");

CREATE INDEX IF NOT EXISTS "PrescriptionProtocol_organizationId_active_idx"
  ON "PrescriptionProtocol"("organizationId", "active");
