CREATE TYPE "ReturnAlertStatus" AS ENUM ('PENDING', 'CONTACTED', 'SCHEDULED', 'DONE', 'DISMISSED');
CREATE TYPE "ReturnChannel" AS ENUM ('WHATSAPP', 'PHONE', 'EMAIL', 'IN_PERSON');
CREATE TYPE "TaskStatus" AS ENUM ('INBOX', 'TODAY', 'UPCOMING', 'DONE');
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');
CREATE TYPE "TaskCategory" AS ENUM ('PATIENT', 'FINANCE', 'LAB', 'SCHEDULE', 'STOCK', 'ADMIN');
CREATE TYPE "LabCaseStatus" AS ENUM ('REQUESTED', 'IN_LAB', 'RETURNED', 'INSTALLED', 'CANCELLED');
CREATE TYPE "NotificationCategory" AS ENUM ('CLINICAL', 'FINANCE', 'TASK', 'LAB', 'PATIENT');
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

CREATE TABLE "ReturnAlert" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "professionalId" UUID,
    "assigneeId" UUID,
    "reason" TEXT NOT NULL,
    "specialty" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "ReturnAlertStatus" NOT NULL DEFAULT 'PENDING',
    "preferredChannel" "ReturnChannel" NOT NULL DEFAULT 'WHATSAPP',
    "contactAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastContactAt" TIMESTAMP(3),
    "notes" TEXT,
    "appointmentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReturnAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "TaskCategory" NOT NULL DEFAULT 'ADMIN',
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "TaskStatus" NOT NULL DEFAULT 'INBOX',
    "dueAt" TIMESTAMP(3),
    "assigneeId" UUID,
    "patientId" UUID,
    "createdById" UUID,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LabCase" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "professionalId" UUID,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "toothFdi" TEXT,
    "laboratoryName" TEXT NOT NULL,
    "specialty" TEXT,
    "status" "LabCaseStatus" NOT NULL DEFAULT 'REQUESTED',
    "sentAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "installedAt" TIMESTAMP(3),
    "cost" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LabCaseEvent" (
    "id" UUID NOT NULL,
    "labCaseId" UUID NOT NULL,
    "status" "LabCaseStatus" NOT NULL,
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LabCaseEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID,
    "userId" UUID,
    "category" "NotificationCategory" NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkPath" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReturnAlert_organizationId_clinicId_status_dueAt_idx"
ON "ReturnAlert"("organizationId", "clinicId", "status", "dueAt");
CREATE INDEX "Task_organizationId_clinicId_status_dueAt_idx"
ON "Task"("organizationId", "clinicId", "status", "dueAt");
CREATE UNIQUE INDEX "LabCase_organizationId_code_key"
ON "LabCase"("organizationId", "code");
CREATE INDEX "LabCase_organizationId_clinicId_status_dueAt_idx"
ON "LabCase"("organizationId", "clinicId", "status", "dueAt");
CREATE INDEX "LabCaseEvent_labCaseId_createdAt_idx"
ON "LabCaseEvent"("labCaseId", "createdAt");
CREATE INDEX "Notification_organizationId_userId_readAt_createdAt_idx"
ON "Notification"("organizationId", "userId", "readAt", "createdAt");

ALTER TABLE "ReturnAlert"
ADD CONSTRAINT "ReturnAlert_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnAlert"
ADD CONSTRAINT "ReturnAlert_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnAlert"
ADD CONSTRAINT "ReturnAlert_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task"
ADD CONSTRAINT "Task_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task"
ADD CONSTRAINT "Task_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LabCase"
ADD CONSTRAINT "LabCase_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabCase"
ADD CONSTRAINT "LabCase_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabCase"
ADD CONSTRAINT "LabCase_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LabCaseEvent"
ADD CONSTRAINT "LabCaseEvent_labCaseId_fkey" FOREIGN KEY ("labCaseId") REFERENCES "LabCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
