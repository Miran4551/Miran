# Migration startup guard

`migrate-and-start.cjs` is the single production entrypoint for database migration plus application startup. It resolves only the historical staging migration `20260827160000_recover_orphan_trainee_workflow`; every other failed migration stops the service.

New migrations must be tested on a clean PostgreSQL database in CI before merge. Never auto-resolve an unknown Prisma P3009.
