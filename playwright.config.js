const { defineConfig, devices } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = process.env.E2E_PORT || 3100;
const E2E_DB_PATH = path.join(os.tmpdir(), `api-e2e-${process.pid}.db`);

// Empieza cada ejecución de Playwright con una base temporal limpia.
try { fs.rmSync(E2E_DB_PATH, { force: true }); } catch (_) {}

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'playwright-report/results.json' }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Levanta la app con una BD temporal para no tocar datos reales
  webServer: {
    command: 'node index.js',
    url: `http://localhost:${PORT}/api/status`,
    reuseExistingServer: false,
    env: { PORT: String(PORT), TCP_PORT: String(Number(PORT) + 1), DB_PATH: E2E_DB_PATH, ADMIN_PASSWORD: 'Admin123!', NODE_ENV: 'e2e' },
  },
});
