// Utilidades de seguridad sin dependencias externas (crypto nativo de Node)
const crypto = require('crypto');

const SECRET = process.env.JWT_SECRET || 'cambia-este-secreto-en-produccion';
const TOKEN_TTL_SECONDS = 60 * 60 * 8; // 8 horas

// Costo de scrypt: bajo en pruebas (más rápidas), estándar en producción.
// El costo se guarda dentro del hash ("N$sal$hash") para poder verificar siempre con el mismo valor.
const DEFAULT_N = process.env.NODE_ENV === 'test' ? 1024 : 16384;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64, { N: DEFAULT_N }).toString('hex');
  return `${DEFAULT_N}$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  let N = 16384, salt, hash;
  if (stored.includes('$')) {
    const parts = stored.split('$');
    if (parts.length !== 3) return false;
    N = Number(parts[0]); salt = parts[1]; hash = parts[2];
  } else if (stored.includes(':')) { // formato anterior "sal:hash"
    [salt, hash] = stored.split(':');
  } else {
    return false;
  }
  const candidate = crypto.scryptSync(password, salt, 64, { N });
  const original = Buffer.from(hash, 'hex');
  return original.length === candidate.length && crypto.timingSafeEqual(original, candidate);
}

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

function signToken(payload) {
  const body = b64({ ...payload, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS });
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// Middleware Express: exige "Authorization: Bearer <token>"
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'No autenticado o token inválido' });
  req.user = payload;
  next();
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, requireAuth };
