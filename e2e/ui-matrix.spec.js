// Pruebas de interfaz (Playwright) data-driven: cada fila es un caso independiente.
const { test, expect } = require('@playwright/test');

const ADMIN = { username: 'admin', password: 'Admin123!' };
const uniq = (() => { let n = 0; return () => `${Date.now().toString(36)}${(n++).toString(36)}`; })();

// Inicia sesión por API e inyecta el token para no repetir el login en cada prueba de CRUD
async function openPanel(page) {
  const res = await page.request.post('/api/auth/login', { data: ADMIN });
  const { token, user } = await res.json();
  await page.goto('/');
  await page.evaluate(([t, u]) => {
    sessionStorage.setItem('token', t);
    sessionStorage.setItem('user', JSON.stringify(u));
  }, [token, user]);
  await page.reload();
  await expect(page.getByTestId('whoami')).toBeVisible();
  return token;
}
const userRow = (page, username) => page.locator(`[data-testid="user-row"][data-username="${username}"]`);
const productRow = (page, nombre) => page.locator(`[data-testid="product-row"][data-nombre="${nombre}"]`);
async function fillUser(page, { username = '', nombre = '', email = '', password = '', rol = 'usuario' }) {
  await page.getByTestId('user-username').fill(username);
  await page.getByTestId('user-nombre').fill(nombre);
  await page.getByTestId('user-email').fill(email);
  await page.getByTestId('user-password').fill(password);
  await page.getByTestId('user-rol').selectOption(rol);
}

// ------------------------------------------------------------------
// 1. LOGIN (UI)
// ------------------------------------------------------------------
test.describe('UI 1. Login', () => {
  const requeridos = [['', ''], ['', 'Admin123!'], ['admin', ''], ['   ', 'x'], ['   ', '   ']];
  for (const [u, p] of requeridos) {
    test(`mensaje de campos requeridos con usuario=${JSON.stringify(u)} contraseña=${JSON.stringify(p)}`, async ({ page }) => {
      await page.goto('/');
      await page.getByTestId('login-username').fill(u);
      await page.getByTestId('login-password').fill(p);
      await page.getByTestId('login-submit').click();
      await expect(page.getByTestId('login-error')).toHaveText('Usuario y contraseña son requeridos');
    });
  }

  const malos = [['admin', 'x'], ['admin', 'Admin123'], ['admin', 'admin123!'], ['admin', 'ADMIN123!'], ['admin', ' Admin123!'], ['admin', 'Admin123!!'],
    ['ADMIN', 'Admin123!'], ['Admin', 'Admin123!'], ['root', 'Admin123!'], ['nobody', 'nobody'], ["' OR '1'='1", "' OR '1'='1"], ["admin'--", 'x'],
    ['<script>alert(1)</script>', 'x'], ['admin', '<script>'], ['ñandú', 'ñandú'], ['1', '1'], ['guest', 'guest'], ['test', 'test'], ['administrador', 'Admin123!'], ['admin2', 'Admin123!']];
  for (const [u, p] of malos) {
    test(`credenciales inválidas: ${u.slice(0, 20)} / ${p.slice(0, 20)}`, async ({ page }) => {
      await page.goto('/');
      await page.getByTestId('login-username').fill(u);
      await page.getByTestId('login-password').fill(p);
      await page.getByTestId('login-submit').click();
      await expect(page.getByTestId('login-error')).toHaveText('Credenciales inválidas');
      await expect(page.getByTestId('login-submit')).toBeVisible();
    });
  }

  test('login válido con espacios alrededor del usuario', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('login-username').fill('  admin  ');
    await page.getByTestId('login-password').fill('Admin123!');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('whoami')).toContainText('Administrador');
  });
  test('login con la tecla Enter', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('login-username').fill('admin');
    await page.getByTestId('login-password').fill('Admin123!');
    await page.getByTestId('login-password').press('Enter');
    await expect(page.getByTestId('whoami')).toBeVisible();
  });
  test('la contraseña se muestra enmascarada', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('login-password')).toHaveAttribute('type', 'password');
  });
  test('el panel no es visible antes de autenticarse', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tab-users')).toBeHidden();
  });
});

