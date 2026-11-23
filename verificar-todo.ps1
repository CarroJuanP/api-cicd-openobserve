param(
  [Parameter(Mandatory=$true)][string]$App,
  [Parameter(Mandatory=$true)][string]$OO,
  [Parameter(Mandatory=$true)][string]$OOUser,
  [Parameter(Mandatory=$true)][string]$OOPass,
  [string]$AppUser = 'admin',
  [string]$AppPass = 'Admin123!'
)
$ErrorActionPreference = 'Stop'
$App = $App.TrimEnd('/'); $OO = $OO.TrimEnd('/')
$basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${OOUser}:${OOPass}"))
$ooHeaders = @{ Authorization = "Basic $basic" }
$results = @()
function Check($name, [scriptblock]$test) {
  try { $detail = & $test; $script:results += [pscustomobject]@{ Prueba=$name; Estado='OK'; Detalle="$detail" } }
  catch { $script:results += [pscustomobject]@{ Prueba=$name; Estado='FALLO'; Detalle=$_.Exception.Message } }
}
function Streams($type) {
  $r = Invoke-RestMethod -Uri "$OO/api/default/streams?type=$type" -Headers $ooHeaders -TimeoutSec 20
  return @($r.list | ForEach-Object { $_.name })
}

Check 'App: /api/status responde' { (Invoke-RestMethod "$App/api/status" -TimeoutSec 20).status }
Check 'App: login admin devuelve token' {
  $l = Invoke-RestMethod "$App/api/auth/login" -Method Post -ContentType 'application/json' -Body (@{username=$AppUser;password=$AppPass}|ConvertTo-Json) -TimeoutSec 20
  $script:token = $l.token; if (-not $l.token) { throw 'sin token' }; 'token recibido'
}
Check 'App: /api/users con token' { (Invoke-RestMethod "$App/api/users" -Headers @{Authorization="Bearer $script:token"} -TimeoutSec 20).Count.ToString() + ' usuarios' }
Check 'App: /api/users sin token da 401' {
  try { Invoke-RestMethod "$App/api/users" -TimeoutSec 20 | Out-Null; throw 'respondió 200 sin token' }
  catch { if ($_.Exception.Response.StatusCode.value__ -ne 401) { throw $_.Exception.Message } else { '401 correcto' } }
}
Check 'App: frontend servido en /' { if ((Invoke-WebRequest "$App/" -UseBasicParsing -TimeoutSec 20).Content -notmatch 'Panel de Gesti') { throw 'no es el frontend' }; 'HTML correcto' }

Check 'OpenObserve: /healthz' { (Invoke-RestMethod "$OO/healthz" -TimeoutSec 20) | Out-String }
$logs = @(); $metrics = @(); $traces = @()
Check 'OpenObserve: listar streams de logs' { $script:logs = Streams 'logs'; $script:logs -join ', ' }
Check 'OpenObserve: listar streams de métricas' { $script:metrics = Streams 'metrics'; "$($script:metrics.Count) métricas" }
Check 'OpenObserve: listar streams de trazas' { $script:traces = Streams 'traces'; $script:traces -join ', ' }
Check 'RF-03: stream cicd_pipeline existe' { if ($script:logs -notcontains 'cicd_pipeline') { throw 'no existe: el pipeline no está enviando datos' }; 'existe' }
Check 'RF-04 logs: stream default (logs de la app)' { if ($script:logs -notcontains 'default') { throw 'no existe' }; 'existe' }
Check 'RF-04 trazas: hay trazas' { if ($script:traces.Count -eq 0) { throw 'sin trazas' }; 'existen' }
Check 'RF-04 métricas de endpoints (app_http_*)' { $m = @($script:metrics | Where-Object { $_ -like 'app_http_*' }); if ($m.Count -eq 0) { throw 'sin app_http_*' }; $m -join ', ' }
Check 'RF-05 CPU (system_cpu_*)' { $m = @($script:metrics | Where-Object { $_ -like 'system_cpu*' }); if ($m.Count -eq 0) { throw 'sin métricas de CPU' }; $m -join ', ' }
Check 'RF-05 RAM (system_memory_*)' { $m = @($script:metrics | Where-Object { $_ -like 'system_memory*' }); if ($m.Count -eq 0) { throw 'sin métricas de RAM' }; $m -join ', ' }
Check 'RF-05 red / ancho de banda (system_network_*)' { $m = @($script:metrics | Where-Object { $_ -like 'system_network*' }); if ($m.Count -eq 0) { throw 'sin métricas de red' }; $m -join ', ' }
Check 'RF-05 temperatura (host_temperature)' { if ($script:logs -notcontains 'host_temperature') { throw 'sin datos (EC2 no expone sensores: usa TEMP_SOURCE=simulated y decláralo)' }; 'existe' }
Check 'RF-03: últimos eventos del pipeline' {
  $end = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() * 1000
  $start = $end - (7L * 24 * 3600 * 1000000)
  $body = @{ query = @{ sql = 'SELECT * FROM "cicd_pipeline" ORDER BY _timestamp DESC'; start_time = $start; end_time = $end; from = 0; size = 8 } } | ConvertTo-Json -Depth 5
  $r = Invoke-RestMethod "$OO/api/default/_search?type=logs" -Method Post -Headers $ooHeaders -ContentType 'application/json' -Body $body -TimeoutSec 30
  if (-not $r.hits -or $r.hits.Count -eq 0) { throw 'sin eventos en los últimos 7 días' }
  ($r.hits | ForEach-Object { "$($_.event)/$($_.status)/$(([string]$_.commit).Substring(0,7))" }) -join '  |  '
}

$results | Format-Table -AutoSize -Wrap
$fail = @($results | Where-Object { $_.Estado -eq 'FALLO' }).Count
Write-Host ("`nRESULTADO: {0} OK, {1} con fallo" -f ($results.Count - $fail), $fail) -ForegroundColor $(if ($fail) {'Yellow'} else {'Green'})
