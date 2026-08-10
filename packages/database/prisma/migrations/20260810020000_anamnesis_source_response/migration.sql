-- Anamnese RC: origem da atualização permanece vigente até finalização.
-- sourceResponseId aponta do DRAFT/nova versão para a anamnese de origem.

ALTER TABLE "AnamnesisResponse"
  ADD COLUMN IF NOT EXISTS "sourceResponseId" UUID;

ALTER TABLE "AnamnesisResponse"
  DROP CONSTRAINT IF EXISTS "AnamnesisResponse_sourceResponseId_fkey";

ALTER TABLE "AnamnesisResponse"
  ADD CONSTRAINT "AnamnesisResponse_sourceResponseId_fkey"
  FOREIGN KEY ("sourceResponseId") REFERENCES "AnamnesisResponse"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "AnamnesisResponse_sourceResponseId_idx"
  ON "AnamnesisResponse"("sourceResponseId");

CREATE INDEX IF NOT EXISTS "AnamnesisResponse_supersededById_idx"
  ON "AnamnesisResponse"("supersededById");
