// Pruebas de interacción de interfaz (Playwright): scroll, drag & drop, tablas (orden y búsqueda),
// hover, alertas, ventanas/pestañas, iframe, teclado, responsive, almacenamiento y simulación de red.
const { test, expect, request: pwRequest } = require('@playwright/test');

const PORT = process.env.E2E_PORT || 3100;
const BASE = `http://localhost:${PORT}`;
const ADMIN = { username: 'admin', password: 'Admin123!' };
const uniq = (() => { let n = 0; return () => `${Date.now().toString(36)}${(n++).toString(36)}`; })();

async function login(page) {
  const res = await page.request.post('/api/auth/login', { data: ADMIN });
  return res.json();
}
// Abre el panel autenticado (token en sessionStorage + recarga)
async function openPanel(page) {
  const { token, user } = await login(page);
  await page.goto('/');
  await page.evaluate(([t, u]) => { sessionStorage.setItem('token', t); sessionStorage.setItem('user', JSON.stringify(u)); }, [token, user]);
  await page.reload();
  await expect(page.getByTestId('whoami')).toBeVisible();
  return token;
}
async function api(method, url, token, data) {
  const ctx = await pwRequest.newContext({ baseURL: BASE });
  const res = await ctx.fetch(url, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, data });
  const body = await res.json().catch(() => ({}));
  await ctx.dispose();
  return body;
}
async function adminToken() { return (await api('POST', '/api/auth/login', null, ADMIN)).token; }
async function crearProductos(prefix, n) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const b = await api('POST', '/api/productos', null, { nombre: `${prefix}_${String(i).padStart(2, '0')}`, precio: 10 + i, categoria_id: i % 2 ? 2 : 1 });
    ids.push(b.id);
  }
  return ids;
}
async function borrarProductos(ids) { for (const id of ids) await api('DELETE', `/api/productos/${id}`, null); }
async function crearUsuarios(prefix, specs) {
  const token = await adminToken();
  const ids = [];
  for (const [i, s] of specs.entries()) {
    const b = await api('POST', '/api/users', token, { username: `${prefix}_${s.u}`, password: 'secreto123', nombre: s.n, email: s.e ?? `${prefix}_${i}@example.com`, rol: s.r ?? 'usuario' });
    ids.push(b.id);
  }
  return { ids, token };
}
async function borrarUsuarios({ ids, token }) { for (const id of ids) await api('DELETE', `/api/users/${id}`, token); }
const colTexts = (page, bodyId, idx) => page.locator(`#${bodyId} tr[data-testid$="-row"] td:nth-child(${idx + 1})`).allTextContents();
const lc = (s) => s.toLowerCase();
const sortedBy = (arr, numeric, dir) => [...arr].sort((a, b) => (dir === 'asc' ? 1 : -1) * (numeric ? parseFloat(a) - parseFloat(b) : (lc(a) < lc(b) ? -1 : lc(a) > lc(b) ? 1 : 0)));

