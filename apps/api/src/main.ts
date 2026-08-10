import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { startObservability } from '@sonder/observability';
import { AppModule } from './app.module';
import { assertProductionEnvironment, isSwaggerEnabled } from './common/production-env';

async function bootstrap(): Promise<void> {
  assertProductionEnvironment();
  await startObservability('sonder-api');
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());

  const isProd = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  if (isProd && !corsOrigin) {
    throw new Error('CORS_ORIGIN deve ser explícito em produção.');
  }
  app.enableCors({
    origin: corsOrigin || 'http://localhost:3000',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  if (isSwaggerEnabled()) {
    const config = new DocumentBuilder()
      .setTitle('Sonder Clinic API')
      .setDescription('API do ERP odontológico')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
    if (isProd) {
      // eslint-disable-next-line no-console
      console.warn(JSON.stringify({
        service: 'sonder-api',
        event: 'swagger.enabled_in_production',
        note: 'Restrinja /docs por rede ou autenticação. SWAGGER_ENABLED=true em produção.',
      }));
    }
  }

  await app.listen(Number(process.env.API_PORT ?? 4000));
}

void bootstrap();
