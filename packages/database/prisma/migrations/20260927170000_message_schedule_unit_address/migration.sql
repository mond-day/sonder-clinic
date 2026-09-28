-- Régua do envio automático por modelo (Lembrete/Confirmação) e endereço da unidade para {{clinicAddress}}.
-- Somente aditivo: colunas novas com default/nullable, sem reescrever dados.
ALTER TABLE "MessageTemplate" ADD COLUMN IF NOT EXISTS "schedule" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Unit" ADD COLUMN IF NOT EXISTS "address" TEXT;