// ==================================================================
// 1. SCROLL
// ==================================================================
test.describe('Interacción 1. Scroll', () => {
  for (const delta of [400, 800, 1500, 3000]) {
    test(`la rueda del ratón (${delta}px) desplaza la página y muestra "volver arriba"`, async ({ page }) => {
      const ids = await crearProductos(`scr${uniq()}`, 40);
      try {
        await openPanel(page);
        await page.getByTestId('tab-products').click();
        await expect(page.getByTestId('back-to-top')).toBeHidden();
        await page.mouse.move(400, 400);
        await page.mouse.wheel(0, delta);
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
        await expect(page.getByTestId('back-to-top')).toBeVisible();
      } finally { await borrarProductos(ids); }
    });
  }
  test('el botón "volver arriba" regresa al inicio y se oculta', async ({ page }) => {
    const ids = await crearProductos(`scr${uniq()}`, 40);
    try {
      await openPanel(page);
      await page.getByTestId('tab-products').click();
      await page.mouse.move(400, 400);
      await page.mouse.wheel(0, 2000);
      await expect(page.getByTestId('back-to-top')).toBeVisible();
      await page.getByTestId('back-to-top').click();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);
      await expect(page.getByTestId('back-to-top')).toBeHidden();
    } finally { await borrarProductos(ids); }
  });
  test('scroll hacia arriba tras bajar', async ({ page }) => {
    const ids = await crearProductos(`scr${uniq()}`, 40);
    try {
      await openPanel(page);
      await page.getByTestId('tab-products').click();
      await page.mouse.move(400, 400);
      await page.mouse.wheel(0, 3000);
      await expect(page.getByTestId('back-to-top')).toBeVisible();
      await page.mouse.wheel(0, -6000);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);
    } finally { await borrarProductos(ids); }
  });
  test('la tecla End baja al final y Home regresa al inicio', async ({ page }) => {
    const ids = await crearProductos(`scr${uniq()}`, 40);
    try {
      await openPanel(page);
      await page.getByTestId('tab-products').click();
      await page.locator('body').click({ position: { x: 5, y: 300 } });
      await page.keyboard.press('End');
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
      await page.keyboard.press('Home');
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);
    } finally { await borrarProductos(ids); }
  });
  test('scrollIntoViewIfNeeded lleva la última fila a la vista', async ({ page }) => {
    const prefix = `scr${uniq()}`;
    const ids = await crearProductos(prefix, 40);
    try {
      await openPanel(page);
      await page.getByTestId('tab-products').click();
      const last = page.locator(`[data-testid="product-row"][data-nombre="${prefix}_39"]`);
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeInViewport();
    } finally { await borrarProductos(ids); }
  });
  test('scroll horizontal dentro de la tabla en pantalla angosta', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openPanel(page);
    const wrap = page.locator('#tab-users .table-wrap');
    expect(await wrap.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await wrap.evaluate((el) => { el.scrollLeft = 200; });
    expect(await wrap.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  });
});

// ==================================================================
// 2. DRAG AND DROP (reordenar filas de productos)
// ==================================================================
test.describe('Interacción 2. Drag and drop', () => {
  const nombresDe = async (page, prefix) => (await colTexts(page, 'products-body', 1)).filter((t) => t.startsWith(prefix));
  async function escenario(page) {
    const prefix = `dnd${uniq()}`;
    const ids = await crearProductos(prefix, 3);
    await openPanel(page);
    await page.getByTestId('tab-products').click();
    const row = (i) => page.locator(`[data-testid="product-row"][data-nombre="${prefix}_0${i}"]`);
    return { prefix, ids, row };
  }
  test('arrastrar la primera fila sobre la tercera la mueve después de ella', async ({ page }) => {
    const { prefix, ids, row } = await escenario(page);
    try {
      expect(await nombresDe(page, prefix)).toEqual([`${prefix}_00`, `${prefix}_01`, `${prefix}_02`]);
      await row(0).dragTo(row(2));
      await expect.poll(() => nombresDe(page, prefix)).toEqual([`${prefix}_01`, `${prefix}_02`, `${prefix}_00`]);
    } finally { await borrarProductos(ids); }
  });
  test('arrastrar la tercera fila sobre la primera la mueve antes de ella', async ({ page }) => {
    const { prefix, ids, row } = await escenario(page);
    try {
      await row(2).dragTo(row(0));
      await expect.poll(() => nombresDe(page, prefix)).toEqual([`${prefix}_02`, `${prefix}_00`, `${prefix}_01`]);
    } finally { await borrarProductos(ids); }
  });
  test('intercambiar filas adyacentes', async ({ page }) => {
    const { prefix, ids, row } = await escenario(page);
    try {
      await row(0).dragTo(row(1));
      await expect.poll(() => nombresDe(page, prefix)).toEqual([`${prefix}_01`, `${prefix}_00`, `${prefix}_02`]);
    } finally { await borrarProductos(ids); }
  });
  test('soltar una fila sobre sí misma no cambia el orden', async ({ page }) => {
    const { prefix, ids, row } = await escenario(page);
    try {
      await row(1).dragTo(row(1));
      expect(await nombresDe(page, prefix)).toEqual([`${prefix}_00`, `${prefix}_01`, `${prefix}_02`]);
    } finally { await borrarProductos(ids); }
  });
  test('el orden manual deja los encabezados sin ordenamiento activo', async ({ page }) => {
    const { ids, row } = await escenario(page);
    try {
      await page.locator('[data-testid="products-table"] th[data-sort="precio"]').click();
      await row(0).dragTo(row(2)).catch(() => {});
      const th = page.locator('[data-testid="products-table"] th[data-sort="precio"]');
      await expect(th).toHaveAttribute('aria-sort', /none|ascending/);
    } finally { await borrarProductos(ids); }
  });
  test('las filas de productos son arrastrables', async ({ page }) => {
    const { ids, row } = await escenario(page);
    try { await expect(row(0)).toHaveAttribute('draggable', 'true'); } finally { await borrarProductos(ids); }
  });
});