// ------------------------------------------------------------------
// 2. NAVEGACIÓN Y SESIÓN
// ------------------------------------------------------------------
test.describe('UI 2. Navegación y sesión', () => {
  test('la sesión persiste al recargar', async ({ page }) => {
    await openPanel(page);
    await page.reload();
    await expect(page.getByTestId('whoami')).toContainText('Administrador');
  });
  test('cerrar sesión limpia el token y vuelve al login', async ({ page }) => {
    await openPanel(page);
    await page.getByTestId('logout').click();
    await expect(page.getByTestId('login-submit')).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('token'))).toBeNull();
  });
  test('tras cerrar sesión y recargar sigue el login', async ({ page }) => {
    await openPanel(page);
    await page.getByTestId('logout').click();
    await page.reload();
    await expect(page.getByTestId('login-submit')).toBeVisible();
  });
  test('un token falso en sessionStorage regresa al login', async ({ page }) => {
    await page.addInitScript(() => { sessionStorage.setItem('token', 'falso.token'); sessionStorage.setItem('user', JSON.stringify({ nombre: 'X', rol: 'admin' })); });
    await page.goto('/');
    await expect(page.getByTestId('login-submit')).toBeVisible();
  });
  test('pestaña Usuarios visible por defecto', async ({ page }) => {
    await openPanel(page);
    await expect(page.getByTestId('users-table')).toBeVisible();
    await expect(page.getByTestId('products-table')).toBeHidden();
  });
  test('cambiar a Productos y regresar a Usuarios', async ({ page }) => {
    await openPanel(page);
    await page.getByTestId('tab-products').click();
    await expect(page.getByTestId('products-table')).toBeVisible();
    await expect(page.getByTestId('users-table')).toBeHidden();
    await page.getByTestId('tab-users').click();
    await expect(page.getByTestId('users-table')).toBeVisible();
  });
  for (const h of ['ID', 'Username', 'Nombre', 'Email', 'Rol', 'Acciones']) {
    test(`tabla de usuarios muestra la columna ${h}`, async ({ page }) => {
      await openPanel(page);
      await expect(page.getByTestId('users-table').locator('th', { hasText: h })).toBeVisible();
    });
  }
  for (const h of ['ID', 'Nombre', 'Precio', 'Categoría', 'Acciones']) {
    test(`tabla de productos muestra la columna ${h}`, async ({ page }) => {
      await openPanel(page);
      await page.getByTestId('tab-products').click();
      await expect(page.getByTestId('products-table').locator('th', { hasText: h })).toBeVisible();
    });
  }
  test('la tabla de usuarios incluye al administrador', async ({ page }) => {
    await openPanel(page);
    await expect(userRow(page, 'admin')).toBeVisible();
  });
  for (const c of ['Bebidas', 'Botanas']) {
    test(`el selector de categorías incluye ${c}`, async ({ page }) => {
      await openPanel(page);
      await page.getByTestId('tab-products').click();
      await expect(page.getByTestId('product-categoria').locator('option', { hasText: c })).toHaveCount(1);
    });
  }
  test('el administrador no puede eliminarse a sí mismo', async ({ page }) => {
    await openPanel(page);
    await userRow(page, 'admin').getByText('Eliminar').click();
    await expect(page.getByTestId('msg')).toHaveText('No puedes eliminar tu propio usuario');
  });
});

