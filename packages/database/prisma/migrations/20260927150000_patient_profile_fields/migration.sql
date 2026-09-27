-- Campos de perfil do paciente (sexo, profissão, RG, como conheceu, categorias).
CREATE TYPE "PatientSex" AS ENUM ('FEMALE', 'MALE', 'OTHER');

ALTER TABLE "Patient"
  ADD COLUMN "sex" "PatientSex",
  ADD COLUMN "profession" TEXT,
  ADD COLUMN "rg" TEXT,
  ADD COLUMN "referralSource" TEXT,
  ADD COLUMN "categories" TEXT[] DEFAULT ARRAY[]::TEXT[];
