import { ConfigService } from '@nestjs/config';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { CSRF_HEADER } from './shared/auth/guards/csrf-header.guard';
import { type Env } from './shared/config/env';

export const API_PREFIX = 'api/v1';

/** Shared by main.ts and the e2e tests so both run the exact same HTTP pipeline. */
export function configureApp(app: NestExpressApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  if (config.get('TRUST_PROXY', { infer: true })) app.set('trust proxy', 1);
  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('WEB_ORIGINS', { infer: true }),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', CSRF_HEADER],
  });
  app.enableShutdownHooks();

  // API docs reveal every endpoint, so they are off in production unless API_DOCS=true.
  if (config.get('API_DOCS', { infer: true })) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Quick Park API').setVersion('1.0').addBearerAuth().build(),
    );
    SwaggerModule.setup('api/docs', app, doc, { jsonDocumentUrl: 'api/docs-json' });
  }
  return app;
}
