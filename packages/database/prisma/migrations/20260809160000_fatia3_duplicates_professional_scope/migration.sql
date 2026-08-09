-- Fatia 3: dismissal de duplicados + backfill de escopo profissional (filtro rígido)

CREATE TABLE IF NOT EXISTS "PatientDuplicateDismissal" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "patientIdLow" UUID NOT NULL REFERENCES "Patient"("id") ON DELETE CASCADE,
  "patientIdHigh" UUID NOT NULL REFERENCES "Patient"("id") ON DELETE CASCADE,
  "dismissedById" UUID NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientDuplicateDismissal_organizationId_patientIdLow_patientIdHigh_key"
    UNIQUE ("organizationId", "patientIdLow", "patientIdHigh")
);
CREATE INDEX IF NOT EXISTS "PatientDuplicateDismissal_organizationId_createdAt_idx"
  ON "PatientDuplicateDismissal"("organizationId", "createdAt");

-- Backfill: profissionais sem vínculo de clínica passam a ter link em todas as clínicas ACTIVE da org
INSERT INTO "ProfessionalClinic" ("id", "professionalId", "clinicId", "active", "createdAt")
SELECT gen_random_uuid(), p."id", c."id", true, CURRENT_TIMESTAMP
FROM "Professional" p
INNER JOIN "User" u ON u."id" = p."userId"
INNER JOIN "Clinic" c ON c."organizationId" = u."organizationId" AND c."status" = 'ACTIVE'
WHERE NOT EXISTS (
  SELECT 1 FROM "ProfessionalClinic" pc WHERE pc."professionalId" = p."id"
)
ON CONFLICT ("professionalId", "clinicId") DO NOTHING;
