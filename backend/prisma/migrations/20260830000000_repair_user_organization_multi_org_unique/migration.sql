-- Repair a legacy database-only unique index on user_organizations.user_account_id.
-- The Prisma schema and intended model are multi-org: uniqueness is the pair
-- (user_account_id, organization_id). A stale single-column unique index causes
-- hospital acceptance to fail with P2002 when the trainee is linked to both the
-- hospital and its parent cluster.
--
-- Drop only single-column UNIQUE indexes whose sole indexed column is
-- user_account_id. The valid composite unique index is preserved.
DO $$
DECLARE
  idx_name text;
BEGIN
  FOR idx_name IN
    SELECT i.relname
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a
      ON a.attrelid = t.oid
     AND a.attnum = ix.indkey[0]
     AND NOT a.attisdropped
    WHERE n.nspname = 'public'
      AND t.relname = 'user_organizations'
      AND ix.indisunique
      AND ix.indnatts = 1
      AND a.attname = 'user_account_id'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', idx_name);
  END LOOP;
END $$;
