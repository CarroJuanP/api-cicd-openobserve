// Contrato de la API verificado con Playwright (request fixture): complementa a Jest.
const { test, expect } = require('@playwright/test');

const resources = ['clientes', 'usuarios', 'empleados', 'proveedores', 'pedidos', 'ventas', 'inventario', 'inventarios', 'reservas', 'roles', 'marcas', 'sucursales', 'ofertas'];

test.describe('API 1. Recursos genéricos', () => {
  for (const r of resources) {
    test(`/api/${r}: POST 201, PUT 200, PUT id inválido 400, DELETE 200`, async ({ request }) => {
      expect((await request.post(`/api/${r}`, { data: { nombre: 'X' } })).status()).toBe(201);
      expect((await request.put(`/api/${r}/1`, { data: { nombre: 'Y' } })).status()).toBe(200);
      expect((await request.put(`/api/${r}/abc`, { data: { nombre: 'Y' } })).status()).toBe(400);
      expect((await request.delete(`/api/${r}/1`)).status()).toBe(200);
    });
  }
});

test.describe('API 2. Login y rutas protegidas', () => {
  const malas = [{}, { username: 'admin' }, { password: 'x' }, { username: '', password: '' }, { username: 123, password: 'x' }];
  for (const data of malas) {
    test(`login 400 con ${JSON.stringify(data)}`, async ({ request }) => {
      expect((await request.post('/api/auth/login', { data })).status()).toBe(400);
    });
  }
  const credenciales = [['admin', 'x'], ['admin', 'ADMIN123!'], ['nobody', 'Admin123!'], ['ADMIN', 'Admin123!'], ["' OR '1'='1", "' OR '1'='1"], ['admin', ' Admin123!'], ['root', 'root'], ['', 'x']];
  for (const [username, password] of credenciales) {
    test(`login rechazado: ${username || '(vacío)'} / ${password}`, async ({ request }) => {
      const res = await request.post('/api/auth/login', { data: { username, password } });
      expect([400, 401]).toContain(res.status());
      expect(await res.json()).not.toHaveProperty('token');
    });
  }
  const headers = [undefined, 'Bearer ', 'Bearer abc', 'Bearer abc.def', 'Basic dXNlcjpwYXNz', 'Token xyz', 'Bearer null'];
  const rutas = [['GET', '/api/users'], ['GET', '/api/users/1'], ['DELETE', '/api/users/1']];
  for (const h of headers) {
    for (const [m, u] of rutas) {
      test(`${m} ${u} con cabecera ${h ?? '(ninguna)'} -> 401`, async ({ request }) => {
        const res = await request.fetch(u, { method: m, headers: h ? { Authorization: h } : {} });
        expect(res.status()).toBe(401);
      });
    }
  }
});

test.describe('API 3. Estado, estáticos y errores de formato', () => {
  test('GET /api/status -> 200 con timestamp', async ({ request }) => {
    const res = await request.get('/api/status');
    expect(res.status()).toBe(200);
    expect(await res.json()).toHaveProperty('timestamp');
  });
  for (const u of ['/', '/app.js', '/styles.css', '/index.html']) {
    test(`GET ${u} -> 200`, async ({ request }) => { expect((await request.get(u)).status()).toBe(200); });
  }
  for (const u of ['/api/no-existe', '/api/otra/ruta']) {
    test(`GET ${u} -> 404`, async ({ request }) => { expect((await request.get(u)).status()).toBe(404); });
  }
  for (const u of ['/api/auth/login', '/api/productos', '/api/categorias']) {
    test(`JSON malformado en ${u} -> 400`, async ({ request }) => {
      const res = await request.post(u, { headers: { 'Content-Type': 'application/json' }, data: '{mal json' });
      expect(res.status()).toBe(400);
    });
  }
  for (const id of ['abc', '0', '-1', '999999']) {
    test(`GET /api/productos/${id} -> 404`, async ({ request }) => { expect((await request.get(`/api/productos/${id}`)).status()).toBe(404); });
  }
  for (const precio of [0, -1, '10', null]) {
    test(`POST /api/productos con precio ${JSON.stringify(precio)} -> 400`, async ({ request }) => {
      expect((await request.post('/api/productos', { data: { nombre: 'X', precio, categoria_id: 1 } })).status()).toBe(400);
    });
  }
  test('encabezado de contenido JSON en /api/productos', async ({ request }) => {
    const res = await request.get('/api/productos');
    expect(res.headers()['content-type']).toContain('application/json');
  });
});