// ------------------------------------------------------------------
// 3. USUARIOS - altas válidas (alta -> verificación -> baja)
// ------------------------------------------------------------------
test.describe('UI 3. Usuarios: altas válidas', () => {
  const casos = [
    ['minúsculas', 'ui_user', 'Usuario Uno', 'uno@example.com', 'secreto123', 'usuario'],
    ['con guion', 'ui-user', 'Usuario Dos', 'dos@example.com', 'secreto123', 'usuario'],
    ['con punto', 'ui.user', 'Usuario Tres', 'tres@example.com', 'secreto123', 'usuario'],
    ['numérico', '12345', 'Numérico', 'n@example.com', 'secreto123', 'usuario'],
    ['largo', 'u'.repeat(40), 'Largo', 'l@example.com', 'secreto123', 'usuario'],
    ['mínimo 3', 'abc', 'Mínimo', 'm@example.com', 'secreto123', 'usuario'],
    ['sin email', 'ui_noemail', 'Sin Email', '', 'secreto123', 'usuario'],
    ['email con +', 'ui_plus', 'Con Plus', 'a+b@example.com', 'secreto123', 'usuario'],
    ['email subdominio', 'ui_sub', 'Subdominio', 'a@mail.example.com.mx', 'secreto123', 'usuario'],
    ['rol admin', 'ui_admin', 'Rol Admin', 'adm@example.com', 'secreto123', 'admin'],
    ['rol usuario', 'ui_rolu', 'Rol Usuario', 'ru@example.com', 'secreto123', 'usuario'],
    ['clave de 6', 'ui_pw6', 'Clave Seis', 'p6@example.com', 'abcdef', 'usuario'],
    ['clave larga', 'ui_pwlong', 'Clave Larga', 'pl@example.com', 'x'.repeat(80), 'usuario'],
    ['clave con símbolos', 'ui_pwsym', 'Clave Símbolos', 'ps@example.com', 'P@$$w0rd!#', 'usuario'],
    ['nombre con acentos', 'ui_acc', 'José Ángel Muñoz', 'ja@example.com', 'secreto123', 'usuario'],
    ['nombre con apóstrofo', 'ui_apos', "D'Angelo", 'da@example.com', 'secreto123', 'usuario'],
    ['nombre con &', 'ui_amp', 'Ana & Co', 'ac@example.com', 'secreto123', 'usuario'],
    ['nombre de una letra', 'ui_one', 'A', 'o@example.com', 'secreto123', 'usuario'],
    ['nombre largo', 'ui_nlong', 'N'.repeat(100), 'nl@example.com', 'secreto123', 'usuario'],
    ['mayúsculas', 'UI_UPPER', 'Mayúsculas', 'up@example.com', 'secreto123', 'usuario'],
  ];
  for (const [etiqueta, base, nombre, email, password, rol] of casos) {
    test(`alta y baja: ${etiqueta}`, async ({ page }) => {
      await openPanel(page);
      const username = `${base}${uniq()}`;
      await fillUser(page, { username, nombre, email, password, rol });
      await page.getByTestId('user-save').click();
      await expect(page.getByTestId('msg')).toHaveText('Usuario creado');
      const row = userRow(page, username);
      await expect(row).toBeVisible();
      await expect(row).toContainText(rol);
      await row.getByText('Eliminar').click();
      await expect(page.getByTestId('msg')).toHaveText('Usuario eliminado');
      await expect(row).toHaveCount(0);
    });
  }
  test('el formulario se limpia tras guardar', async ({ page }) => {
    await openPanel(page);
    const username = `ui_clean${uniq()}`;
    await fillUser(page, { username, nombre: 'Limpio', password: 'secreto123' });
    await page.getByTestId('user-save').click();
    await expect(page.getByTestId('msg')).toHaveText('Usuario creado');
    await expect(page.getByTestId('user-username')).toHaveValue('');
    await userRow(page, username).getByText('Eliminar').click();
  });
  test('el usuario creado puede iniciar sesión', async ({ page }) => {
    await openPanel(page);
    const username = `ui_login${uniq()}`;
    await fillUser(page, { username, nombre: 'Login', password: 'secreto123' });
    await page.getByTestId('user-save').click();
    await expect(page.getByTestId('msg')).toHaveText('Usuario creado');
    await page.getByTestId('logout').click();
    await page.getByTestId('login-username').fill(username);
    await page.getByTestId('login-password').fill('secreto123');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('whoami')).toContainText('Login');
    await page.getByTestId('logout').click();
    await page.getByTestId('login-username').fill('admin');
    await page.getByTestId('login-password').fill('Admin123!');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('whoami')).toContainText('Administrador');
    await userRow(page, username).getByText('Eliminar').click();
    await expect(page.getByTestId('msg')).toHaveText('Usuario eliminado');
  });
});

