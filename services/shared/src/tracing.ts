import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const serviceName = process.env.OTEL_SERVICE_NAME || 'unknown-service';
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (otlpEndpoint) {
  const sdk = new NodeSDK({
    resource: new Resource({ [ATTR_SERVICE_NAME]: serviceName }),
    traceExporter: new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
      }),
    ],
  });

  sdk.start();

  const shutdown = () => {
    sdk.shutdown().catch(console.error);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.log(`[tracing] ${serviceName} → ${otlpEndpoint}`);
} else {
  console.log(`[tracing] ${serviceName} — OTEL_EXPORTER_OTLP_ENDPOINT 미설정, 트레이싱 비활성`);
}
