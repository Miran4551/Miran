const { execFileSync, spawn } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

const knownFailedMigration = '20260827160000_recover_orphan_trainee_workflow';

async function resolveOnlyKnownHistoricalFailure() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT migration_name
         FROM "_prisma_migrations"
        WHERE finished_at IS NULL
          AND rolled_back_at IS NULL
        ORDER BY started_at ASC`,
    );

    if (rows.some((row) => row.migration_name === knownFailedMigration)) {
      execFileSync(
        'npx',
        ['prisma', 'migrate', 'resolve', '--rolled-back', knownFailedMigration],
        { stdio: 'inherit' },
      );
      console.log(`Resolved historical failed migration: ${knownFailedMigration}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  await resolveOnlyKnownHistoricalFailure();

  // Never auto-resolve unknown migration failures. Prisma must fail closed so a
  // schema problem cannot be hidden behind a running application.
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit' });

  const app = spawn(process.execPath, ['dist/src/main.js'], {
    stdio: 'inherit',
    env: process.env,
  });

  const forward = (signal) => {
    if (!app.killed) app.kill(signal);
  };
  process.on('SIGTERM', () => forward('SIGTERM'));
  process.on('SIGINT', () => forward('SIGINT'));

  app.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
}

main().catch((error) => {
  console.error('FATAL: database migration/startup failed');
  console.error(error);
  process.exit(1);
});
