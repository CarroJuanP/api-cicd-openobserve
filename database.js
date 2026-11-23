const sqlite3 = require('sqlite3').verbose();
const traceDatabase = require('./dbtrace');
const { hashPassword } = require('./security');

const DB_PATH = process.env.DB_PATH || './midatabase.db';

// Conectar a la BD (si no existe el archivo 'midatabase.db', SQLite lo crea solo)
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error al abrir la base de datos:', err.message);
  } else {
    console.log('Conectado exitosamente a SQLite.');
  }
});

// Crear las tablas e insertar datos iniciales
const tracedDb = traceDatabase(db);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => err ? reject(err) : resolve());
  });
}

tracedDb.ready = (async () => {
  await run(`CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL
  )`);
  await run(`CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    precio REAL NOT NULL,
    categoria_id INTEGER,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE
  )`);
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    email TEXT,
    rol TEXT NOT NULL DEFAULT 'usuario',
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(
    `INSERT OR IGNORE INTO users (username, nombre, email, rol, password_hash) VALUES (?, ?, ?, ?, ?)`,
    ['admin', 'Administrador', 'admin@example.com', 'admin', hashPassword(process.env.ADMIN_PASSWORD || 'Admin123!')]
  );
  await run(`INSERT OR IGNORE INTO categorias (id, nombre) VALUES (1, 'Bebidas')`);
  await run(`INSERT OR IGNORE INTO categorias (id, nombre) VALUES (2, 'Botanas')`);
  await run(`INSERT OR IGNORE INTO productos (id, nombre, precio, categoria_id) VALUES (1, 'Refresco 600ml', 18.50, 1)`);
  await run(`INSERT OR IGNORE INTO productos (id, nombre, precio, categoria_id) VALUES (2, 'Papas Saladas', 22.00, 2)`);
  console.log('Tablas preparadas e información inicial cargada.');
  return tracedDb;
})();

module.exports = tracedDb;