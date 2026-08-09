-- Fatia 4: mapeamento appointment ↔ Google Calendar event
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "externalCalendarEventId" TEXT;

CREATE INDEX IF NOT EXISTS "Appointment_externalCalendarEventId_idx"
  ON "Appointment"("externalCalendarEventId")
  WHERE "externalCalendarEventId" IS NOT NULL;
