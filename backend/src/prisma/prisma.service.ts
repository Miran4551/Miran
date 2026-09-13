// ============================================================================
// Prisma Service — Database connection lifecycle management
// Neon runtime hardening:
// - DATABASE_URL should point to the Neon pooled endpoint for application traffic.
// - DIRECT_URL is reserved for migrations/admin tooling when configured.
// - Conservative pool/timeout defaults are applied only when the operator has
//   not explicitly supplied them in DATABASE_URL.
// - Local PostgreSQL development databases do not require TLS.
// ============================================================================

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

function withNeonRuntimeParams(rawUrl: string): string {
  if (!rawUrl) return rawUrl;

  try {
    const url = new URL(rawUrl);
    const isLocalDatabase = ['localhost', '127.0.0.1', '::1'].includes(
      url.hostname.toLowerCase(),
    );

    // Neon requires TLS, while the local Docker PostgreSQL instance is plain
    // TCP. Only enforce TLS for non-local databases unless the operator has
    // explicitly supplied an sslmode value.
    if (!url.searchParams.has('sslmode') && !isLocalDatabase) {
      url.searchParams.set('sslmode', 'require');
    }
    if (!url.searchParams.has('connect_timeout')) {
      url.searchParams.set('connect_timeout', '15');
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '20');
    }
    // Render free/small instances should keep the application-side pool modest.
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '8');
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const runtimeUrl = withNeonRuntimeParams(process.env.DATABASE_URL ?? '');
    super({
      ...(runtimeUrl ? { datasources: { db: { url: runtimeUrl } } } : {}),
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    const rawUrl = process.env.DATABASE_URL ?? '';
    const isNeon = /neon\.tech/i.test(rawUrl);
    const isPooled = /-pooler\./i.test(rawUrl) || /pooler/i.test(rawUrl);

    this.logger.log(
      `Database connected${isNeon ? ` (Neon${isPooled ? ', pooled runtime endpoint' : ', direct runtime endpoint'})` : ''}`,
    );

    if (isNeon && !isPooled) {
      this.logger.warn(
        'DATABASE_URL is using a direct Neon endpoint. For production runtime, set DATABASE_URL to the Neon pooled endpoint (host containing -pooler) and keep the direct endpoint separate for migrations/admin tasks.',
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }
}
