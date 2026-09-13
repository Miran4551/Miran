-- Repair the legacy university-originated request TR-2026-0004.
-- This migration is intentionally surgical and idempotent. The canonical
-- organisations are required only when the legacy request exists; on a fresh
-- test database there is no request to repair, so the migration must not fail
-- merely because seed data is absent.

DO $$
DECLARE
  v_request_id uuid;
  v_university_id uuid;
  v_cluster_id uuid;
  v_old_source_id uuid;
  v_old_target_id uuid;
BEGIN
  SELECT id INTO v_request_id
  FROM training_requests
  WHERE request_number = 'TR-2026-0004'
  LIMIT 1;

  IF v_request_id IS NULL THEN
    RAISE NOTICE 'TR-2026-0004 is not present; nothing to repair';
    RETURN;
  END IF;

  SELECT id INTO v_university_id
  FROM organizations
  WHERE code = 'NBU-UNIVERSITY'
    AND deleted_at IS NULL
  LIMIT 1;

  SELECT id INTO v_cluster_id
  FROM organizations
  WHERE code = 'NB-CLUSTER'
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_university_id IS NULL OR v_cluster_id IS NULL THEN
    RAISE NOTICE 'Canonical organizations are absent; skipping TR-2026-0004 repair';
    RETURN;
  END IF;

  SELECT source_org_id, target_org_id
    INTO v_old_source_id, v_old_target_id
  FROM training_requests
  WHERE id = v_request_id;

  UPDATE training_requests
  SET source_org_id = v_university_id,
      target_org_id = v_cluster_id,
      updated_at = NOW()
  WHERE id = v_request_id
    AND (source_org_id IS DISTINCT FROM v_university_id
      OR target_org_id IS DISTINCT FROM v_cluster_id);

  IF FOUND THEN
    INSERT INTO audit_logs (
      id,
      organization_id,
      actor_id,
      action,
      entity_type,
      entity_id,
      old_values,
      new_values,
      created_at
    ) VALUES (
      gen_random_uuid(),
      v_cluster_id,
      NULL,
      'repair_training_request_cluster_scope',
      'TrainingRequest',
      v_request_id,
      jsonb_build_object('sourceOrgId', v_old_source_id, 'targetOrgId', v_old_target_id),
      jsonb_build_object('sourceOrgId', v_university_id, 'targetOrgId', v_cluster_id),
      NOW()
    );
  END IF;

  INSERT INTO notifications (
    id,
    organization_id,
    user_id,
    title_ar,
    title_en,
    body_ar,
    type,
    reference_type,
    reference_id,
    is_read,
    sent_via,
    created_at
  )
  SELECT
    gen_random_uuid(),
    v_cluster_id,
    recipients.user_account_id,
    'طلب تدريب جديد وارد',
    'New Training Request',
    'تم استلام طلب تدريب جديد (TR-2026-0004) من جامعة الحدود الشمالية — عدد المتدربين: ' || tr.student_count,
    'training_request',
    'TrainingRequest',
    v_request_id,
    FALSE,
    'in_app',
    NOW()
  FROM training_requests tr
  CROSS JOIN (
    SELECT DISTINCT ur.user_account_id
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.organization_id = v_cluster_id
      AND r.code IN ('cluster_manager', 'cluster_administrator', 'training_director')
    UNION
    SELECT DISTINCT oa.user_account_id
    FROM organization_assignments oa
    JOIN roles r ON r.id = oa.role_id
    WHERE oa.organization_id = v_cluster_id
      AND oa.is_active = TRUE
      AND r.code IN ('cluster_manager', 'cluster_administrator', 'training_director')
  ) recipients
  WHERE tr.id = v_request_id
    AND NOT EXISTS (
      SELECT 1
      FROM notifications n
      WHERE n.user_id = recipients.user_account_id
        AND n.type = 'training_request'
        AND n.reference_type = 'TrainingRequest'
        AND n.reference_id = v_request_id
    );
END $$;
