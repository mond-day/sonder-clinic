-- Importação de planilhas: lote reversível, registros criados por lote e histórico de caixa somente leitura.
CREATE TYPE "ImportKind" AS ENUM ('PATIENTS', 'TREATMENT_PLANS', 'TREATMENTS', 'APPOINTMENTS', 'CASHFLOW');
CREATE TYPE "ImportBatchStatus" AS ENUM ('COMMITTED', 'REVERTED');

CREATE TABLE "ImportBatch" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "kind" "ImportKind" NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'COMMITTED',
    "fileName" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revertedAt" TIMESTAMP(3),
    "revertedById" UUID,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportBatchRecord" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "naturalKey" TEXT,

    CONSTRAINT "ImportBatchRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportedCashEntry" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "patientId" UUID,
    "counterpartyName" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "dueDate" DATE,
    "paidAt" DATE,
    "amount" DECIMAL(12,2) NOT NULL,
    "netAmount" DECIMAL(12,2),
    "paid" BOOLEAN NOT NULL,
    "paymentMethod" TEXT,
    "professionalName" TEXT,
    "budgetCode" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportedCashEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportBatch_organizationId_clinicId_kind_createdAt_idx" ON "ImportBatch"("organizationId", "clinicId", "kind", "createdAt");
CREATE INDEX "ImportBatchRecord_batchId_entity_idx" ON "ImportBatchRecord"("batchId", "entity");
CREATE UNIQUE INDEX "ImportBatchRecord_organizationId_entity_naturalKey_key" ON "ImportBatchRecord"("organizationId", "entity", "naturalKey");
CREATE INDEX "ImportedCashEntry_organizationId_clinicId_paidAt_idx" ON "ImportedCashEntry"("organizationId", "clinicId", "paidAt");
CREATE INDEX "ImportedCashEntry_organizationId_clinicId_dueDate_idx" ON "ImportedCashEntry"("organizationId", "clinicId", "dueDate");
CREATE INDEX "ImportedCashEntry_batchId_idx" ON "ImportedCashEntry"("batchId");

ALTER TABLE "ImportBatchRecord" ADD CONSTRAINT "ImportBatchRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportedCashEntry" ADD CONSTRAINT "ImportedCashEntry_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
