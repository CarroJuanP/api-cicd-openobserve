// Envuelve db.run/get/all de sqlite3 para generar un span por consulta SQL
// (RF-04: trazas que incluyen las consultas a base de datos).
const { trace, SpanStatusCode } = require('@opentelemetry/api');
const tracer = trace.getTracer('api-devops-sqlite-db');

function traceDatabase(db) {
  ['run', 'get', 'all'].forEach((method) => {
    const original = db[method].bind(db);
    db[method] = function (sql, ...args) {
      const idx = args.map((a) => typeof a).lastIndexOf('function');
      if (idx === -1) return original(sql, ...args);
      const span = tracer.startSpan(`sqlite ${method}`, {
        attributes: {
          'db.system': 'sqlite',
          'db.operation': String(sql).trim().split(/\s+/)[0].toUpperCase(),
          'db.statement': String(sql).replace(/\s+/g, ' ').trim().slice(0, 300),
        },
      });
      const cb = args[idx];
      args[idx] = function (err, ...rest) {
        if (err) {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        }
        span.end();
        return cb.call(this, err, ...rest); // conserva this.lastID / this.changes
      };
      return original(sql, ...args);
    };
  });
  return db;
}

module.exports = traceDatabase;
