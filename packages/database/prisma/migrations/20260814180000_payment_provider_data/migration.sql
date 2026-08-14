-- Dados da cobrança do provedor (PIX copia-e-cola, QR, URL do boleto, status).

ALTER TABLE "Payment" ADD COLUMN "providerData" JSONB;
