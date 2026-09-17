-- Idempotência de importação Nibo → Financeiro (Receivable/Payable)
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "provider" "IntegrationProvider";

CREATE INDEX IF NOT EXISTS "Receivable_organizationId_clinicId_externalId_idx"
  ON "Receivable"("organizationId", "clinicId", "externalId");

CREATE INDEX IF NOT EXISTS "Payable_organizationId_clinicId_externalId_idx"
  ON "Payable"("organizationId", "clinicId", "externalId");

-- Um schedule Nibo por clínica (permite múltiplos NULL)
CREATE UNIQUE INDEX IF NOT EXISTS "Receivable_org_clinic_externalId_uidx"
  ON "Receivable"("organizationId", "clinicId", "externalId")
  WHERE "externalId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Payable_org_clinic_externalId_uidx"
  ON "Payable"("organizationId", "clinicId", "externalId")
  WHERE "externalId" IS NOT NULL;
