<#
.SYNOPSIS  Starts MAM! in production mode (API + web + admin) - much lighter than dev mode on 8 GB machines.
.DESCRIPTION
  Uses the production builds (node dist/main.js, next start). Pages are pre-compiled, so they open instantly and use
  far less memory than `next dev`. Use -Build after changing code (or the first time).
.PARAMETER Build  Rebuild shared packages, API, web and admin before starting.
.PARAMETER Only   Subset of apps: api, web, admin.
.EXAMPLE   powershell -ExecutionPolicy Bypass -File scripts\start-windows.ps1 -Build
.EXAMPLE   powershell -ExecutionPolicy Bypass -File scripts\start-windows.ps1
#>
param([switch]$Build, [string[]]$Only = @('api', 'web', 'admin'))
. "$PSScriptRoot\common.ps1"
Set-Location $Root
Use-LocalCaches
$ErrorActionPreference = 'Continue'

if (-not (Test-Path (Join-Path $Root 'apps\api\.env'))) { throw 'apps\api\.env missing - run scripts\setup-windows.ps1 first.' }

Write-Step 'Stopping running MAM! servers'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'mam\\(apps|node_modules)|start:dev|next (dev|start)|dist[\\/]main' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Write-Step 'Database'
if (Test-PortablePg) { Start-PortablePg }
elseif (Test-DockerAvailable) { Invoke-Checked 'docker compose up' { docker compose up -d postgres redis } }

$needBuild = $Build -or -not (Test-Path 'apps\api\dist\main.js') -or -not (Test-Path 'apps\web\.next\BUILD_ID') -or -not (Test-Path 'apps\admin\.next\BUILD_ID')
if ($needBuild) {
  Write-Step 'Building (one-time, a few minutes)'
  Invoke-Checked 'build:packages' { npm run build:packages }
  Push-Location apps\api; Invoke-Checked 'prisma migrate' { npx prisma migrate deploy }; Pop-Location
  if ($Only -contains 'api') { Invoke-Checked 'build api' { npm run build -w @mam/api } }
  $env:NEXT_TELEMETRY_DISABLED = '1'
  if ($Only -contains 'web') { Push-Location apps\web; Invoke-Checked 'build web' { npx next build }; Pop-Location }
  if ($Only -contains 'admin') { Push-Location apps\admin; Invoke-Checked 'build admin' { npx next build }; Pop-Location }
}

$envPrefix = "`$env:TMP='$env:TMP'; `$env:TEMP='$env:TEMP'; `$env:NEXT_TELEMETRY_DISABLED='1'; `$env:API_INTERNAL_URL='http://localhost:4000'; "
$apps = @{
  api   = @{ dir = 'apps\api';   cmd = 'node dist/main.js' }
  web   = @{ dir = 'apps\web';   cmd = 'node ..\..\node_modules\next\dist\bin\next start -p 3000' }
  admin = @{ dir = 'apps\admin'; cmd = 'node ..\..\node_modules\next\dist\bin\next start -p 3001' }
}
foreach ($name in $Only) {
  $a = $apps[$name]
  if (-not $a) { Write-Warn2 "Unknown app '$name'"; continue }
  $dir = Join-Path $Root $a.dir
  Start-Process powershell -ArgumentList '-NoExit', '-Command', "`$host.UI.RawUI.WindowTitle='MAM! $name (prod)'; Set-Location '$dir'; $envPrefix$($a.cmd)" | Out-Null
  Write-Ok "Started $name"
}
Write-Host "`n  Web http://localhost:3000   Admin http://localhost:3001   API http://localhost:4000/api/docs"
Write-Host '  (Pages are pre-built: after code changes run this script with -Build.)'
