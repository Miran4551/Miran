-- Production drift repair for the schedule conflict engine.
-- Some environments reached the schedule feature through older schema/bootstrap
-- paths where trainer_leaves was not materialized even though Prisma models and
-- conflict checks now depend on it. Keep this migration idempotent.

CREATE TABLE IF NOT EXISTS "trainer_leaves" (
    "id" UUID NOT NULL,
    "trainer_profile_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "leave_type" VARCHAR(30) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "replacement_trainer_id" UUID,
    "auto_reassigned" BOOLEAN NOT NULL DEFAULT false,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trainer_leaves_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "trainer_leaves_trainer_profile_id_status_idx"
  ON "trainer_leaves"("trainer_profile_id", "status");
CREATE INDEX IF NOT EXISTS "trainer_leaves_organization_id_start_date_idx"
  ON "trainer_leaves"("organization_id", "start_date");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainer_leaves_trainer_profile_id_fkey') THEN
    ALTER TABLE "trainer_leaves"
      ADD CONSTRAINT "trainer_leaves_trainer_profile_id_fkey"
      FOREIGN KEY ("trainer_profile_id") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainer_leaves_organization_id_fkey') THEN
    ALTER TABLE "trainer_leaves"
      ADD CONSTRAINT "trainer_leaves_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainer_leaves_replacement_trainer_id_fkey') THEN
    ALTER TABLE "trainer_leaves"
      ADD CONSTRAINT "trainer_leaves_replacement_trainer_id_fkey"
      FOREIGN KEY ("replacement_trainer_id") REFERENCES "trainer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainer_leaves_approved_by_fkey') THEN
    ALTER TABLE "trainer_leaves"
      ADD CONSTRAINT "trainer_leaves_approved_by_fkey"
      FOREIGN KEY ("approved_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainer_leaves_created_by_fkey') THEN
    ALTER TABLE "trainer_leaves"
      ADD CONSTRAINT "trainer_leaves_created_by_fkey"
      FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