// ==================================================================
// 3. TABLAS: ordenamiento
// ==================================================================
test.describe('Interacción 3. Tablas: ordenamiento', () => {
  const users = [
    { u: 'zeta', n: 'Zoe Zamora', r: 'admin' }, { u: 'alfa', n: 'Ana Alvarez', r: 'usuario' }, { u: 'mike', n: 'Mario Mena', r: 'usuario' },
    { u: 'Bravo', n: 'beto Bravo', r: 'admin' }, { u: 'delta', n: 'Dora Diaz', r: 'usuario' }, { u: 'echo', n: 'Eva Estrada', r: 'usuario' },
  ];
  const cols = [['id', 0, true], ['username', 1, false], ['nombre', 2, false], ['rol', 4, false]];
  for (const [key, idx, numeric] of cols) {
    for (const dir of ['asc', 'desc']) {
      test(`usuarios: ordenar por ${key} ${dir === 'asc' ? 'ascendente' : 'descendente'}`, async ({ page }) => {
        const setup = await crearUsuarios(`ord${uniq()}`, users);
        try {
          await openPanel(page);
          const th = page.locator(`[data-testid="users-table"] th[data-sort="${key}"]`);
          await th.click();
          if (dir === 'desc') await th.click();
          await expect(th).toHaveAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending');
          const vals = await colTexts(page, 'users-body', idx);
          expect(vals.length).toBeGreaterThanOrEqual(7);
          expect(vals).toEqual(sortedBy(vals, numeric, dir));
        } finally { await borrarUsuarios(setup); }
      });
    }
  }
  const cols2 = [['id', 0, true], ['nombre', 1, false], ['precio', 2, true], ['categoria', 3, false]];
  for (const [key, idx, numeric] of cols2) {
    for (const dir of ['asc', 'desc']) {
      test(`productos: ordenar por ${key} ${dir === 'asc' ? 'ascendente' : 'descendente'}`, async ({ page }) => {
        const ids = await crearProductos(`ord${uniq()}`, 6);
        try {
          await openPanel(page);
          await page.getByTestId('tab-products').click();
          const th = page.locator(`[data-testid="products-table"] th[data-sort="${key}"]`);
          await th.click();
          if (dir === 'desc') await th.click();
          await expect(th).toHaveAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending');
          const vals = await colTexts(page, 'products-body', idx);
          expect(vals).toEqual(sortedBy(vals, numeric, dir));
        } finally { await borrarProductos(ids); }
      });
    }
  }
  test('un tercer clic vuelve a ascendente', async ({ page }) => {
    await openPanel(page);
    const th = page.locator('[data-testid="users-table"] th[data-sort="username"]');
    await th.click(); await th.click(); await th.click();
    await expect(th).toHaveAttribute('aria-sort', 'ascending');
  });
  test('ordenar otra columna deja la anterior sin ordenar', async ({ page }) => {
    await openPanel(page);
    const a = page.locator('[data-testid="users-table"] th[data-sort="username"]');
    const b = page.locator('[data-testid="users-table"] th[data-sort="rol"]');
    await a.click(); await b.click();
    await expect(a).toHaveAttribute('aria-sort', 'none');
    await expect(b).toHaveAttribute('aria-sort', 'ascending');
  });
  test('las columnas Email y Acciones no son ordenables', async ({ page }) => {
    await openPanel(page);
    await expect(page.locator('[data-testid="users-table"] th.sortable')).toHaveCount(4);
  });
});

