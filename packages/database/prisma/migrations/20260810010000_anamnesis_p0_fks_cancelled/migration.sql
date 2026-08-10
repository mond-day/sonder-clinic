-- P0 anamnese: status CANCELLED + FKs Clinic/Patient (sem cascade destrutivo)

ALTER TYPE "AnamnesisResponseStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- Orphan cleanup before FK (dev-safe; production should have valid refs)
DELETE FROM "AnamnesisResponse"
WHERE "clinicId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Clinic" c WHERE c."id" = "AnamnesisResponse"."clinicId");

DELETE FROM "AnamnesisResponse"
WHERE "patientId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Patient" p WHERE p."id" = "AnamnesisResponse"."patientId");

ALTER TABLE "AnamnesisResponse"
  ADD CONSTRAINT "AnamnesisResponse_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AnamnesisResponse"
  ADD CONSTRAINT "AnamnesisResponse_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "AnamnesisResponse_clinicId_createdAt_idx"
  ON "AnamnesisResponse"("clinicId", "createdAt");

CREATE INDEX IF NOT EXISTS "AnamnesisResponse_patientId_createdAt_idx"
  ON "AnamnesisResponse"("patientId", "createdAt");
