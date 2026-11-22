// Suite parametrizada (data-driven) de pruebas de API con Jest + Supertest.
// Cada fila de las matrices es un caso de prueba independiente con su propia aserción.
const os = require('os');
const path = require('path');
process.env.DB_PATH = path.join(os.tmpdir(), `jest-matrix-${process.pid}.db`); // BD aislada por proceso
process.env.ADMIN_PASSWORD = 'Admin123!';

const request = require('supertest');
const app = require('../index');

const OMIT = Symbol('omit');
const ADMIN = { username: 'admin', password: 'Admin123!' };
const uniq = (() => { let n = 0; return () => `${Date.now().toString(36)}${(n++).toString(36)}`; })();
const withField = (base, key, value) => { const o = { ...base }; if (value === OMIT) delete o[key]; else o[key] = value; return o; };
const show = (v) => (v === OMIT ? '(omitido)' : JSON.stringify(v));

let token;
let auth;
let victimUser;
let victimProduct;

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 300)); // deja terminar el seed de SQLite
  const res = await request(app).post('/api/auth/login').send(ADMIN);
  token = res.body.token;
  auth = () => ({ Authorization: `Bearer ${token}` });
  const u = await request(app).post('/api/users').set(auth()).send({ username: `victima_${uniq()}`, password: 'secreto123', nombre: 'Víctima' });
  victimUser = u.body.id;
  const p = await request(app).post('/api/productos').send({ nombre: 'Víctima', precio: 10, categoria_id: 1 });
  victimProduct = p.body.id;
});

// ====================================================================
// 1. LOGIN
// ====================================================================
describe('1. POST /api/auth/login', () => {
  const bad400 = [
    {}, { username: '' }, { password: '' }, { username: 'admin' }, { password: 'x' }, { username: 123, password: 'x' },
    { username: 'admin', password: 123 }, { username: '   ', password: 'x' }, { username: null, password: null },
    { username: ['admin'], password: 'x' }, { username: { a: 1 }, password: 'x' }, { username: 'admin', password: null },
    { username: true, password: true }, { username: '', password: '' }, { username: 'admin', password: '' },
  ];
  test.each(bad400.map((b) => [JSON.stringify(b), b]))('400 con body %s', async (_n, body) => {
    const res = await request(app).post('/api/auth/login').send(body);
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  const badPasswords = ['x', 'Admin123', 'admin123!', 'ADMIN123!', 'Admin123! ', ' Admin123!', 'Admin 123!', 'Admin123!!', 'a'.repeat(500),
    "' OR '1'='1", '"; DROP TABLE users;--', '<script>alert(1)</script>', 'ñandú', '密码', '0', 'null', 'undefined', 'admin', 'password', '123456'];
  test.each(badPasswords.map((p) => [p.slice(0, 30), p]))('401 admin con contraseña %s', async (_n, password) => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password });
    expect(res.statusCode).toBe(401);
    expect(res.body).not.toHaveProperty('token');
  });

  const badUsers = ['nobody', 'ADMIN', 'Admin', 'root', 'administrator', 'admin2', "' OR '1'='1", "admin'--", 'admin; DROP TABLE users', 'a'.repeat(300), '1', 'null', 'guest', 'test', 'user'];
  test.each(badUsers.map((u) => [u.slice(0, 30), u]))('401 usuario inexistente %s', async (_n, username) => {
    const res = await request(app).post('/api/auth/login').send({ username, password: 'Admin123!' });
    expect(res.statusCode).toBe(401);
  });

  test('200 devuelve token y datos públicos', async () => {
    const res = await request(app).post('/api/auth/login').send(ADMIN);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('username', 'admin');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });
  test('200 el username se recorta (espacios alrededor)', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: '  admin  ', password: 'Admin123!' });
    expect(res.statusCode).toBe(200);
  });
});