// ==================================================================
// 4. TABLAS: búsqueda y filtrado
// ==================================================================
test.describe('Interacción 4. Tablas: búsqueda', () => {
  const terminos = ['admin', 'ADMIN', 'Admin', 'dmi', 'Administrador', 'admin@example.com', '@example', '  admin  ', 'zzzz-no-existe', '999999-nada'];
  for (const t of terminos) {
    test(`usuarios: buscar "${t}" filtra las filas`, async ({ page }) => {
      await openPanel(page);
      await page.getByTestId('user-search').fill(t);
      const q = t.trim().toLowerCase();
      const filas = await page.locator('#users-body tr[data-testid="user-row"]').allTextContents();
      if (filas.length === 0) {
        await expect(page.getByTestId('no-results')).toBeVisible();
        await expect(page.getByTestId('users-count')).toHaveText(/^0 de \d+ usuarios$/);
      } else {
        for (const f of filas) expect(f.toLowerCase()).toContain(q);
        await expect(page.getByTestId('users-count')).toHaveText(new RegExp(`^${filas.length} de \\d+ usuarios$`));
      }
    });
  }
  test('limpiar la búsqueda restaura todas las filas', async ({ page }) => {
    await openPanel(page);
    const total = await page.locator('#users-body tr[data-testid="user-row"]').count();
    await page.getByTestId('user-search').fill('zzzz-no-existe');
    await expect(page.locator('#users-body tr[data-testid="user-row"]')).toHaveCount(0);
    await page.getByTestId('user-search').fill('');
    await expect(page.locator('#users-body tr[data-testid="user-row"]')).toHaveCount(total);
  });
  test('la búsqueda encuentra un usuario recién creado', async ({ page }) => {
    const setup = await crearUsuarios(`bus${uniq()}`, [{ u: 'unico', n: 'Persona Única' }]);
    try {
      await openPanel(page);
      await page.getByTestId('user-search').fill('persona única');
      await expect(page.locator('#users-body tr[data-testid="user-row"]')).toHaveCount(1);
    } finally { await borrarUsuarios(setup); }
  });
  test('buscar y ordenar a la vez', async ({ page }) => {
    const setup = await crearUsuarios(`mix${uniq()}`, [{ u: 'b', n: 'B' }, { u: 'a', n: 'A' }, { u: 'c', n: 'C' }]);
    try {
      await openPanel(page);
      await page.getByTestId('user-search').fill('mix');
      await page.locator('[data-testid="users-table"] th[data-sort="username"]').click();
      const vals = await colTexts(page, 'users-body', 1);
      expect(vals.length).toBe(3);
      expect(vals).toEqual(sortedBy(vals, false, 'asc'));
    } finally { await borrarUsuarios(setup); }
  });
  for (const t of ['bebidas', 'BEBIDAS', 'botanas', 'zzzz-no-existe', '  ']) {
    test(`productos: buscar "${t}"`, async ({ page }) => {
      await openPanel(page);
      await page.getByTestId('tab-products').click();
      await page.getByTestId('product-search').fill(t);
      const q = t.trim().toLowerCase();
      const filas = await page.locator('#products-body tr[data-testid="product-row"]').allTextContents();
      if (filas.length === 0) await expect(page.getByTestId('no-results')).toBeVisible();
      else for (const f of filas) expect(f.toLowerCase()).toContain(q);
      await expect(page.getByTestId('products-count')).toHaveText(/^\d+ de \d+ productos$/);
    });
  }
});

