-- Foto de perfil do usuário (FileObject.id; sem FK rígida para não acoplar delete em cascata).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarFileId" UUID;
CREATE INDEX IF NOT EXISTS "User_avatarFileId_idx" ON "User"("avatarFileId");
