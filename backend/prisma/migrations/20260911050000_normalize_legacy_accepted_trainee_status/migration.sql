-- Older local/staging datasets used `accepted` for a trainee row that the
-- current hospital workflow names `hospital_accepted`. The current assignment
-- service intentionally gates on the canonical status, so normalize the legacy
-- value during migration instead of making the business rule depend on which
-- environment seeded the row.
--
-- Some historical databases were provisioned from an incomplete migration
-- baseline where this table is absent from the shadow database. Keep this
-- data-only migration safe in that case; the phase migration that owns the
-- table remains responsible for creating it when the full chain is applied.
DO $$
BEGIN
  IF to_regclass('public.training_request_trainees') IS NOT NULL THEN
    UPDATE "training_request_trainees"
    SET "status" = 'hospital_accepted'
    WHERE "status" = 'accepted';
  END IF;
END $$;
