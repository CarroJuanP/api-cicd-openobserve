const { test, expect } = require('@playwright/test');

const login = async (page, user = 'admin', pass = 'Admin123!') => {
  await page.goto('/');
  await page.getByTestId('login-username').fill(user);
  await page.getByTestId('login-password').fill(pass);
  await page.getByTestId('login-submit').click();
};

test.describe('Frontend - Login', () => {
  test('F1. login correcto muestra el panel', async ({ page }) => {
    await login(page);
    await expect(page.getByTestId('whoami')).toContainText('Administrador');
    await expect(page.getByTestId('tab-users')).toBeVisible();
  });

  test('F2. login con contraseña incorrecta muestra error', async ({ page }) => {
    await login(page, 'admin', 'incorrecta');
    await expect(page.getByTestId('login-error')).toHaveText('Credenciales inválidas');
  });

  test('F3. login con campos vacíos muestra error de validación', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toContainText('requeridos');
  });

  test('F4. cerrar sesión regresa al login', async ({ page }) => {
    await login(page);
    await page.getByTestId('logout').click();
    await expect(page.getByTestId('login-submit')).toBeVisible();
  });
});

test.describe('Frontend - CRUD Usuarios', () => {
  const username = `qa_${Date.now()}`;

  test('F5. crear, editar y eliminar un usuario', async ({ page }) => {
    await login(page);
    // Crear
    await page.getByTestId('user-username').fill(username);
    await page.getByTestId('user-nombre').fill('Usuario QA');
    await page.getByTestId('user-email').fill('qa@example.com');
    await page.getByTestId('user-password').fill('secreto123');
    await page.getByTestId('user-save').click();
    await expect(page.getByTestId('msg')).toHaveText('Usuario creado');
    const row = page.locator(`[data-testid="user-row"][data-username="${username}"]`);
    await expect(row).toContainText('Usuario QA');
    // Editar
    await row.getByText('Editar').click();
    await page.getByTestId('user-nombre').fill('Usuario QA Editado');
    await page.getByTestId('user-save').click();
    await expect(page.getByTestId('msg')).toHaveText('Usuario actualizado');
    await expect(row).toContainText('Usuario QA Editado');
    // Eliminar
    await row.getByText('Eliminar').click();
    await expect(page.getByTestId('msg')).toHaveText('Usuario eliminado');
    await expect(row).toHaveCount(0);
  });

  test('F6. no permite crear usuario con contraseña corta', async ({ page }) => {
    await login(page);
    await page.getByTestId('user-username').fill('corto1');
    await page.getByTestId('user-nombre').fill('Corto');
    await page.getByTestId('user-password').fill('123');
    await page.getByTestId('user-save').click();
    await expect(page.getByTestId('msg')).toContainText('Contraseña inválida');
  });

  test('F7. no permite username duplicado', async ({ page }) => {
    await login(page);
    await page.getByTestId('user-username').fill('admin');
    await page.getByTestId('user-nombre').fill('Duplicado');
    await page.getByTestId('user-password').fill('secreto123');
    await page.getByTestId('user-save').click();
    await expect(page.getByTestId('msg')).toHaveText('El username ya existe');
  });
});

test.describe('Frontend - CRUD Productos', () => {
  test('F8. crear, editar y eliminar un producto', async ({ page }) => {
    const nombre = `Producto E2E ${Date.now()}`;
    await login(page);
    await page.getByTestId('tab-products').click();
    await page.getByTestId('product-nombre').fill(nombre);
    await page.getByTestId('product-precio').fill('45.5');
    await page.getByTestId('product-save').click();
    await expect(page.getByTestId('msg')).toHaveText('Producto creado');
    const row = page.locator(`[data-testid="product-row"][data-nombre="${nombre}"]`);
    await expect(row).toContainText('45.50');

    await row.getByText('Editar').click();
    await page.getByTestId('product-precio').fill('60');
    await page.getByTestId('product-save').click();
    await expect(page.getByTestId('msg')).toHaveText('Producto actualizado');
    await expect(row).toContainText('60.00');

    await row.getByText('Eliminar').click();
    await expect(page.getByTestId('msg')).toHaveText('Producto eliminado');
    await expect(row).toHaveCount(0);
  });

  test('F9. precio inválido muestra error', async ({ page }) => {
    await login(page);
    await page.getByTestId('tab-products').click();
    await page.getByTestId('product-nombre').fill('Sin precio');
    await page.getByTestId('product-save').click();
    await expect(page.getByTestId('msg')).toContainText('Precio inválido');
  });
});
