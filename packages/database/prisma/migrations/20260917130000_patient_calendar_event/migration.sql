-- Evento Google Calendar criado no cadastro do paciente (all-day, A51)
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "externalCalendarEventId" TEXT;

CREATE INDEX IF NOT EXISTS "Patient_externalCalendarEventId_idx"
  ON "Patient"("externalCalendarEventId");