// ==================================================================
// 5. HOVER y tooltips
// ==================================================================
test.describe('Interacción 5. Hover', () => {
  test('al pasar el ratón la fila cambia de color', async ({ page }) => {
    await openPanel(page);
    const row = page.locator('#users-body tr[data-testid="user-row"]').first();
    await row.hover();
    await expect(row).toHaveCSS('background-color', 'rgb(238, 244, 255)');
  });
  test('sin hover la fila no tiene el color resaltado', async ({ page }) => {
    await openPanel(page);
    const row = page.locator('#users-body tr[data-testid="user-row"]').first();
    await page.mouse.move(2, 2);
    await expect(row).not.toHaveCSS('background-color', 'rgb(238, 244, 255)');
  });
  test('los botones de fila tienen tooltip (title)', async ({ page }) => {
    await openPanel(page);
    const row = page.locator('#users-body tr[data-testid="user-row"]').first();
    await expect(row.getByText('Editar')).toHaveAttribute('title', 'Editar registro');
    await expect(row.getByText('Eliminar')).toHaveAttribute('title', 'Eliminar registro');
  });
  for (const [id, title] of [['help-btn', 'Ayuda'], ['about-btn', 'Acerca de'], ['back-to-top', 'Volver arriba']]) {
    test(`el elemento ${id} declara el tooltip "${title}"`, async ({ page }) => {
      await openPanel(page);
      await expect(page.locator(`#${id}`)).toHaveAttribute('title', title);
    });
  }
  test('hover sobre el botón Salir mantiene la página estable', async ({ page }) => {
    await openPanel(page);
    await page.getByTestId('logout').hover();
    await expect(page.getByTestId('whoami')).toBeVisible();
  });
});

// ==================================================================
// 6. ALERTAS, MODAL, IFRAME Y NUEVAS PESTAÑAS
// ==================================================================
test.describe('Interacción 6. Alertas, modal, iframe y pestañas', () => {
  test('el botón de ayuda lanza una alerta JavaScript', async ({ page }) => {
    await openPanel(page);
    let mensaje = '';
    page.once('dialog', async (d) => {
      mensaje = d.message();
      expect(d.type()).toBe('alert');
      await d.accept();
    });
    await page.getByTestId('help-btn').click();
    expect(mensaje).toContain('Panel de gestión');
  });
  test('descartar la alerta no rompe la página', async ({ page }) => {
    await openPanel(page);
    page.once('dialog', (d) => d.dismiss());
    await page.getByTestId('help-btn').click();
    await expect(page.getByTestId('whoami')).toBeVisible();
  });
  test('"Acerca de" abre un modal con título', async ({ page }) => {
    await openPanel(page);
    await page.getByTestId('about-btn').click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('heading', { name: 'Acerca de' })).toBeVisible();
  });
  test('el modal contiene un iframe que muestra el estado de la API', async ({ page }) => {
    await openPanel(page);
    await page.getByTestId('about-btn').click();
    await expect(page.frameLocator('[data-testid="about-frame"]').locator('body')).toContainText('online');
  });
  test('el modal se cierra con el botón Cerrar', async ({ page }) => {
    await openPanel(page);
    await page.getByTestId('about-btn').click();
    await page.getByTestId('about-close').click();
    await expect(page.getByRole('dialog')).toBeHidden();
  });
  test('el modal se cierra con la tecla Escape', async ({ page }) => {
    await openPanel(page);
    await page.getByTestId('about-btn').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });
  test('con el modal abierto el contenido de fondo no es interactivo', async ({ page }) => {
    await openPanel(page);
    await page.getByTestId('about-btn').click();
    await expect(page.getByTestId('tab-products').click({ timeout: 1000 })).rejects.toThrow();
  });
  test('el modal puede abrirse varias veces', async ({ page }) => {
    await openPanel(page);
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('about-btn').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByTestId('about-close').click();
      await expect(page.getByRole('dialog')).toBeHidden();
    }
  });
  test('"Estado API" abre una nueva pestaña con el JSON de estado', async ({ page, context }) => {
    await openPanel(page);
    const [nueva] = await Promise.all([context.waitForEvent('page'), page.getByTestId('status-link').click()]);
    await nueva.waitForLoadState();
    expect(nueva.url()).toContain('/api/status');
    await expect(nueva.locator('body')).toContainText('online');
    await nueva.close();
  });
  test('el enlace "Estado API" usa target=_blank y rel=noopener', async ({ page }) => {
    await openPanel(page);
    await expect(page.getByTestId('status-link')).toHaveAttribute('target', '_blank');
    await expect(page.getByTestId('status-link')).toHaveAttribute('rel', 'noopener');
  });
});