// ====================================================================
// 2. TOKENS INVÁLIDOS en rutas protegidas
// ====================================================================
describe('2. Rutas protegidas rechazan credenciales inválidas', () => {
  const flip = (s) => s.slice(0, -1) + (s.endsWith('A') ? 'B' : 'A');
  const headers = [
    ['sin cabecera', () => undefined], ['Bearer vacío', () => 'Bearer '], ['solo Bearer', () => 'Bearer'], ['token abc', () => 'Bearer abc'],
    ['abc.def', () => 'Bearer abc.def'], ['a.b.c', () => 'Bearer a.b.c'], ['esquema Basic', () => 'Basic dXNlcjpwYXNz'],
    ['bearer en minúscula', (t) => `bearer ${t}`], ['esquema Token', (t) => `Token ${t}`], ['token sin prefijo', (t) => t],
    ['firma alterada', (t) => `Bearer ${flip(t)}`], ['cuerpo alterado', (t) => `Bearer ${flip(t.split('.')[0])}.${t.split('.')[1]}`],
    ['Bearer null', () => 'Bearer null'], ['Bearer undefined', () => 'Bearer undefined'], ['token de 1000 caracteres', () => `Bearer ${'x'.repeat(1000)}`],
    ['solo puntos', () => 'Bearer ..'], ['doble espacio', (t) => `Bearer  ${t}`],
  ];
  const endpoints = [
    ['GET', '/api/users'], ['GET', '/api/users/1'], ['POST', '/api/users'], ['PUT', '/api/users/1'], ['DELETE', '/api/users/1'],
  ];
  const cases = [];
  headers.forEach(([hn, hf]) => endpoints.forEach(([m, u]) => cases.push([`${m} ${u} con ${hn}`, hf, m, u])));
  test.each(cases)('401: %s', async (_n, hf, method, url) => {
    let r = request(app)[method.toLowerCase()](url);
    const h = hf(token);
    if (h !== undefined) r = r.set('Authorization', h);
    const res = await r.send(method === 'POST' ? { username: 'x1234', password: 'secreto123', nombre: 'X' } : method === 'PUT' ? { nombre: 'X' } : undefined);
    expect(res.statusCode).toBe(401);
  });
});

