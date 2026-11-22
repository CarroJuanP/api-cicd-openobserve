// Agente de temperatura -> OpenObserve vía API JSON (stream "host_temperature").
// TEMP_SOURCE=real      : lee /sys/class/thermal/thermal_zone*/temp (solo si el hardware lo expone)
// TEMP_SOURCE=simulated : genera un valor de demostración marcado como source="simulated"
//                         (las instancias EC2 virtualizadas normalmente NO exponen sensores;
//                          si lo usas, debes declararlo en el reporte).
const fs = require('fs');
const path = '/host/sys/class/thermal';
const { OO_URL, OO_BASIC_AUTH, TEMP_SOURCE = 'real' } = process.env;
const INTERVAL = 15000;

function readReal() {
  if (!fs.existsSync(path)) return [];
  return fs.readdirSync(path).filter((d) => d.startsWith('thermal_zone')).map((zone) => {
    try {
      const raw = Number(fs.readFileSync(`${path}/${zone}/temp`, 'utf8'));
      let type = zone;
      try { type = fs.readFileSync(`${path}/${zone}/type`, 'utf8').trim(); } catch (e) {}
      return { zone, sensor_type: type, temperature_c: raw / 1000, source: 'real' };
    } catch (e) { return null; }
  }).filter(Boolean);
}
const readSimulated = () => [{ zone: 'sim0', sensor_type: 'simulated', temperature_c: Number((45 + Math.random() * 10).toFixed(1)), source: 'simulated' }];

async function tick() {
  const rows = TEMP_SOURCE === 'simulated' ? readSimulated() : readReal();
  if (rows.length === 0) return console.warn('[temp-agent] Sin sensores térmicos disponibles en este host.');
  const body = rows.map((r) => ({ ...r, host: process.env.HOSTNAME, _timestamp: Date.now() * 1000 }));
  try {
    const res = await fetch(`${OO_URL}/api/default/host_temperature/_json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${OO_BASIC_AUTH}` },
      body: JSON.stringify(body),
    });
    console.log(`[temp-agent] enviado ${rows.length} lectura(s) -> HTTP ${res.status}`);
  } catch (e) { console.error('[temp-agent] error:', e.message); }
}
setInterval(tick, INTERVAL);
tick();
