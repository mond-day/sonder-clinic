-- Compromissos na agenda (reunião, almoço, manutenção...): ocupam o horário do profissional sem paciente.
-- Linhas existentes viram kind = 'APPOINTMENT' e continuam com paciente. A FK de paciente
-- (ON DELETE RESTRICT) e as exclusion constraints de overlap permanecem inalteradas.

CREATE TYPE "AppointmentKind" AS ENUM ('APPOINTMENT', 'COMMITMENT');

ALTER TABLE "Appointment"
  ADD COLUMN "kind" "AppointmentKind" NOT NULL DEFAULT 'APPOINTMENT',
  ADD COLUMN "title" TEXT,
  ALTER COLUMN "patientId" DROP NOT NULL;

-- Consulta exige paciente; compromisso exige título e não tem paciente.
ALTER TABLE "Appointment"
  ADD CONSTRAINT "appointment_kind_patient_title" CHECK (
    ("kind" = 'APPOINTMENT' AND "patientId" IS NOT NULL)
    OR ("kind" = 'COMMITMENT' AND "patientId" IS NULL AND "title" IS NOT NULL AND btrim("title") <> '')
  );
