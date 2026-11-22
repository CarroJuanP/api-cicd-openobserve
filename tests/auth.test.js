const os = require('os');
const path = require('path');
process.env.DB_PATH = path.join(os.tmpdir(), `jest-auth-${process.pid}.db`); // BD aislada
process.env.ADMIN_PASSWORD = 'Admin123!';
const request = require('supertest');
const app = require('../index');

describe('Autenticación y CRUD de usuarios (Jest + Supertest)', () => {
  let token;
  beforeAll(async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: process.env.ADMIN_PASSWORD || 'Admin123!' });
    token = res.body.token;
  });
  const auth = () => ({ Authorization: `Bearer ${token}` });

  test('login correcto devuelve token', () => { expect(token).toBeDefined(); });
  test('login sin datos -> 400', async () => {
    expect((await request(app).post('/api/auth/login').send({})).statusCode).toBe(400);
  });
  test('login con clave errónea -> 401', async () => {
    expect((await request(app).post('/api/auth/login').send({ username: 'admin', password: 'x' })).statusCode).toBe(401);
  });
  test('login con usuario inexistente -> 401', async () => {
    expect((await request(app).post('/api/auth/login').send({ username: 'nadie', password: 'x' })).statusCode).toBe(401);
  });
  test('GET /api/users sin token -> 401', async () => {
    expect((await request(app).get('/api/users')).statusCode).toBe(401);
  });
  test('GET /api/users con token falso -> 401', async () => {
    expect((await request(app).get('/api/users').set({ Authorization: 'Bearer abc.def' })).statusCode).toBe(401);
  });
  test('GET /api/users con token -> 200', async () => {
    const res = await request(app).get('/api/users').set(auth());
    expect(res.statusCode).toBe(200);
    expect(res.body[0]).not.toHaveProperty('password_hash');
  });
  test('ciclo completo POST/GET/PUT/DELETE de usuario', async () => {
    const c = await request(app).post('/api/users').set(auth()).send({ username: `jest_${Date.now()}`, password: 'secreto123', nombre: 'Jest', email: 'j@x.com' });
    expect(c.statusCode).toBe(201);
    const id = c.body.id;
    expect((await request(app).get(`/api/users/${id}`).set(auth())).statusCode).toBe(200);
    expect((await request(app).put(`/api/users/${id}`).set(auth()).send({ nombre: 'Nuevo', password: 'otraclave1' })).statusCode).toBe(200);
    expect((await request(app).delete(`/api/users/${id}`).set(auth())).statusCode).toBe(200);
    expect((await request(app).delete(`/api/users/${id}`).set(auth())).statusCode).toBe(404);
  });
  test('POST /api/users validaciones -> 400', async () => {
    const bad = [
      { username: 'ab', password: 'secreto123', nombre: 'X' },
      { username: 'valido', password: '123', nombre: 'X' },
      { username: 'valido', password: 'secreto123', nombre: '' },
      { username: 'valido', password: 'secreto123', nombre: 'X', email: 'no-email' },
      { username: 'valido', password: 'secreto123', nombre: 'X', rol: 'root' },
    ];
    for (const body of bad) {
      expect((await request(app).post('/api/users').set(auth()).send(body)).statusCode).toBe(400);
    }
  });
  test('POST /api/users username duplicado -> 409', async () => {
    const res = await request(app).post('/api/users').set(auth()).send({ username: 'admin', password: 'secreto123', nombre: 'Dup' });
    expect(res.statusCode).toBe(409);
  });
  test('PUT /api/users con ID inválido / vacío / inexistente', async () => {
    expect((await request(app).put('/api/users/abc').set(auth()).send({ nombre: 'X' })).statusCode).toBe(400);
    expect((await request(app).put('/api/users/1').set(auth()).send({})).statusCode).toBe(400);
    expect((await request(app).put('/api/users/999999').set(auth()).send({ nombre: 'X' })).statusCode).toBe(404);
  });
  test('no puede eliminarse a sí mismo -> 400', async () => {
    const me = await request(app).post('/api/auth/login').send({ username: 'admin', password: process.env.ADMIN_PASSWORD || 'Admin123!' });
    expect((await request(app).delete(`/api/users/${me.body.user.id}`).set(auth())).statusCode).toBe(400);
  });
  test('JSON malformado -> 400', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{mal');
    expect(res.statusCode).toBe(400);
  });
});