// ====================================================================
// 3. USUARIOS - validaciones (POST)
// ====================================================================
describe('3. POST /api/users validaciones', () => {
  const base = { username: 'valid_user', password: 'secreto123', nombre: 'Nombre', email: 'a@b.co', rol: 'usuario' };
  const invalid = {
    username: ['', 'a', 'ab', '  ', '  a  ', null, 123, true, [], {}, OMIT],
    password: ['', '1', '12345', null, 123, [], OMIT, true],
    nombre: ['', '   ', null, 123, [], OMIT, false],
    email: ['abc', 'a@', '@b.com', 'a@b', 'a b@c.com', 'a@b c.com', 'a@@b.com', 'plain', 123, ['a@b.com'], 'a@b.'],
    rol: ['root', 'ADMIN', 'Admin', '', 'superuser', null, 123, [], true, 'usuario '],
  };
  const cases = [];
  Object.entries(invalid).forEach(([field, values]) => values.forEach((v) => cases.push([`${field} = ${show(v)}`, withField(base, field, v)])));
  test.each(cases)('400 con %s', async (_n, body) => {
    const res = await request(app).post('/api/users').set(auth()).send(body);
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
  test('400 con body vacío {}', async () => {
    expect((await request(app).post('/api/users').set(auth()).send({})).statusCode).toBe(400);
  });
  test('400 sin body', async () => {
    expect((await request(app).post('/api/users').set(auth())).statusCode).toBe(400);
  });
  test('409 username duplicado (admin)', async () => {
    expect((await request(app).post('/api/users').set(auth()).send({ ...base, username: 'admin' })).statusCode).toBe(409);
  });
});

// ====================================================================
// 4. USUARIOS - altas válidas (ciclo POST -> GET -> login -> DELETE)
// ====================================================================
describe('4. Altas válidas de usuario (ciclo completo)', () => {
  const mk = (over) => ({ username: `u_${uniq()}`, password: 'secreto123', nombre: 'Nombre', email: 'a@b.co', rol: 'usuario', ...over });
  const variants = [
    ...['abc', 'user_1', 'a.b-c', 'ÁÉÍ', 'x'.repeat(50), '123', '  pad  '].map((u) => [`username ${JSON.stringify(u)}`, { username: u.trim() + uniq() }]),
    ...['a@b.co', 'x+y@d.com', 'nombre.apellido@dominio.com.mx', null, '', OMIT].map((e) => [`email ${show(e)}`, e === OMIT ? { email: OMIT } : { email: e }]),
    ...['admin', 'usuario'].map((r) => [`rol ${r}`, { rol: r }]),
    ...['abcdef', 'x'.repeat(100), 'ñandú123', '密码密码密码', 'con espacio 1'].map((p) => [`password ${p.slice(0, 12)}`, { password: p }]),
    ...['A', 'Ñandú Pérez', 'x'.repeat(200), '  padded  ', '<b>html</b>', "O'Brien"].map((n) => [`nombre ${n.slice(0, 12)}`, { nombre: n }]),
  ];
  test.each(variants)('201 y ciclo completo con %s', async (_n, over) => {
    const body = mk({});
    Object.entries(over).forEach(([k, v]) => { if (v === OMIT) delete body[k]; else body[k] = v; });
    const create = await request(app).post('/api/users').set(auth()).send(body);
    expect(create.statusCode).toBe(201);
    expect(create.body).toHaveProperty('id');
    expect(create.body).not.toHaveProperty('password_hash');
    const id = create.body.id;
    const get = await request(app).get(`/api/users/${id}`).set(auth());
    expect(get.statusCode).toBe(200);
    expect(get.body).not.toHaveProperty('password_hash');
    const login = await request(app).post('/api/auth/login').send({ username: body.username.trim(), password: body.password });
    expect(login.statusCode).toBe(200);
    expect((await request(app).delete(`/api/users/${id}`).set(auth())).statusCode).toBe(200);
    expect((await request(app).get(`/api/users/${id}`).set(auth())).statusCode).toBe(404);
  });
});

// ====================================================================
// 5. USUARIOS - identificadores y PUT
// ====================================================================
describe('5. Usuarios: IDs inválidos y actualizaciones', () => {
  const badIds = ['abc', '1a', 'a1', '-1', '1.5', '0x10', '1e3', '%20', 'null', 'undefined', 'NaN', 'true', '１２'];
  const idCases = [];
  badIds.forEach((id) => ['GET', 'PUT', 'DELETE'].forEach((m) => idCases.push([`${m} /api/users/${id}`, m, id])));
  test.each(idCases)('400: %s', async (_n, method, id) => {
    const res = await request(app)[method.toLowerCase()](`/api/users/${encodeURIComponent(id)}`).set(auth()).send(method === 'PUT' ? { nombre: 'X' } : undefined);
    expect(res.statusCode).toBe(400);
  });

  const missing = ['0', '999999', '99999999999'];
  const missCases = [];
  missing.forEach((id) => ['GET', 'PUT', 'DELETE'].forEach((m) => missCases.push([`${m} /api/users/${id}`, m, id])));
  test.each(missCases)('404: %s', async (_n, method, id) => {
    const res = await request(app)[method.toLowerCase()](`/api/users/${id}`).set(auth()).send(method === 'PUT' ? { nombre: 'X' } : undefined);
    expect(res.statusCode).toBe(404);
  });

  const putBad = [{}, { nombre: '' }, { nombre: '  ' }, { nombre: 123 }, { nombre: null }, { email: 'bad' }, { email: 123 }, { rol: 'root' }, { rol: null },
    { password: '123' }, { password: 12345678 }, { password: null }, { desconocido: 1 }];
  test.each(putBad.map((b) => [JSON.stringify(b), b]))('PUT 400 con %s', async (_n, body) => {
    const res = await request(app).put(`/api/users/${victimUser}`).set(auth()).send(body);
    expect(res.statusCode).toBe(400);
  });

  const putOk = [{ nombre: 'Nuevo' }, { email: null }, { email: '' }, { email: 'nuevo@x.com' }, { rol: 'admin' }, { rol: 'usuario' }, { password: 'nuevaclave1' },
    { nombre: 'Combo', email: 'c@x.com', rol: 'usuario' }];
  test.each(putOk.map((b) => [JSON.stringify(b), b]))('PUT 200 con %s', async (_n, body) => {
    const res = await request(app).put(`/api/users/${victimUser}`).set(auth()).send(body);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('message', 'Usuario actualizado');
  });
});

// ====================================================================
// 6. PRODUCTOS
// ====================================================================
describe('6. Productos', () => {
  const base = { nombre: 'Prod', precio: 10, categoria_id: 1 };
  const inv = {
    nombre: ['', '   ', 123, null, [], false, OMIT],
    precio: [0, -1, -0.01, '10', null, true, [], {}, OMIT, -1e9],
    categoria_id: [0, -1, 1.5, 'abc', null, '', [], {}, OMIT, -5],
  };
  const cases = [];
  Object.entries(inv).forEach(([f, vals]) => vals.forEach((v) => cases.push([`${f} = ${show(v)}`, withField(base, f, v)])));
  test.each(cases)('POST 400 con %s', async (_n, body) => {
    const res = await request(app).post('/api/productos').send(body);
    expect(res.statusCode).toBe(400);
  });
  test.each([[999999], [2147483647], ['999999']])('POST 404 categoría inexistente %s', async (cat) => {
    const res = await request(app).post('/api/productos').send({ ...base, categoria_id: cat });
    expect(res.statusCode).toBe(404);
  });

  const valid = [
    ...['A', 'Ñandú', ' espacios ', 'x'.repeat(200), '🍕 Pizza', "O'Brien & Sons"].map((n) => [`nombre ${n.slice(0, 10)}`, { nombre: n }]),
    ...[0.01, 1, 9.99, 100, 12345.67, 999999.99].map((p) => [`precio ${p}`, { precio: p }]),
    ...[1, 2, '1'].map((c) => [`categoria_id ${JSON.stringify(c)}`, { categoria_id: c }]),
  ];
  test.each(valid)('ciclo POST/GET/DELETE con %s', async (_n, over) => {
    const body = { ...base, ...over };
    const create = await request(app).post('/api/productos').send(body);
    expect(create.statusCode).toBe(201);
    const id = create.body.id;
    const get = await request(app).get(`/api/productos/${id}`);
    expect(get.statusCode).toBe(200);
    expect(get.body.precio).toBe(body.precio);
    expect((await request(app).delete(`/api/productos/${id}`)).body.changes).toBe(1);
    expect((await request(app).get(`/api/productos/${id}`)).statusCode).toBe(404);
  });

  const putBad = [{}, { nombre: '' }, { nombre: '  ' }, { nombre: 5 }, { precio: 0 }, { precio: -5 }, { precio: 'x' }, { precio: null },
    { categoria_id: 'abc' }, { categoria_id: 0 }, { categoria_id: 1.5 }, { categoria_id: null }];
  test.each(putBad.map((b) => [JSON.stringify(b), b]))('PUT 400 con %s', async (_n, body) => {
    expect((await request(app).put(`/api/productos/${victimProduct}`).send(body)).statusCode).toBe(400);
  });
  test('PUT 404 con categoría inexistente', async () => {
    expect((await request(app).put(`/api/productos/${victimProduct}`).send({ categoria_id: 999999 })).statusCode).toBe(404);
  });
  test.each(['999999', 'abc', '0', '-1'])('PUT 404 producto inexistente %s', async (id) => {
    expect((await request(app).put(`/api/productos/${id}`).send({ nombre: 'X' })).statusCode).toBe(404);
  });
  test.each([[{ nombre: 'Nuevo' }], [{ precio: 5 }], [{ categoria_id: 2 }], [{ nombre: 'Todo', precio: 7.5, categoria_id: 1 }]])('PUT 200 con %j', async (body) => {
    const res = await request(app).put(`/api/productos/${victimProduct}`).send(body);
    expect(res.statusCode).toBe(200);
    expect(res.body.changes).toBe(1);
  });

  test.each(['abc', '0', '-1', '999999', '1.5', '%20'])('GET /api/productos/%s -> 404', async (id) => {
    expect((await request(app).get(`/api/productos/${id}`)).statusCode).toBe(404);
  });
  test('GET /api/productos devuelve arreglo con categoría', async () => {
    const res = await request(app).get('/api/productos');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('categoria');
  });
  test.each(['999999', 'abc', '0'])('DELETE /api/productos/%s inexistente -> 200 con changes 0', async (id) => {
    const res = await request(app).delete(`/api/productos/${id}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.changes).toBe(0);
  });

  test.each([[0], [1], [99.9]])('PATCH precio válido %s -> 200', async (precio) => {
    expect((await request(app).patch('/api/productos/1/precio').send({ precio })).statusCode).toBe(200);
  });
  test.each([['x'], [-1], [null], [OMIT]])('PATCH precio inválido %s -> 400', async (precio) => {
    const body = precio === OMIT ? {} : { precio };
    expect((await request(app).patch('/api/productos/1/precio').send(body)).statusCode).toBe(400);
  });
});

// ====================================================================
// 7. CATEGORÍAS
// ====================================================================
describe('7. Categorías', () => {
  test.each([[{}], [{ nombre: '' }], [{ nombre: null }], [{ nombre: 0 }], [{ nombre: false }]])('POST 400 con %j', async (body) => {
    expect((await request(app).post('/api/categorias').send(body)).statusCode).toBe(400);
  });
  test('POST 400 sin body', async () => {
    expect((await request(app).post('/api/categorias')).statusCode).toBe(400);
  });
  test.each(['Lácteos', 'Frutas', 'Verduras', 'Carnes', 'Panadería', 'Limpieza', 'Ñ', 'x'.repeat(150), '🍎', 'Con & Símbolos <1>'])('ciclo POST/DELETE %s', async (nombre) => {
    const c = await request(app).post('/api/categorias').send({ nombre });
    expect(c.statusCode).toBe(201);
    expect(c.body).toHaveProperty('nombre', nombre);
    const d = await request(app).delete(`/api/categorias/${c.body.id}`);
    expect(d.statusCode).toBe(200);
    expect(d.body.changes).toBe(1);
  });
  test.each(['999999', 'abc'])('DELETE inexistente %s -> changes 0', async (id) => {
    expect((await request(app).delete(`/api/categorias/${id}`)).body.changes).toBe(0);
  });
  test('GET /api/categorias lista las categorías sembradas', async () => {
    const res = await request(app).get('/api/categorias');
    expect(res.statusCode).toBe(200);
    expect(res.body.map((c) => c.nombre)).toContain('Bebidas');
  });
});

// ====================================================================
// 8. RECURSOS REGISTRADOS DINÁMICAMENTE
// ====================================================================
describe('8. Recursos dinámicos', () => {
  const resources = ['clientes', 'usuarios', 'empleados', 'proveedores', 'pedidos', 'ventas', 'inventario', 'inventarios', 'reservas', 'roles', 'marcas', 'sucursales', 'ofertas'];
  test.each(resources)('POST /api/%s -> 201', async (r) => {
    const res = await request(app).post(`/api/${r}`).send({ nombre: 'X' });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('nombre', 'X');
  });
  test.each(resources)('PUT /api/%s/1 -> 200', async (r) => {
    expect((await request(app).put(`/api/${r}/1`).send({ nombre: 'Y' })).statusCode).toBe(200);
  });
  test.each(resources)('PUT /api/%s/abc -> 400', async (r) => {
    expect((await request(app).put(`/api/${r}/abc`).send({ nombre: 'Y' })).statusCode).toBe(400);
  });
  test.each(resources)('DELETE /api/%s/1 -> 200', async (r) => {
    expect((await request(app).delete(`/api/${r}/1`)).statusCode).toBe(200);
  });
  test('POST inventario cantidad 0 -> 400', async () => { expect((await request(app).post('/api/inventario').send({ cantidad: 0 })).statusCode).toBe(400); });
  test('POST inventario cantidad 1 -> 201', async () => { expect((await request(app).post('/api/inventario').send({ cantidad: 1 })).statusCode).toBe(201); });
  test('POST ofertas descuento 101 -> 400', async () => { expect((await request(app).post('/api/ofertas').send({ descuento: 101 })).statusCode).toBe(400); });
  test('POST ofertas descuento 100 -> 201', async () => { expect((await request(app).post('/api/ofertas').send({ descuento: 100 })).statusCode).toBe(201); });
  test('PUT usuarios email null -> 400', async () => { expect((await request(app).put('/api/usuarios/1').send({ email: null })).statusCode).toBe(400); });
  test('PUT marcas nombre booleano -> 400', async () => { expect((await request(app).put('/api/marcas/1').send({ nombre: true })).statusCode).toBe(400); });
  test('PUT empleados salario negativo -> 400', async () => { expect((await request(app).put('/api/empleados/1').send({ salario: -1 })).statusCode).toBe(400); });
  test('PUT empleados salario 0 -> 200', async () => { expect((await request(app).put('/api/empleados/1').send({ salario: 0 })).statusCode).toBe(200); });
});

// ====================================================================
// 9. VARIOS: estado, estáticos, JSON malformado, content-type
// ====================================================================
describe('9. Estado, estáticos y manejo de errores de formato', () => {
  test('GET /api/status -> 200 con status y timestamp', async () => {
    const res = await request(app).get('/api/status');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'online revisando');
    expect(res.body).toHaveProperty('timestamp');
  });
  test.each([['GET', '/api/no-existe'], ['POST', '/api/status'], ['DELETE', '/api/status'], ['GET', '/api/otra/ruta/rara']])('%s %s -> 404', async (m, u) => {
    expect((await request(app)[m.toLowerCase()](u)).statusCode).toBe(404);
  });
  test('GET / sirve el frontend', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('Panel de Gestión');
  });
  test.each(['/app.js', '/styles.css', '/index.html'])('GET %s -> 200', async (f) => {
    expect((await request(app).get(f)).statusCode).toBe(200);
  });
  test('GET /api/db/backup -> 200', async () => { expect((await request(app).get('/api/db/backup')).statusCode).toBe(200); });

  test.each([['/api/auth/login'], ['/api/users'], ['/api/productos'], ['/api/categorias']])('JSON malformado en %s -> 400', async (url) => {
    const res = await request(app).post(url).set(auth()).set('Content-Type', 'application/json').send('{mal');
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error', 'JSON inválido');
  });
  test.each([['/api/auth/login'], ['/api/users'], ['/api/productos']])('Content-Type text/plain en %s -> 400', async (url) => {
    const res = await request(app).post(url).set(auth()).set('Content-Type', 'text/plain').send('hola');
    expect(res.statusCode).toBe(400);
  });
});
