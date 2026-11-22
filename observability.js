// Métricas por endpoint y logs estructurados (RF-04).
const { metrics } = require('@opentelemetry/api');
const { logs, SeverityNumber } = require('@opentelemetry/api-logs');

const meter = metrics.getMeter('api-devops-sqlite');
const requestDuration = meter.createHistogram('app_http_request_duration_ms', {
  description: 'Latencia de las peticiones HTTP por endpoint',
  unit: 'ms',
});
const requestCount = meter.createCounter('app_http_requests_total', {
  description: 'Total de peticiones HTTP por endpoint y status code',
});
const errorCount = meter.createCounter('app_http_errors_total', {
  description: 'Peticiones HTTP con status >= 400 por endpoint',
});

const otelLogger = logs.getLogger('api-devops-sqlite');

// Log estructurado: consola (JSON) + OTLP
function log(level, message, attrs = {}) {
  const severity = {
    info: SeverityNumber.INFO,
    warn: SeverityNumber.WARN,
    error: SeverityNumber.ERROR,
  }[level] || SeverityNumber.INFO;
  if (process.env.NODE_ENV !== 'test') {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...attrs }));
  }
  otelLogger.emit({ severityNumber: severity, severityText: level.toUpperCase(), body: message, attributes: attrs });
}

// Middleware: mide cada petición al terminar la respuesta
function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const route = req.route && req.route.path ? `${req.baseUrl || ''}${req.route.path}` : req.path;
    const attrs = {
      'http.method': req.method,
      'http.route': route,
      'http.status_code': res.statusCode,
    };
    requestDuration.record(ms, attrs);
    requestCount.add(1, attrs);
    if (res.statusCode >= 400) errorCount.add(1, attrs);
    log(res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info', 'http_request', {
      method: req.method,
      route,
      statusCode: res.statusCode,
      durationMs: Number(ms.toFixed(2)),
      user: req.user ? req.user.username : undefined,
    });
  });
  next();
}

// Middleware de errores no controlados (excepciones del sistema)
// eslint-disable-next-line no-unused-vars
function errorMiddleware(err, req, res, next) {
  log('error', 'unhandled_exception', { error: err.message, stack: err.stack, route: req.path });
  res.status(500).json({ error: 'Error interno del servidor' });
}

module.exports = { log, metricsMiddleware, errorMiddleware };
