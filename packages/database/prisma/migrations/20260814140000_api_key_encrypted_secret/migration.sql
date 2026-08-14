-- Cópia criptografada (AES-256-GCM) para reexibição administrativa. Autenticação continua pelo hash.

ALTER TABLE "ApiKey" ADD COLUMN "encryptedSecret" TEXT;
