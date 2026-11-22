# Guía paso a paso: EC2 + GitHub Actions + OpenObserve

## 0. Probar OpenObserve en tu PC antes de usar EC2 (recomendado)
Así descubres errores de instrumentación sin tocar la nube. Requiere Docker Desktop.
```powershell
docker run -d --name oo -p 5080:5080 -e ZO_ROOT_USER_EMAIL=admin@example.com -e ZO_ROOT_USER_PASSWORD=Clave12345! public.ecr.aws/zinclabs/openobserve:latest
# Base64 de "correo:password" (PowerShell):
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("admin@example.com:Clave12345!"))
# Arranca la API enviando telemetría a tu OpenObserve local:
$env:OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:5080/api/default"
$env:OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic <PEGA_EL_BASE64>"
$env:OTEL_SERVICE_NAME="api-devops-sqlite"
npm start
```
Navega la app (http://localhost:8080) y en http://localhost:5080 revisa **Logs**, **Metrics** y **Traces**.
Si no aparece nada tras ~30 s, revisa la consola de la API (debe decir `[telemetry] OpenTelemetry iniciado`).

## 1. Crear la instancia EC2
1. AWS Console > EC2 > **Launch instance**.
2. Nombre: `api-devops`. AMI: **Ubuntu Server 22.04/24.04 LTS**.
3. Tipo: **t3.small** (2 GB RAM) como mínimo.
4. Key pair: *Create new key pair* (RSA, `.pem`). Guarda el archivo.
5. Network settings > Create security group con reglas de entrada:
   | Tipo | Puerto | Origen |
   |---|---|---|
   | SSH | 22 | 0.0.0.0/0 (GitHub Actions usa IPs variables) |
   | HTTP | 80 | 0.0.0.0/0 |
   | TCP personalizado | 5080 | 0.0.0.0/0 |
6. Almacenamiento: 20 GB. **Launch**.
7. EC2 > Elastic IPs > **Allocate** > **Associate** con tu instancia (IP fija).

## 2. Preparar el servidor
```bash
ssh -i llave.pem ubuntu@IP-ELASTICA
# copia el script desde tu PC:  scp -i llave.pem infra/setup-ec2.sh ubuntu@IP:~/
bash setup-ec2.sh
exit            # vuelve a entrar para activar el grupo docker
ssh -i llave.pem ubuntu@IP-ELASTICA
docker compose version
```

## 3. Levantar OpenObserve antes del primer push
```bash
# desde tu PC:
scp -i llave.pem docker-compose.yml ubuntu@IP:~/app/
scp -i llave.pem -r infra ubuntu@IP:~/app/
# en la EC2:
cd ~/app
nano .env          # copia el contenido de .env.example y ajusta valores
docker compose up -d openobserve
```
Abre `http://IP:5080` e inicia sesión con el correo/contraseña del `.env`.
`OO_BASIC_AUTH` = Base64 de `correo:contraseña`
(Linux: `echo -n 'correo:pass' | base64`).

## 4. Docker Hub
Docker Hub > Account settings > Security > **New Access Token** (permisos Read & Write). Guárdalo.

## 5. Secretos en GitHub
Repo > Settings > Secrets and variables > Actions > **New repository secret**:
| Secreto | Valor |
|---|---|
| DOCKERHUB_USERNAME | tu usuario de Docker Hub |
| DOCKERHUB_TOKEN | el token del paso 4 |
| EC2_HOST | IP elástica |
| EC2_USERNAME | `ubuntu` |
| EC2_SSH_KEY | contenido COMPLETO del `.pem` (incluye BEGIN/END) |
| JWT_SECRET | cadena larga aleatoria |
| ADMIN_PASSWORD | contraseña del usuario admin de la app |
| ZO_ROOT_USER_EMAIL / ZO_ROOT_USER_PASSWORD | credenciales de OpenObserve |
| OO_BASIC_AUTH | Base64 de `correo:contraseña` |
| OO_URL | `http://IP:5080` (sin barra final) |
| TEMP_SOURCE | `real` o `simulated` |

## 6. Primer despliegue
`git add . && git commit -m "CI/CD completo" && git push origin main` y vigila **Actions**.
Si `deploy-ec2` falla: lee el log del paso; los errores típicos son llave `.pem` incompleta, puerto 22 cerrado o usuario incorrecto.
En la EC2: `cd ~/app && docker compose ps && docker compose logs api --tail 50`.

## 7. Dashboards y alertas
Ver sección 9 del reporte. En OpenObserve: Dashboards > Add dashboard > Add panel; para PromQL elige el tipo de consulta *PromQL*.
Alertas: Alerts > Add alert (SQL para `cicd_pipeline` y logs; condición sobre métricas para CPU/RAM).

## 8. Demostración de los criterios
* Fallo: en `index.js` cambia `/api/status` a `res.status(500).json(...)` > push > Actions rojo, `deploy-ec2` *skipped*, evento `failure` en `cicd_pipeline`.
* Éxito: revierte > push > despliegue + evento `deploy`/`success`.

## 9. Si algo no aparece en OpenObserve
| Síntoma | Causa probable |
|---|---|
| `log-tests` no crea `cicd_pipeline` | `OO_URL` incorrecto o puerto 5080 cerrado |
| No hay trazas/logs de la app | revisar `OTEL_EXPORTER_OTLP_HEADERS` (Base64) y `docker compose logs api` |
| No hay métricas `system_*` | `docker compose logs otel-collector` |
| `host_temperature` vacío | EC2 no expone sensores: usar `TEMP_SOURCE=simulated` y declararlo |
| Contenedores se reinician | poca RAM: usar t3.small y el swap del script |
