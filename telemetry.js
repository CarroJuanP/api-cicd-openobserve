// Inicialización de OpenTelemetry (RF-04). Debe requerirse ANTES que express.
// Configuración por variables de entorno estándar:
//   OTEL_EXPORTER_OTLP_ENDPOINT = http://openobserve:5080/api/default
//   OTEL_EXPORTER_OTLP_HEADERS  = Authorization=Basic <base64(usuario:password)>
//   OTEL_SERVICE_NAME           = api-devops-sqlite
// Si no hay endpoint (o NODE_ENV=test) el SDK no se inicia y la app funciona igual.
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT && process.env.NODE_ENV !== 'test') {
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

  process.env.OTEL_TRACES_EXPORTER = process.env.OTEL_TRACES_EXPORTER || 'otlp';
  process.env.OTEL_METRICS_EXPORTER = process.env.OTEL_METRICS_EXPORTER || 'otlp';
  process.env.OTEL_LOGS_EXPORTER = process.env.OTEL_LOGS_EXPORTER || 'otlp';
  process.env.OTEL_EXPORTER_OTLP_PROTOCOL = process.env.OTEL_EXPORTER_OTLP_PROTOCOL || 'http/protobuf';
  process.env.OTEL_METRIC_EXPORT_INTERVAL = process.env.OTEL_METRIC_EXPORT_INTERVAL || '15000';
  process.env.OTEL_METRIC_EXPORT_TIMEOUT = process.env.OTEL_METRIC_EXPORT_TIMEOUT || '10000';

  const sdk = new NodeSDK({
    instrumentations: [
      getNodeAutoInstrumentations({ '@opentelemetry/instrumentation-fs': { enabled: false } }),
    ],
  });
  sdk.start();
  console.log('[telemetry] OpenTelemetry iniciado ->', process.env.OTEL_EXPORTER_OTLP_ENDPOINT);

  const shutdown = () => sdk.shutdown().finally(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
