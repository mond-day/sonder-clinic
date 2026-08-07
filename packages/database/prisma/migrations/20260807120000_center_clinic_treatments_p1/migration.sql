-- Center Clinic QA: treatments domain (additive)

DO $$ BEGIN
  CREATE TYPE "TreatmentItemStatus" AS ENUM ('PLANNED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "TreatmentPlan"
  ADD COLUMN IF NOT EXISTS "presentedVersion" INTEGER,
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archivedById" UUID,
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledById" UUID,
  ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;

CREATE INDEX IF NOT EXISTS "TreatmentPlan_organizationId_clinicId_status_archivedAt_idx"
  ON "TreatmentPlan"("organizationId", "clinicId", "status", "archivedAt");

ALTER TABLE "TreatmentItem"
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledById" UUID,
  ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;

-- Convert TreatmentItem.status String -> enum (preserve known values)
ALTER TABLE "TreatmentItem" ADD COLUMN IF NOT EXISTS "status_enum" "TreatmentItemStatus";

UPDATE "TreatmentItem"
SET "status_enum" = CASE UPPER(COALESCE("status", 'PLANNED'))
  WHEN 'APPROVED' THEN 'APPROVED'::"TreatmentItemStatus"
  WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'::"TreatmentItemStatus"
  WHEN 'COMPLETED' THEN 'COMPLETED'::"TreatmentItemStatus"
  WHEN 'CANCELLED' THEN 'CANCELLED'::"TreatmentItemStatus"
  ELSE 'PLANNED'::"TreatmentItemStatus"
END
WHERE "status_enum" IS NULL;

ALTER TABLE "TreatmentItem" ALTER COLUMN "status_enum" SET DEFAULT 'PLANNED'::"TreatmentItemStatus";
ALTER TABLE "TreatmentItem" ALTER COLUMN "status_enum" SET NOT NULL;

ALTER TABLE "TreatmentItem" DROP COLUMN IF EXISTS "status";
ALTER TABLE "TreatmentItem" RENAME COLUMN "status_enum" TO "status";

ALTER TABLE "TreatmentSession"
  ADD COLUMN IF NOT EXISTS "correctionOfId" UUID,
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "TreatmentSession_treatmentItemId_idempotencyKey_key"
  ON "TreatmentSession"("treatmentItemId", "idempotencyKey");

CREATE INDEX IF NOT EXISTS "TreatmentSession_correctionOfId_idx"
  ON "TreatmentSession"("correctionOfId");

DO $$ BEGIN
  ALTER TABLE "TreatmentSession"
    ADD CONSTRAINT "TreatmentSession_correctionOfId_fkey"
    FOREIGN KEY ("correctionOfId") REFERENCES "TreatmentSession"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "TreatmentPlanEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "treatmentPlanId" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "actorId" UUID,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TreatmentPlanEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TreatmentPlanEvent_treatmentPlanId_createdAt_idx"
  ON "TreatmentPlanEvent"("treatmentPlanId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "TreatmentPlanEvent"
    ADD CONSTRAINT "TreatmentPlanEvent_treatmentPlanId_fkey"
    FOREIGN KEY ("treatmentPlanId") REFERENCES "TreatmentPlan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "TreatmentPlanRevision" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "treatmentPlanId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TreatmentPlanRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TreatmentPlanRevision_treatmentPlanId_version_key"
  ON "TreatmentPlanRevision"("treatmentPlanId", "version");

CREATE INDEX IF NOT EXISTS "TreatmentPlanRevision_treatmentPlanId_createdAt_idx"
  ON "TreatmentPlanRevision"("treatmentPlanId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "TreatmentPlanRevision"
    ADD CONSTRAINT "TreatmentPlanRevision_treatmentPlanId_fkey"
    FOREIGN KEY ("treatmentPlanId") REFERENCES "TreatmentPlan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
