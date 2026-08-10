-- Patient address fields
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "postalCode" TEXT;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "street" TEXT;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "number" TEXT;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "complement" TEXT;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "district" TEXT;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "country" TEXT DEFAULT 'Brasil';

-- Medication catalog (organization-scoped)
CREATE TABLE IF NOT EXISTS "MedicationCatalogItem" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "activeIngredient" TEXT,
    "concentration" TEXT,
    "pharmaceuticalForm" TEXT,
    "defaultRoute" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MedicationCatalogItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MedicationCatalogItem_organizationId_active_idx"
  ON "MedicationCatalogItem"("organizationId", "active");
CREATE INDEX IF NOT EXISTS "MedicationCatalogItem_organizationId_name_idx"
  ON "MedicationCatalogItem"("organizationId", "name");

ALTER TABLE "MedicationCatalogItem"
  DROP CONSTRAINT IF EXISTS "MedicationCatalogItem_organizationId_fkey";
ALTER TABLE "MedicationCatalogItem"
  ADD CONSTRAINT "MedicationCatalogItem_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exam catalog (organization-scoped)
CREATE TABLE IF NOT EXISTS "ExamCatalogItem" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'IMAGING',
    "lateralityBehavior" TEXT DEFAULT 'OPTIONAL',
    "defaultInstructions" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExamCatalogItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExamCatalogItem_organizationId_active_idx"
  ON "ExamCatalogItem"("organizationId", "active");
CREATE INDEX IF NOT EXISTS "ExamCatalogItem_organizationId_name_idx"
  ON "ExamCatalogItem"("organizationId", "name");

ALTER TABLE "ExamCatalogItem"
  DROP CONSTRAINT IF EXISTS "ExamCatalogItem_organizationId_fkey";
ALTER TABLE "ExamCatalogItem"
  ADD CONSTRAINT "ExamCatalogItem_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed default exam types for existing organizations (idempotent by name)
INSERT INTO "ExamCatalogItem" ("id", "organizationId", "name", "category", "lateralityBehavior", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid(), o."id", v.name, v.category, v.laterality, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" o
CROSS JOIN (
  VALUES
    ('Radiografia panorâmica', 'IMAGING', 'NOT_APPLICABLE'),
    ('Radiografia periapical', 'IMAGING', 'REQUIRED'),
    ('Interproximal', 'IMAGING', 'OPTIONAL'),
    ('Tomografia Cone Beam', 'IMAGING', 'OPTIONAL'),
    ('Telerradiografia', 'IMAGING', 'NOT_APPLICABLE'),
    ('Fotografias clínicas', 'PHOTO', 'OPTIONAL')
) AS v(name, category, laterality)
WHERE NOT EXISTS (
  SELECT 1 FROM "ExamCatalogItem" e
  WHERE e."organizationId" = o."id" AND e."name" = v.name
);
