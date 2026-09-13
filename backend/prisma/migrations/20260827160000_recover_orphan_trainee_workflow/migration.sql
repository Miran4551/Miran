-- Legacy orphan recovery was found failed in the staging database and was
-- blocking every subsequent Prisma migration (P3009). The recovery logic is
-- intentionally deferred until it can be run as a dedicated, verified data
-- repair. This migration remains a successful no-op so fresh databases and
-- existing databases can advance to later migrations safely.
--
-- This file must stay in place because the migration name is already present
-- in Prisma migration history on deployed databases.

BEGIN;
COMMIT;
