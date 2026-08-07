import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

export type ObservabilityStatus = {
  enabled: boolean;
  serviceName: string | null;
  exporter: 'otlp' | 'console' | 'disabled';
  endpoint: string | null;
  reason: string | null;
};

let startedFor: string | null = null;
let sdk: NodeSDK | null = null;

export function observabilityStatus(serviceName?: string): ObservabilityStatus {
  const enabled = process.env.OTEL_ENABLED === 'true';
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || null;
  if (!enabled) {
    return {
      enabled: false,
      serviceName: serviceName ?? startedFor,
      exporter: 'disabled',
      endpoint,
      reason: 'OTEL_ENABLED!=true — tracing desligado (sem falso sucesso).',
    };
  }
  return {
    enabled: true,
    serviceName: serviceName ?? startedFor,
    exporter: endpoint ? 'otlp' : 'console',
    endpoint,
    reason: null,
  };
}

/**
 * Inicializa OpenTelemetry quando OTEL_ENABLED=true.
 * Sem collector: exporta spans no console.
 * Com OTEL_EXPORTER_OTLP_ENDPOINT: exporta via OTLP/HTTP.
 */
export async function startObservability(serviceName: string): Promise<ObservabilityStatus> {
  const status = observabilityStatus(serviceName);
  if (!status.enabled) {
    console.info(JSON.stringify({ service: serviceName, observability: status }));
    return status;
  }
  if (startedFor === serviceName && sdk) return status;

  if (process.env.OTEL_DIAG_LOG === 'true') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
  }

  const exporter = status.endpoint
    ? new OTLPTraceExporter({ url: `${status.endpoint.replace(/\/$/, '')}/v1/traces` })
    : new ConsoleSpanExporter();

  sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: serviceName,
    }),
    traceExporter: exporter,
  });

  await sdk.start();
  startedFor = serviceName;
  console.info(JSON.stringify({ service: serviceName, observability: status }));

  const shutdown = async () => {
    try {
      await sdk?.shutdown();
    } catch {
      // ignore shutdown errors on process exit
    }
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());

  return status;
}