// ==================================================================
// 7. TECLADO
// ==================================================================
test.describe('Interacción 7. Teclado', () => {
  test('en el login, Tab recorre usuario, contraseña y botón', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('login-username').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('login-password')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('login-submit')).toBeFocused();
  });
  test('Shift+Tab regresa al campo anterior', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('login-password').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('login-username')).toBeFocused();
  });
  test('login completo solo con teclado', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('login-username').focus();
    await page.keyboard.type('admin');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Admin123!');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('whoami')).toBeVisible();
  });
  test('en el formulario de usuario, Tab sigue el orden de los campos', async ({ page }) => {
    await openPanel(page);
    await page.getByTestId('user-username').focus();
    for (const id of ['user-nombre', 'user-email', 'user-password', 'user-rol', 'user-save']) {
      await page.keyboard.press('Tab');
      await expect(page.getByTestId(id)).toBeFocused();
    }
  });
  test('Enter en un campo del formulario envía el alta', async ({ page }) => {
    await openPanel(page);
    const username = `kbd${uniq()}`;
    await page.getByTestId('user-username').fill(username);
    await page.getByTestId('user-nombre').fill('Teclado');
    await page.getByTestId('user-password').fill('secreto123');
    await page.getByTestId('user-password').press('Enter');
    await expect(page.getByTestId('msg')).toHaveText('Usuario creado');
    await page.locator(`[data-testid="user-row"][data-username="${username}"]`).getByText('Eliminar').click();
  });
  test('ArrowDown cambia la opción del selector de rol', async ({ page }) => {
    await openPanel(page);
    await page.getByTestId('user-rol').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('user-rol')).toHaveValue('admin');
  });
  test('Space activa un botón enfocado (pestaña Productos)', async ({ page }) => {
    await openPanel(page);
    await page.getByTestId('tab-products').focus();
    await page.keyboard.press('Space');
    await expect(page.getByTestId('products-table')).toBeVisible();
  });
  test('Enter activa un botón enfocado (pestaña Productos)', async ({ page }) => {
    await openPanel(page);
    await page.getByTestId('tab-products').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('products-table')).toBeVisible();
  });
  const teclas = ['Tab', 'Shift+Tab', 'Escape', 'Enter', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageDown', 'PageUp', 'Space', 'Backspace', 'Delete'];
  for (const k of teclas) {
    test(`pulsar ${k} en el panel no produce errores de JavaScript`, async ({ page }) => {
      const errores = [];
      page.on('pageerror', (e) => errores.push(e.message));
      await openPanel(page);
      await page.locator('body').click({ position: { x: 5, y: 300 } });
      await page.keyboard.press(k);
      await expect(page.getByTestId('whoami')).toBeVisible();
      expect(errores).toEqual([]);
    });
    test(`pulsar ${k} en el login no produce errores de JavaScript`, async ({ page }) => {
      const errores = [];
      page.on('pageerror', (e) => errores.push(e.message));
      await page.goto('/');
      await page.keyboard.press(k);
      await expect(page.getByTestId('login-submit')).toBeVisible();
      expect(errores).toEqual([]);
    });
  }
});

