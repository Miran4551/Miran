// ============================================================================
// مِران (Miran) — Main Entrypoint
// National Health Training Management Platform
// ============================================================================

import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import express = require('express');
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters';
import { AuditInterceptor } from './common/interceptors';
import { PrismaService } from './prisma/prisma.service';

// helmet's CommonJS export is callable at runtime, while some installed
// TypeScript declarations expose it as a module namespace. Loading it through
// require keeps the compiled Nest application compatible with both shapes.
const helmet: any = require('helmet');

async function bootstrap() {
  // Schedule Wizard conflict checks can contain many generated sessions when
  // several trainees are distributed across a long rotation. Nest's default
  // JSON parser limit is too small for that legitimate payload and can reject
  // the request before the controller/exception filter sees it.
  // Disable Nest's automatic parser and install an explicit 10 MB limit so the
  // check-conflicts endpoint and schedule create/update use the same contract.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use(helmet());

  const envOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN
        .split(',')
        .map((o) => o.trim())
        .filter((o) => Boolean(o) && o !== '*')
    : [];
  const defaultAllowedOrigins = [
    'https://miraan.netlify.app',
    'https://miran-brh.pages.dev',
  ];
  const devOrigins = process.env.NODE_ENV === 'production'
    ? []
    : [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
        'http://127.0.0.1:5175',
      ];
  const allowedOrigins = Array.from(
    new Set([...defaultAllowedOrigins, ...envOrigins, ...devOrigins]),
  );

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Organization-Id',
      'X-Miran-Assignment-Source',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Cache-Control',
      'Pragma',
    ],
    exposedHeaders: ['Authorization'],
  });

  const apiPrefix = process.env.API_PREFIX || 'api';
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['/', 'api/docs'],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const prismaService = app.get(PrismaService);
  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new AuditInterceptor(reflector, prismaService));

  const isProduction = process.env.NODE_ENV === 'production';
  const isSwaggerEnabled = isProduction
    ? process.env.SWAGGER_ENABLED === 'true'
    : process.env.SWAGGER_ENABLED !== 'false';
  if (isSwaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('مِران (Miran) API Documentation')
      .setDescription('المكتبة البرمجية لمنصة مِران الوطنية لإدارة التدريب الصحي ( v3.0 Enterprise )')
      .setVersion('3.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'أدخل رمز JWT هنا',
          in: 'header',
        },
        'JWT-auth',
      )
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Miran Platform backend running on port: ${port}`);
  if (isSwaggerEnabled) {
    console.log(`📚 Swagger documentation enabled at /api/docs`);
  }
}

bootstrap();