// ------------------------------------------------------------------
// 4. USUARIOS - validaciones del formulario
// ------------------------------------------------------------------
test.describe('UI 4. Usuarios: validaciones', () => {
  const U = 'Username inválido (mínimo 3 caracteres)';
  const P = 'Contraseña inválida (mínimo 6 caracteres)';
  const N = 'Nombre inválido';
  const E = 'Email inválido';
  const casos = [
    ['username vacío', { username: '', nombre: 'N', password: 'secreto123' }, U],
    ['username de 1 letra', { username: 'a', nombre: 'N', password: 'secreto123' }, U],
    ['username de 2 letras', { username: 'ab', nombre: 'N', password: 'secreto123' }, U],
    ['username de espacios', { username: '   ', nombre: 'N', password: 'secreto123' }, U],
    ['contraseña vacía', { username: 'valido1', nombre: 'N', password: '' }, P],
    ['contraseña de 1', { username: 'valido1', nombre: 'N', password: '1' }, P],
    ['contraseña de 5', { username: 'valido1', nombre: 'N', password: '12345' }, P],
    ['nombre vacío', { username: 'valido1', nombre: '', password: 'secreto123' }, N],
    ['nombre de espacios', { username: 'valido1', nombre: '   ', password: 'secreto123' }, N],
    ['email sin arroba', { username: 'valido1', nombre: 'N', password: 'secreto123', email: 'abc' }, E],
    ['email sin dominio', { username: 'valido1', nombre: 'N', password: 'secreto123', email: 'a@' }, E],
    ['email sin usuario', { username: 'valido1', nombre: 'N', password: 'secreto123', email: '@b.com' }, E],
    ['email sin punto', { username: 'valido1', nombre: 'N', password: 'secreto123', email: 'a@b' }, E],
    ['email con espacio', { username: 'valido1', nombre: 'N', password: 'secreto123', email: 'a b@c.com' }, E],
    ['email con doble arroba', { username: 'valido1', nombre: 'N', password: 'secreto123', email: 'a@@b.com' }, E],
    ['username duplicado', { username: 'admin', nombre: 'N', password: 'secreto123' }, 'El username ya existe'],
  ];
  for (const [etiqueta, datos, mensaje] of casos) {
    test(`rechaza ${etiqueta}`, async ({ page }) => {
      await openPanel(page);
      await fillUser(page, datos);
      await page.getByTestId('user-save').click();
      await expect(page.getByTestId('msg')).toHaveText(mensaje);
    });
  }
  test('Cancelar limpia el formulario', async ({ page }) => {
    await openPanel(page);
    await fillUser(page, { username: 'temporal', nombre: 'Temporal', password: 'x' });
    await page.locator('#user-cancel').click();
    await expect(page.getByTestId('user-username')).toHaveValue('');
    await expect(page.getByTestId('user-nombre')).toHaveValue('');
  });
});

