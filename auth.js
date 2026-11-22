// Login y CRUD de usuarios (según el diagrama: Login + CRUD USER/PRODUCTO)
const express = require('express');
const db = require('./database');
const { hashPassword, verifyPassword, signToken, requireAuth } = require('./security');
const { log } = require('./observability');

const router = express.Router();
const ROLES = ['admin', 'usuario'];
const publicFields = 'id, username, nombre, email, rol, created_at';
const isValidId = (id) => /^\d+$/.test(String(id));
const isEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// POST /api/auth/login
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }
  db.get('SELECT * FROM users WHERE username = ?', [username.trim()], (err, user) => {
    /* istanbul ignore next */
    if (err) return res.status(500).json({ error: err.message });
    if (!user || !verifyPassword(password, user.password_hash)) {
      log('warn', 'login_failed', { username: username.trim() });
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    log('info', 'login_ok', { username: user.username });
    const token = signToken({ id: user.id, username: user.username, rol: user.rol });
    res.json({ token, user: { id: user.id, username: user.username, nombre: user.nombre, rol: user.rol } });
  });
});

// A partir de aquí todo /api/users exige token
router.use('/users', requireAuth);

router.get('/users', (req, res) => {
  db.all(`SELECT ${publicFields} FROM users ORDER BY id`, [], (err, rows) => {
    /* istanbul ignore next */
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/users/:id', (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
  db.get(`SELECT ${publicFields} FROM users WHERE id = ?`, [req.params.id], (err, row) => {
    /* istanbul ignore next */
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(row);
  });
});

router.post('/users', (req, res) => {
  const { username, password, nombre, email, rol = 'usuario' } = req.body || {};
  if (typeof username !== 'string' || username.trim().length < 3) return res.status(400).json({ error: 'Username inválido (mínimo 3 caracteres)' });
  if (typeof password !== 'string' || password.length < 6) return res.status(400).json({ error: 'Contraseña inválida (mínimo 6 caracteres)' });
  if (typeof nombre !== 'string' || !nombre.trim()) return res.status(400).json({ error: 'Nombre inválido' });
  if (email !== undefined && email !== null && email !== '' && !isEmail(email)) return res.status(400).json({ error: 'Email inválido' });
  if (!ROLES.includes(rol)) return res.status(400).json({ error: 'Rol inválido' });

  db.run(
    'INSERT INTO users (username, nombre, email, rol, password_hash) VALUES (?, ?, ?, ?, ?)',
    [username.trim(), nombre.trim(), email || null, rol, hashPassword(password)],
    function (err) {
      if (err && /UNIQUE/i.test(err.message)) return res.status(409).json({ error: 'El username ya existe' });
      /* istanbul ignore next */
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, username: username.trim(), nombre: nombre.trim(), email: email || null, rol });
    }
  );
});

router.put('/users/:id', (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
  const { nombre, email, rol, password } = req.body || {};
  const sets = [];
  const vals = [];
  if (nombre !== undefined) {
    if (typeof nombre !== 'string' || !nombre.trim()) return res.status(400).json({ error: 'Nombre inválido' });
    sets.push('nombre = ?'); vals.push(nombre.trim());
  }
  if (email !== undefined) {
    if (email !== null && email !== '' && !isEmail(email)) return res.status(400).json({ error: 'Email inválido' });
    sets.push('email = ?'); vals.push(email || null);
  }
  if (rol !== undefined) {
    if (!ROLES.includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
    sets.push('rol = ?'); vals.push(rol);
  }
  if (password !== undefined) {
    if (typeof password !== 'string' || password.length < 6) return res.status(400).json({ error: 'Contraseña inválida (mínimo 6 caracteres)' });
    sets.push('password_hash = ?'); vals.push(hashPassword(password));
  }
  if (sets.length === 0) return res.status(400).json({ error: 'Debes enviar al menos un campo para actualizar' });

  vals.push(req.params.id);
  db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, vals, function (err) {
    /* istanbul ignore next */
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ message: 'Usuario actualizado', id: Number(req.params.id) });
  });
});

router.delete('/users/:id', (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
  db.run('DELETE FROM users WHERE id = ?', [req.params.id], function (err) {
    /* istanbul ignore next */
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ message: 'Usuario eliminado', changes: this.changes });
  });
});

module.exports = router;
