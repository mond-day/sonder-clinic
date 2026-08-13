-- Contratos gerados a partir de planos aprovados: origem idempotente + PDF final.

ALTER TABLE "GeneratedDocument" ADD COLUMN IF NOT EXISTS "signedFileId" UUID;
ALTER TABLE "GeneratedDocument" ADD COLUMN IF NOT EXISTS "validationSecretHash" TEXT;
ALTER TABLE "GeneratedDocument" ADD COLUMN IF NOT EXISTS "sourceType" TEXT;
ALTER TABLE "GeneratedDocument" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;
ALTER TABLE "GeneratedDocument" ADD COLUMN IF NOT EXISTS "sourceVersion" INTEGER;

-- Idempotência do contrato por versão do plano, permitindo reemitir após cancelar.
CREATE UNIQUE INDEX IF NOT EXISTS "GeneratedDocument_source_active_key"
  ON "GeneratedDocument"("organizationId", "sourceType", "sourceId", "sourceVersion")
  WHERE "sourceType" IS NOT NULL AND "status" <> 'CANCELLED';

CREATE INDEX IF NOT EXISTS "GeneratedDocument_organizationId_treatmentId_idx"
  ON "GeneratedDocument"("organizationId", "treatmentId");

CREATE INDEX IF NOT EXISTS "GeneratedDocument_organizationId_sourceType_sourceId_idx"
  ON "GeneratedDocument"("organizationId", "sourceType", "sourceId");
