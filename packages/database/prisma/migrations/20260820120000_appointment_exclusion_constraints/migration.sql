-- Exclusion constraints for agenda overlaps (professional + chair).
-- Requires btree_gist. Fails deliberately if overlapping active appointments already exist.

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Appointment" a
    JOIN "Appointment" b
      ON a.id < b.id
     AND a."organizationId" = b."organizationId"
     AND a."professionalId" = b."professionalId"
     AND a.status IN ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS')
     AND b.status IN ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS')
     AND tstzrange(a."startAt", a."endAt", '[)') && tstzrange(b."startAt", b."endAt", '[)')
  ) THEN
    RAISE EXCEPTION
      'Existem agendamentos sobrepostos no mesmo profissional. Liste com: SELECT a.id, b.id FROM "Appointment" a JOIN "Appointment" b ON a.id < b.id AND a."professionalId" = b."professionalId" AND tstzrange(a."startAt", a."endAt", ''[)'') && tstzrange(b."startAt", b."endAt", ''[)'') WHERE a.status IN (''SCHEDULED'',''CONFIRMED'',''CHECKED_IN'',''IN_PROGRESS'') AND b.status IN (''SCHEDULED'',''CONFIRMED'',''CHECKED_IN'',''IN_PROGRESS'');';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Appointment" a
    JOIN "Appointment" b
      ON a.id < b.id
     AND a."organizationId" = b."organizationId"
     AND a."chairId" IS NOT NULL
     AND a."chairId" = b."chairId"
     AND a.status IN ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS')
     AND b.status IN ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS')
     AND tstzrange(a."startAt", a."endAt", '[)') && tstzrange(b."startAt", b."endAt", '[)')
  ) THEN
    RAISE EXCEPTION
      'Existem agendamentos sobrepostos na mesma cadeira. Resolva os conflitos antes de aplicar a migration.';
  END IF;
END $$;

ALTER TABLE "Appointment"
  ADD CONSTRAINT "appointment_professional_no_overlap"
  EXCLUDE USING gist (
    "professionalId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE (status IN ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'));

ALTER TABLE "Appointment"
  ADD CONSTRAINT "appointment_chair_no_overlap"
  EXCLUDE USING gist (
    "chairId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE (
    status IN ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS')
    AND "chairId" IS NOT NULL
  );
