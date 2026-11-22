# API REST + Frontend con CI/CD, Playwright y Observabilidad (OpenObserve)

Node.js + Express + SQLite, con login y CRUD de usuarios/productos, pruebas Jest y Playwright,
pipeline en GitHub Actions hacia AWS EC2 y observabilidad con OpenTelemetry + OpenObserve.

## Estructura
| Ruta | Contenido |
|---|---|
| `index.js`, `auth.js`, `security.js`, `database.js` | API, login (token HMAC), CRUD de usuarios |
| `public/` | Frontend (login + CRUD usuarios/productos) |
| `telemetry.js`, `observability.js`, `dbtrace.js` | OpenTelemetry: logs, métricas, trazas (incl. spans SQL) |
| `tests/` | Jest + Supertest: 545 casos (incluye `matrix.test.js`, data-driven) |
| `e2e/`, `playwright.config.js` | Playwright: 374 casos (UI, interacciones y contrato de API) |
| `Dockerfile` | Imagen `node:20-alpine` |
| `docker-compose.yml` | EC2: api + OpenObserve + OTel Collector + temp-agent |
| `infra/` | Config del Collector (CPU/RAM/red) y agente de temperatura |
| `.github/workflows/deploy.yml` | Pipeline: tests -> log -> build -> deploy -> log |

## Local
```bash
npm install
npm test                          # Jest
npx playwright install chromium
npx playwright test               # E2E (levanta la app en el puerto 3100 con BD temporal)
npm start                         # http://localhost:8080  (admin / Admin123!)
```

## Puesta en marcha en EC2
1. Ubuntu + Docker + plugin `docker compose`. Grupo de seguridad: **22, 80, 5080**.
2. `echo -n 'correo:password' | base64` -> valor de `OO_BASIC_AUTH`.
3. Secretos en GitHub (Settings > Secrets > Actions):
   `DOCKERHUB_USERNAME, DOCKERHUB_TOKEN, EC2_HOST, EC2_USERNAME, EC2_SSH_KEY, JWT_SECRET, ADMIN_PASSWORD,
   ZO_ROOT_USER_EMAIL, ZO_ROOT_USER_PASSWORD, OO_BASIC_AUTH, OO_URL (http://IP-EC2:5080), TEMP_SOURCE (opcional)`.
4. `git push origin main` -> el pipeline prueba, construye y despliega.

## Demostración de los criterios de aceptación
* **Fallo:** en `index.js`, cambia `/api/status` a `res.status(500).json(...)` y haz push -> Jest/Playwright fallan,
  `log-tests` registra `failure` en OpenObserve y **no** corre `deploy-ec2` (sin SSH).
* **Éxito:** revierte el cambio y haz push -> despliegue + evento `deploy` en el stream `cicd_pipeline`.

## OpenObserve (http://IP-EC2:5080)
Streams: `cicd_pipeline` (pipeline), `default` (logs/trazas), métricas `app_http_*` y `system_*`, `host_temperature`.
Consultas de los paneles y alertas: ver el reporte (sección 9).

Guía detallada de EC2, secretos y OpenObserve: `docs/GUIA_EC2_GITHUB.md`.