// ------------------------------------------------------------------
// 5. USUARIOS - edición
// ------------------------------------------------------------------
test.describe('UI 5. Usuarios: edición', () => {
  const nombres = ['Nuevo Nombre', 'Ñandú Pérez', 'A', 'María José', 'Con 123 números', "O'Connor", 'Ana & Luis', 'N'.repeat(60), 'Dr. Strange', 'Ángel'];
  for (const nuevo of nombres) {
    test(`editar nombre a "${nuevo.slice(0, 20)}"`, async ({ page }) => {
      const username = `ui_edit${uniq()}`;
      const login = await page.request.post('/api/auth/login', { data: ADMIN });
      const token = (await login.json()).token;
      const created = await page.request.post('/api/users', { headers: { Authorization: `Bearer ${token}` }, data: { username, password: 'secreto123', nombre: 'Original' } });
      const { id } = await created.json();
      await openPanel(page);
      const row = userRow(page, username);
      await row.getByText('Editar').click();
      await expect(page.getByTestId('user-username')).toBeDisabled();
      await page.getByTestId('user-nombre').fill(nuevo);
      await page.getByTestId('user-save').click();
      await expect(page.getByTestId('msg')).toHaveText('Usuario actualizado');
      await expect(row).toContainText(nuevo);
      await page.request.delete(`/api/users/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    });
  }
  for (const rol of ['admin', 'usuario']) {
    test(`cambiar el rol a ${rol}`, async ({ page }) => {
      const username = `ui_rol${uniq()}`;
      const login = await page.request.post('/api/auth/login', { data: ADMIN });
      const token = (await login.json()).token;
      const { id } = await (await page.request.post('/api/users', { headers: { Authorization: `Bearer ${token}` }, data: { username, password: 'secreto123', nombre: 'Rol', rol: rol === 'admin' ? 'usuario' : 'admin' } })).json();
      await openPanel(page);
      const row = userRow(page, username);
      await row.getByText('Editar').click();
      await page.getByTestId('user-rol').selectOption(rol);
      await page.getByTestId('user-save').click();
      await expect(page.getByTestId('msg')).toHaveText('Usuario actualizado');
      await expect(row).toContainText(rol);
      await page.request.delete(`/api/users/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    });
  }
  for (const [mal, msg] of [['', 'Nombre inválido'], ['   ', 'Nombre inválido']]) {
    test(`edición rechaza nombre ${JSON.stringify(mal)}`, async ({ page }) => {
      const username = `ui_editbad${uniq()}`;
      const login = await page.request.post('/api/auth/login', { data: ADMIN });
      const token = (await login.json()).token;
      const { id } = await (await page.request.post('/api/users', { headers: { Authorization: `Bearer ${token}` }, data: { username, password: 'secreto123', nombre: 'Original' } })).json();
      await openPanel(page);
      await userRow(page, username).getByText('Editar').click();
      await page.getByTestId('user-nombre').fill(mal);
      await page.getByTestId('user-save').click();
      await expect(page.getByTestId('msg')).toHaveText(msg);
      await page.request.delete(`/api/users/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    });
  }
});

// ------------------------------------------------------------------
// 6. PRODUCTOS
// ------------------------------------------------------------------
test.describe('UI 6. Productos', () => {
  const validos = [
    ['Café', '25', '25.00'], ['Té verde', '18.5', '18.50'], ['Jugo', '0.01', '0.01'], ['Agua', '10', '10.00'], ['Refresco', '15.99', '15.99'],
    ['Galletas', '99.9', '99.90'], ['Papas', '12', '12.00'], ['Cacahuates', '7.25', '7.25'], ['Chocolate', '45', '45.00'], ['Nueces', '150.5', '150.50'],
    ['Ñoño', '5', '5.00'], ['Producto con espacios', '33', '33.00'], ['Prod123', '1', '1.00'], ['Gran precio', '99999.99', '99999.99'], ['Sin decimales', '1000', '1000.00'],
  ];
  for (const [base, precio, esperado] of validos) {
    test(`alta, edición y baja de "${base}" a $${precio}`, async ({ page }) => {
      await openPanel(page);
      await page.getByTestId('tab-products').click();
      const nombre = `${base} ${uniq()}`;
      await page.getByTestId('product-nombre').fill(nombre);
      await page.getByTestId('product-precio').fill(precio);
      await page.getByTestId('product-save').click();
      await expect(page.getByTestId('msg')).toHaveText('Producto creado');
      const row = productRow(page, nombre);
      await expect(row).toContainText(esperado);
      await row.getByText('Editar').click();
      await page.getByTestId('product-precio').fill('77');
      await page.getByTestId('product-save').click();
      await expect(page.getByTestId('msg')).toHaveText('Producto actualizado');
      await expect(row).toContainText('77.00');
      await row.getByText('Eliminar').click();
      await expect(page.getByTestId('msg')).toHaveText('Producto eliminado');
      await expect(row).toHaveCount(0);
    });
  }
  const invalidos = [
    ['nombre vacío', '', '10', 'Nombre inválido'], ['nombre de espacios', '   ', '10', 'Nombre inválido'],
    ['precio vacío', 'Prod', '', 'Precio inválido'], ['precio cero', 'Prod', '0', 'Precio inválido'], ['precio negativo', 'Prod', '-5', 'Precio inválido'],
    ['precio negativo decimal', 'Prod', '-0.5', 'Precio inválido'],
  ];
  for (const [etiqueta, nombre, precio, msg] of invalidos) {
    test(`rechaza ${etiqueta}`, async ({ page }) => {
      await openPanel(page);
      await page.getByTestId('tab-products').click();
      await page.getByTestId('product-nombre').fill(nombre);
      await page.getByTestId('product-precio').fill(precio);
      await page.getByTestId('product-save').click();
      await expect(page.getByTestId('msg')).toHaveText(msg);
    });
  }
  for (const cat of ['Bebidas', 'Botanas']) {
    test(`crear producto en la categoría ${cat}`, async ({ page }) => {
      await openPanel(page);
      await page.getByTestId('tab-products').click();
      const nombre = `Cat ${cat} ${uniq()}`;
      await page.getByTestId('product-nombre').fill(nombre);
      await page.getByTestId('product-precio').fill('9');
      await page.getByTestId('product-categoria').selectOption({ label: cat });
      await page.getByTestId('product-save').click();
      await expect(page.getByTestId('msg')).toHaveText('Producto creado');
      const row = productRow(page, nombre);
      await expect(row).toContainText(cat);
      await row.getByText('Eliminar').click();
      await expect(row).toHaveCount(0);
    });
  }
  test('Cancelar limpia el formulario de producto', async ({ page }) => {
    await openPanel(page);
    await page.getByTestId('tab-products').click();
    await page.getByTestId('product-nombre').fill('Temporal');
    await page.getByTestId('product-precio').fill('5');
    await page.locator('#product-cancel').click();
    await expect(page.getByTestId('product-nombre')).toHaveValue('');
    await expect(page.getByTestId('product-precio')).toHaveValue('');
  });
});
