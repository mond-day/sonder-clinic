-- Canal de mensagem vinculado a uma integração conectada (Evolution/Chatwoot).
-- Sem FK rígida: a API valida organização/status e o envio falha com mensagem clara se a conexão sumir.
ALTER TABLE "MessagingChannel" ADD COLUMN IF NOT EXISTS "integrationConnectionId" UUID;
CREATE INDEX IF NOT EXISTS "MessagingChannel_integrationConnectionId_idx" ON "MessagingChannel"("integrationConnectionId");