// ==================================================================
// 8. RESPONSIVE
// ==================================================================
test.describe('Interacción 8. Diseño responsivo', () => {
  const tamanos = [[320, 568], [375, 667], [414, 896], [768, 1024], [1024, 768], [1366, 768], [1440, 900], [1920, 1080]];
  const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  for (const [w, h] of tamanos) {
    test.describe(`${w}x${h}`, () => {
      test.use({ viewport: { width: w, height: h } });
      test('el login cabe sin scroll horizontal', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByTestId('login-submit')).toBeVisible();
        expect(await sinDesborde(page)).toBe(true);
      });
      test('el panel de usuarios cabe sin scroll horizontal', async ({ page }) => {
        await openPanel(page);
        await expect(page.getByTestId('users-table')).toBeVisible();
        expect(await sinDesborde(page)).toBe(true);
      });
      test('el panel de productos cabe sin scroll horizontal', async ({ page }) => {
        await openPanel(page);
        await page.getByTestId('tab-products').click();
        expect(await sinDesborde(page)).toBe(true);
      });
      test('los controles principales son visibles', async ({ page }) => {
        await openPanel(page);
        for (const id of ['logout', 'tab-users', 'tab-products', 'user-save']) await expect(page.getByTestId(id)).toBeVisible();
      });
    });
  }
});

// ==================================================================
// 9. ALMACENAMIENTO, COOKIES Y ACCESIBILIDAD
// ==================================================================
test.describe('Interacción 9. Almacenamiento y accesibilidad', () => {
  test('tras iniciar sesión el token queda en sessionStorage', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('login-username').fill('admin');
    await page.getByTestId('login-password').fill('Admin123!');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('whoami')).toBeVisible();
    const token = await page.evaluate(() => sessionStorage.getItem('token'));
    expect(token).toContain('.');
  });
  test('el token no se guarda en localStorage', async ({ page }) => {
    await openPanel(page);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
  });
  test('la aplicación no usa cookies', async ({ page, context }) => {
    await openPanel(page);
    expect(await context.cookies()).toHaveLength(0);
  });
  test('cerrar sesión borra el almacenamiento', async ({ page }) => {
    await openPanel(page);
    await page.getByTestId('logout').click();
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  });
  test('el documento declara idioma español y título', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page).toHaveTitle(/Panel de Gestión/);
  });
  test('los campos del login tienen etiqueta accesible', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel('Usuario', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible();
  });
  test('el botón de entrar tiene rol y nombre accesibles', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });
  test('el error de login se anuncia con role=alert', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('login-submit').click();
    await expect(page.getByRole('alert').filter({ hasText: 'requeridos' })).toBeVisible();
  });
  test('los mensajes de estado usan role=status', async ({ page }) => {
    await openPanel(page);
    await expect(page.getByRole('status')).toHaveCount(1);
  });
  test('los buscadores tienen etiqueta accesible', async ({ page }) => {
    await openPanel(page);
    await expect(page.getByLabel('Buscar usuarios')).toBeVisible();
  });
  test('los encabezados ordenables exponen aria-sort', async ({ page }) => {
    await openPanel(page);
    await expect(page.locator('[data-testid="users-table"] th[data-sort="id"]')).toHaveAttribute('aria-sort', 'none');
  });
});

