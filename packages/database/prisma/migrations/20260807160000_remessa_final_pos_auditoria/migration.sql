-- Remessa final pós-auditoria: escopo profissional + histórico de tarefas
CREATE TABLE IF NOT EXISTS "ProfessionalClinic" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "professionalId" UUID NOT NULL REFERENCES "Professional"("id") ON DELETE CASCADE,
  "clinicId" UUID NOT NULL REFERENCES "Clinic"("id") ON DELETE CASCADE,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfessionalClinic_professionalId_clinicId_key" UNIQUE ("professionalId", "clinicId")
);
CREATE INDEX IF NOT EXISTS "ProfessionalClinic_clinicId_active_idx" ON "ProfessionalClinic"("clinicId", "active");

CREATE TABLE IF NOT EXISTS "ProfessionalUnit" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "professionalId" UUID NOT NULL REFERENCES "Professional"("id") ON DELETE CASCADE,
  "unitId" UUID NOT NULL REFERENCES "Unit"("id") ON DELETE CASCADE,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfessionalUnit_professionalId_unitId_key" UNIQUE ("professionalId", "unitId")
);
CREATE INDEX IF NOT EXISTS "ProfessionalUnit_unitId_active_idx" ON "ProfessionalUnit"("unitId", "active");

CREATE TABLE IF NOT EXISTS "ProfessionalSpecialty" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "professionalId" UUID NOT NULL REFERENCES "Professional"("id") ON DELETE CASCADE,
  "specialty" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfessionalSpecialty_professionalId_specialty_key" UNIQUE ("professionalId", "specialty")
);
CREATE INDEX IF NOT EXISTS "ProfessionalSpecialty_specialty_idx" ON "ProfessionalSpecialty"("specialty");

CREATE TABLE IF NOT EXISTS "TaskActivity" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "taskId" UUID NOT NULL REFERENCES "Task"("id") ON DELETE CASCADE,
  "actorId" UUID,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TaskActivity_taskId_createdAt_idx" ON "TaskActivity"("taskId", "createdAt");

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "sourceTaskId" UUID;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "occurrenceKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Task_occurrenceKey_key" ON "Task"("occurrenceKey");
