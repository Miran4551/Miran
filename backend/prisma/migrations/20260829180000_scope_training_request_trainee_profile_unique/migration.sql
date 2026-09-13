-- A TraineeProfile is a durable identity and may participate in multiple
-- training requests over its lifetime. The previous single-column unique
-- constraint incorrectly allowed only one TrainingRequestTrainee row per
-- profile and caused hospital acceptance to fail with Prisma P2002/409 when
-- the same trainee profile was linked from another request.
--
-- Preserve uniqueness where it is actually required: one trainee profile may
-- occur at most once within the same training request. Keep a standalone index
-- for profile lookup paths that previously used the unique index.

DROP INDEX IF EXISTS "training_request_trainees_trainee_profile_id_key";

CREATE INDEX IF NOT EXISTS "training_request_trainees_trainee_profile_id_idx"
  ON "training_request_trainees" ("trainee_profile_id");

CREATE UNIQUE INDEX IF NOT EXISTS "training_request_trainees_request_profile_key"
  ON "training_request_trainees" ("training_request_id", "trainee_profile_id");
