-- Center Clinic QA P0: finance integrity, outbox lease, commission idempotency (additive)

DO $$ BEGIN
  ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "CommissionStatus" ADD VALUE 'PENDING_ADJUSTMENT';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "OutboxEvent"
  ADD COLUMN IF NOT EXISTS "lockedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "leaseUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "processingAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deadLetterAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "OutboxEvent_leaseUntil_processedAt_attempts_idx"
  ON "OutboxEvent"("leaseUntil", "processedAt", "attempts");

ALTER TABLE "PayablePayment"
  ADD COLUMN IF NOT EXISTS "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'CONFIRMED';

DELETE FROM "CommissionEvent" a
USING "CommissionEvent" b
WHERE a."sourceType" = b."sourceType"
  AND a."sourceId" = b."sourceId"
  AND a."ruleId" = b."ruleId"
  AND a."id" > b."id";

CREATE UNIQUE INDEX IF NOT EXISTS "CommissionEvent_sourceType_sourceId_ruleId_key"
  ON "CommissionEvent"("sourceType", "sourceId", "ruleId");
