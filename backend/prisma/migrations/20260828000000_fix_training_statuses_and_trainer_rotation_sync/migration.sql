-- ============================================================================
-- Training workflow consistency repair
-- ============================================================================

-- A hospital request for missing documents is a distinct workflow state.
-- It must leave the hospital actionable inbox until the requested documents
-- are actually supplied.
UPDATE training_request_trainees trt
SET status = 'documents_requested',
    updated_at = NOW()
WHERE trt.status IN ('allocated', 'hospital_review', 'on_hold')
  AND jsonb_typeof(trt.required_documents) = 'array'
  AND jsonb_array_length(trt.required_documents) > 0;

CREATE OR REPLACE FUNCTION miran_mark_documents_requested()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.required_documents IS DISTINCT FROM OLD.required_documents
     AND jsonb_typeof(NEW.required_documents) = 'array'
     AND jsonb_array_length(NEW.required_documents) > 0
     AND NEW.status IN ('allocated', 'hospital_review', 'on_hold') THEN
    NEW.status := 'documents_requested';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_training_request_trainee_documents_requested
  ON training_request_trainees;

CREATE TRIGGER trg_training_request_trainee_documents_requested
BEFORE UPDATE OF required_documents ON training_request_trainees
FOR EACH ROW
EXECUTE FUNCTION miran_mark_documents_requested();

-- When every requested document exists, return the row to hospital review.
CREATE OR REPLACE FUNCTION miran_resume_after_documents_uploaded()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_id uuid;
  missing_required boolean;
BEGIN
  row_id := COALESCE(NEW.training_request_trainee_id, OLD.training_request_trainee_id);
  IF row_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      COALESCE((SELECT required_documents
                FROM training_request_trainees
                WHERE id = row_id), '[]'::jsonb)
    ) AS required(type)
    WHERE NOT EXISTS (
      SELECT 1
      FROM documents d
      WHERE d.training_request_trainee_id = row_id
        AND d.deleted_at IS NULL
        AND d.document_type = required.type
    )
  )
  INTO missing_required;

  IF NOT missing_required THEN
    UPDATE training_request_trainees
    SET status = 'hospital_review',
        required_documents = '[]'::jsonb,
        correction_deadline = NULL,
        updated_at = NOW()
    WHERE id = row_id
      AND status = 'documents_requested';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_resume_hospital_review ON documents;

CREATE TRIGGER trg_documents_resume_hospital_review
AFTER INSERT OR UPDATE OF deleted_at, document_type, training_request_trainee_id ON documents
FOR EACH ROW
EXECUTE FUNCTION miran_resume_after_documents_uploaded();

-- TrainingRequestTrainee is the authoritative source for the current
-- hospital/department/trainer assignment. Rotations are the operational
-- projection consumed by trainer dashboards. Repair old projections first.
UPDATE rotations r
SET trainer_profile_id = trt.assigned_trainer_profile_id,
    department_id = COALESCE(trt.assigned_department_id, r.department_id),
    supervisor_account_id = COALESCE(trt.assigned_supervisor_account_id, r.supervisor_account_id),
    organization_id = COALESCE(trt.assigned_hospital_id, r.organization_id),
    updated_at = NOW()
FROM training_request_trainees trt
WHERE trt.trainee_profile_id = r.trainee_profile_id
  AND trt.assigned_trainer_profile_id IS NOT NULL
  AND (trt.assigned_hospital_id IS NULL OR r.organization_id = trt.assigned_hospital_id)
  AND r.status IN ('active', 'pending_acceptance', 'scheduled');

-- Keep the rotation projection synchronized whenever a hospital assignment is
-- changed, including legacy/admin paths that bypass the normal service method.
CREATE OR REPLACE FUNCTION miran_sync_rotation_from_trainee_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.trainee_profile_id IS NOT NULL
     AND (
       NEW.assigned_hospital_id IS DISTINCT FROM OLD.assigned_hospital_id
       OR NEW.assigned_department_id IS DISTINCT FROM OLD.assigned_department_id
       OR NEW.assigned_trainer_profile_id IS DISTINCT FROM OLD.assigned_trainer_profile_id
       OR NEW.assigned_supervisor_account_id IS DISTINCT FROM OLD.assigned_supervisor_account_id
     ) THEN
    UPDATE rotations
    SET organization_id = COALESCE(NEW.assigned_hospital_id, organization_id),
        department_id = COALESCE(NEW.assigned_department_id, department_id),
        trainer_profile_id = COALESCE(NEW.assigned_trainer_profile_id, trainer_profile_id),
        supervisor_account_id = COALESCE(NEW.assigned_supervisor_account_id, supervisor_account_id),
        updated_at = NOW()
    WHERE trainee_profile_id = NEW.trainee_profile_id
      AND status IN ('active', 'pending_acceptance', 'scheduled')
      AND (
        NEW.assigned_hospital_id IS NULL
        OR organization_id = NEW.assigned_hospital_id
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_training_request_trainee_sync_rotation
  ON training_request_trainees;

CREATE TRIGGER trg_training_request_trainee_sync_rotation
AFTER UPDATE OF assigned_hospital_id, assigned_department_id,
               assigned_trainer_profile_id, assigned_supervisor_account_id,
               trainee_profile_id
ON training_request_trainees
FOR EACH ROW
EXECUTE FUNCTION miran_sync_rotation_from_trainee_assignment();
