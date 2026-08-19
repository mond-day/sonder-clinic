-- Persistência do setup inicial. Sem FKs: o registro sobrevive a exclusões
-- de organização/usuário para impedir reabrir o bootstrap.
CREATE TABLE "SystemInstallation" (
    "id" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" UUID NOT NULL,
    "adminUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemInstallation_pkey" PRIMARY KEY ("id")
);
