import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { startObservability, hydrateDockerSecrets, nestLoggerLevels } from '@sonder/observability';
import { AppModule } from './app.module';
import { assertProductionEnvironment, isSwaggerEnabled } from './common/production-env';
import { PublicApiModule } from './modules/public-api/public-api.module';
import { setPublicOpenApiDocument } from './modules/public-api/public-api-openapi';

if (!(BigInt.prototype as unknown as { toJSON?: () => number }).toJSON) {
  (BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function toJSON() {
    return Number(this);
  };
}

async function bootstrap(): Promise<void> {
  hydrateDockerSecrets();
  assertProductionEnvironment();
  await startObservability('sonder-api');
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: nestLoggerLevels(),
  });

  const isProd = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
  const httpAdapter = app.getHttpAdapter();
  if (typeof httpAdapter.getInstance === 'function') {
    const instance = httpAdapter.getInstance() as { set?: (key: string, value: unknown) => void };
    if (isProd && typeof instance.set === 'function') {
      instance.set('trust proxy', 1);
    }
  }

  app.use(helmet({
    contentSecurityPolicy: isSwaggerEnabled() ? false : {
      useDefaults: true,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());

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
      .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'apiKey')
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

  const publicConfig = new DocumentBuilder()
    .setTitle('Sonder Clinic — API pública')
    .setDescription([
      'API para integrações externas (agendamento, pacientes e catálogo).',
      '',
      '**Autenticação:** envie o header `X-API-Key` com a chave gerada em Configurações → API pública. O valor completo aparece só na criação.',
      '',
      '**Isolamento:** a chave vale somente para a organização (e clínica, se restrita) em que foi emitida.',
      '',
      '**Escopos:** `appointments:read|write`, `patients:read|write`, `catalog:read`.',
      '',
      '**Limite:** 120 requisições por minuto por chave.',
      '',
      '**Datas:** ISO-8601 com fuso, por exemplo `2026-08-14T13:00:00.000Z`.',
      '',
      '**Webhooks:** ainda não disponíveis; o recurso está previsto para uma versão futura.',
    ].join('\n'))
    .setVersion('1.0.0')
    .addServer('/api/v1', 'API versionada')
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'apiKey')
    .build();
  setPublicOpenApiDocument(SwaggerModule.createDocument(app, publicConfig, {
    include: [PublicApiModule],
    ignoreGlobalPrefix: true,
  }));

  await app.listen(Number(process.env.API_PORT ?? 4000));
}

void bootstrap();
