const { test, expect } = require('@playwright/test');

let token;
test.beforeAll(async ({ request }) => {
  const res = await request.post('/api/auth/login', { data: { username: 'admin', password: 'Admin123!' } });
  expect(res.status()).toBe(200);
  token = (await res.json()).token;
});
const auth = () => ({ Authorization: `Bearer ${token}` });

test.describe('Backend (API) con Playwright', () => {
  test('B1. GET /api/status -> 200', async ({ request }) => {
    const res = await request.get('/api/status');
    expect(res.status()).toBe(200);
    expect(await res.json()).toHaveProperty('status');
  });

  test('B2. POST /api/auth/login con credenciales inválidas -> 401', async ({ request }) => {
    const res = await request.post('/api/auth/login', { data: { username: 'admin', password: 'mal' } });
    expect(res.status()).toBe(401);
  });

  test('B3. POST /api/auth/login sin body -> 400', async ({ request }) => {
    const res = await request.post('/api/auth/login', { data: {} });
    expect(res.status()).toBe(400);
  });

  test('B4. GET /api/users sin token -> 401', async ({ request }) => {
    expect((await request.get('/api/users')).status()).toBe(401);
  });

  test('B5. GET /api/users con token -> 200 sin exponer hashes', async ({ request }) => {
    const res = await request.get('/api/users', { headers: auth() });
    expect(res.status()).toBe(200);
    const users = await res.json();
    expect(users.length).toBeGreaterThan(0);
    expect(users[0]).not.toHaveProperty('password_hash');
  });

  test('B6. CRUD completo de usuario', async ({ request }) => {
    const create = await request.post('/api/users', { headers: auth(), data: { username: `api_${Date.now()}`, password: 'secreto123', nombre: 'API User' } });
    expect(create.status()).toBe(201);
    const { id } = await create.json();
    expect((await request.get(`/api/users/${id}`, { headers: auth() })).status()).toBe(200);
    expect((await request.put(`/api/users/${id}`, { headers: auth(), data: { nombre: 'Editado' } })).status()).toBe(200);
    expect((await request.delete(`/api/users/${id}`, { headers: auth() })).status()).toBe(200);
    expect((await request.get(`/api/users/${id}`, { headers: auth() })).status()).toBe(404);
  });

  test('B7. POST /api/users con rol inválido -> 400', async ({ request }) => {
    const res = await request.post('/api/users', { headers: auth(), data: { username: 'rolmalo', password: 'secreto123', nombre: 'X', rol: 'root' } });
    expect(res.status()).toBe(400);
  });

  test('B8. GET /api/users/abc -> 400', async ({ request }) => {
    expect((await request.get('/api/users/abc', { headers: auth() })).status()).toBe(400);
  });

  test('B9. CRUD de producto', async ({ request }) => {
    const create = await request.post('/api/productos', { data: { nombre: 'Prod API', precio: 10, categoria_id: 1 } });
    expect(create.status()).toBe(201);
    const { id } = await create.json();
    expect((await request.put(`/api/productos/${id}`, { data: { precio: 12.5 } })).status()).toBe(200);
    expect((await request.delete(`/api/productos/${id}`)).status()).toBe(200);
  });

  test('B10. POST /api/productos con precio negativo -> 400 y producto inexistente -> 404', async ({ request }) => {
    expect((await request.post('/api/productos', { data: { nombre: 'Neg', precio: -5, categoria_id: 1 } })).status()).toBe(400);
    expect((await request.get('/api/productos/999999')).status()).toBe(404);
  });

  test('B11. JSON malformado -> 400', async ({ request }) => {
    const res = await request.post('/api/auth/login', { headers: { 'Content-Type': 'application/json' }, data: '{mal json' });
    expect(res.status()).toBe(400);
  });
});
