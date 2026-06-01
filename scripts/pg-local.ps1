# Manage the local (no-Docker) PostgreSQL instance used for development.
#
#   Usage:  powershell -File scripts/pg-local.ps1 <start|stop|status|restart>
#   Or via npm:  npm run db:local:start | db:local:stop | db:local:status
#
# Paths can be overridden with env vars: PG_BIN, PG_DATA, PG_LOG, PG_PORT.

param(
  [Parameter(Position = 0)]
  [ValidateSet("start", "stop", "status", "restart")]
  [string]$Action = "status"
)

$ErrorActionPreference = "Stop"

$pgBin  = if ($env:PG_BIN)  { $env:PG_BIN }  else { Join-Path $env:LOCALAPPDATA "Programs\pgsql\bin" }
$pgData = if ($env:PG_DATA) { $env:PG_DATA } else { Join-Path $env:LOCALAPPDATA "oosta-pgdata" }
$pgLog  = if ($env:PG_LOG)  { $env:PG_LOG }  else { Join-Path $env:LOCALAPPDATA "oosta-pgdata.server.log" }
$pgPort = if ($env:PG_PORT) { $env:PG_PORT } else { "5432" }
$pgCtl  = Join-Path $pgBin "pg_ctl.exe"

if (-not (Test-Path $pgCtl)) {
  Write-Error "pg_ctl not found at '$pgCtl'. Set PG_BIN to your PostgreSQL bin directory."
  exit 1
}

switch ($Action) {
  "start"   { & $pgCtl -D $pgData -l $pgLog -o "-p $pgPort" -w start }
  "restart" { & $pgCtl -D $pgData -l $pgLog -o "-p $pgPort" -w restart }
  "stop"    { & $pgCtl -D $pgData -m fast stop }
  "status"  { & $pgCtl -D $pgData status }
}
