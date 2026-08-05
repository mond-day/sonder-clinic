ALTER TABLE "Appointment" ADD COLUMN "category" TEXT;

CREATE TABLE "AgendaTag" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#159a96',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgendaTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppointmentTag" (
    "appointmentId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    CONSTRAINT "AppointmentTag_pkey" PRIMARY KEY ("appointmentId", "tagId")
);

CREATE TABLE "AppointmentReminder" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "leadMinutes" INTEGER NOT NULL DEFAULT 1440,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISABLED',
    "statusReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppointmentReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgendaTag_clinicId_name_key" ON "AgendaTag"("clinicId", "name");
CREATE INDEX "AgendaTag_organizationId_clinicId_active_idx" ON "AgendaTag"("organizationId", "clinicId", "active");
CREATE INDEX "AppointmentTag_tagId_idx" ON "AppointmentTag"("tagId");
CREATE UNIQUE INDEX "AppointmentReminder_appointmentId_channel_key" ON "AppointmentReminder"("appointmentId", "channel");
CREATE INDEX "AppointmentReminder_organizationId_status_scheduledFor_idx" ON "AppointmentReminder"("organizationId", "status", "scheduledFor");

ALTER TABLE "AgendaTag" ADD CONSTRAINT "AgendaTag_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgendaTag" ADD CONSTRAINT "AgendaTag_clinicId_fkey"
FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppointmentTag" ADD CONSTRAINT "AppointmentTag_appointmentId_fkey"
FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentTag" ADD CONSTRAINT "AppointmentTag_tagId_fkey"
FOREIGN KEY ("tagId") REFERENCES "AgendaTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentReminder" ADD CONSTRAINT "AppointmentReminder_appointmentId_fkey"
FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_treatmentId_fkey"
FOREIGN KEY ("treatmentId") REFERENCES "TreatmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
