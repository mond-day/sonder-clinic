-- Garante a exclusão de horários sobrepostos na mesma cadeira.
-- A constraint pode já existir desde 20260820120000_appointment_exclusion_constraints.
-- Idempotente: não recria se existir e não altera appointment_professional_no_overlap.
-- Status que ocupam: SCHEDULED, CONFIRMED, CHECKED_IN, IN_PROGRESS.
-- chairId nulo fica de fora (duas consultas sem cadeira não conflitam).

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointment_chair_no_overlap'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Appointment" a
    JOIN "Appointment" b
      ON a.id < b.id
     AND a."chairId" IS NOT NULL
     AND a."chairId" = b."chairId"
     AND a.status IN ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS')
     AND b.status IN ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS')
     AND tsrange(a."startAt", a."endAt", '[)') && tsrange(b."startAt", b."endAt", '[)')
  ) THEN
    RAISE EXCEPTION
      'Existem agendamentos sobrepostos na mesma cadeira. Resolva os conflitos antes de aplicar a migration.';
  END IF;

  ALTER TABLE "Appointment"
    ADD CONSTRAINT "appointment_chair_no_overlap"
    EXCLUDE USING gist (
      "chairId" WITH =,
      tsrange("startAt", "endAt", '[)') WITH &&
    )
    WHERE (
      status IN ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS')
      AND "chairId" IS NOT NULL
    );
END $$;