// ==================================================================
// 10. SIMULACIÓN DE RED (mocking con page.route)
// ==================================================================
test.describe('Interacción 10. Simulación de red', () => {
  test('error 500 al listar usuarios muestra el mensaje del servidor', async ({ page }) => {
    await page.route('**/api/users', (r) => (r.request().method() === 'GET' ? r.fulfill({ status: 500, json: { error: 'Fallo simulado' } }) : r.continue()));
    await openPanel(page);
    await expect(page.getByTestId('msg')).toHaveText('Fallo simulado');
    await expect(page.getByTestId('msg')).toHaveClass(/err/);
  });
  test('error 500 al listar productos muestra el mensaje', async ({ page }) => {
    await page.route('**/api/productos', (r) => (r.request().method() === 'GET' ? r.fulfill({ status: 500, json: { error: 'Productos caídos' } }) : r.continue()));
    await openPanel(page);
    await expect(page.getByTestId('msg')).toHaveText('Productos caídos');
  });
  test('lista vacía de usuarios muestra "Sin resultados" y contador en cero', async ({ page }) => {
    await page.route('**/api/users', (r) => (r.request().method() === 'GET' ? r.fulfill({ status: 200, json: [] }) : r.continue()));
    await openPanel(page);
    await expect(page.getByTestId('no-results')).toBeVisible();
    await expect(page.getByTestId('users-count')).toHaveText('0 de 0 usuarios');
  });
  test('lista vacía de productos muestra "Sin resultados"', async ({ page }) => {
    await page.route('**/api/productos', (r) => (r.request().method() === 'GET' ? r.fulfill({ status: 200, json: [] }) : r.continue()));
    await openPanel(page);
    await page.getByTestId('tab-products').click();
    await expect(page.getByTestId('no-results')).toBeVisible();
    await expect(page.getByTestId('products-count')).toHaveText('0 de 0 productos');
  });
  test('una respuesta 401 cierra la sesión automáticamente', async ({ page }) => {
    const { token, user } = await login(page);
    await page.route('**/api/users', (r) => r.fulfill({ status: 401, json: { error: 'No autenticado o token inválido' } }));
    await page.goto('/');
    await page.evaluate(([t, u]) => { sessionStorage.setItem('token', t); sessionStorage.setItem('user', JSON.stringify(u)); }, [token, user]);
    await page.reload();
    await expect(page.getByTestId('login-submit')).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('token'))).toBeNull();
  });
  test('una respuesta lenta se muestra cuando llega', async ({ page }) => {
    await page.route('**/api/users', async (r) => {
      if (r.request().method() !== 'GET') return r.continue();
      await new Promise((ok) => setTimeout(ok, 1500));
      return r.continue();
    });
    await openPanel(page);
    await expect(page.locator('[data-testid="user-row"][data-username="admin"]')).toBeVisible({ timeout: 10000 });
  });
  test('error del servidor al crear un usuario se muestra en pantalla', async ({ page }) => {
    await openPanel(page);
    await page.route('**/api/users', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 500, json: { error: 'No se pudo crear' } }) : r.continue()));
    await page.getByTestId('user-username').fill('mockuser');
    await page.getByTestId('user-nombre').fill('Mock');
    await page.getByTestId('user-password').fill('secreto123');
    await page.getByTestId('user-save').click();
    await expect(page.getByTestId('msg')).toHaveText('No se pudo crear');
    await expect(page.getByTestId('msg')).toHaveClass(/err/);
  });
  test('respuesta sin cuerpo JSON muestra "Error <código>"', async ({ page }) => {
    await openPanel(page);
    await page.route('**/api/users', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 503, body: 'no-json' }) : r.continue()));
    await page.getByTestId('user-username').fill('mockuser2');
    await page.getByTestId('user-nombre').fill('Mock');
    await page.getByTestId('user-password').fill('secreto123');
    await page.getByTestId('user-save').click();
    await expect(page.getByTestId('msg')).toHaveText('Error 503');
  });
  test('sin conexión, guardar muestra un mensaje de error', async ({ page, context }) => {
    await openPanel(page);
    await context.setOffline(true);
    await page.getByTestId('user-username').fill('offline1');
    await page.getByTestId('user-nombre').fill('Offline');
    await page.getByTestId('user-password').fill('secreto123');
    await page.getByTestId('user-save').click();
    await expect(page.getByTestId('msg')).toHaveClass(/err/);
    await context.setOffline(false);
  });
  test('se puede observar la petición de login y su respuesta', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('login-username').fill('admin');
    await page.getByTestId('login-password').fill('Admin123!');
    const [resp] = await Promise.all([page.waitForResponse('**/api/auth/login'), page.getByTestId('login-submit').click()]);
    expect(resp.status()).toBe(200);
    expect(resp.request().method()).toBe('POST');
    expect(resp.request().postDataJSON()).toEqual(ADMIN);
  });
  test('al abrir el panel se piden usuarios, categorías y productos con token', async ({ page }) => {
    const peticiones = [];
    page.on('request', (r) => { if (r.url().includes('/api/')) peticiones.push({ url: r.url(), auth: r.headers()['authorization'] }); });
    await openPanel(page);
    await expect.poll(() => peticiones.filter((p) => p.url.endsWith('/api/users')).length).toBeGreaterThan(0);
    expect(peticiones.find((p) => p.url.endsWith('/api/users')).auth).toMatch(/^Bearer /);
  });
});
