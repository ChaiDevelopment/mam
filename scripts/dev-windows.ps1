<#
.SYNOPSIS  Starts the database and the API, web and admin dev servers (each in its own window).
.EXAMPLE   powershell -ExecutionPolicy Bypass -File scripts\dev-windows.ps1
.EXAMPLE   powershell -ExecutionPolicy Bypass -File scripts\dev-windows.ps1 -Only api,web
#>
param([string[]]$Only = @('api', 'web', 'admin'))
. "$PSScriptRoot\common.ps1"
Set-Location $Root
Use-LocalCaches

if (-not (Test-Path (Join-Path $Root 'apps\api\.env'))) { throw 'apps\api\.env missing - run scripts\setup-windows.ps1 first.' }

Write-Step 'Database'
if (Test-PortablePg) { Start-PortablePg }
elseif (Test-DockerAvailable) { Invoke-Checked 'docker compose up' { docker compose up -d postgres redis } ; Write-Ok 'Docker PostgreSQL + Redis up' }
else { Write-Warn2 'No portable PostgreSQL or Docker found - assuming DATABASE_URL points to a running server.' }

Write-Step 'Building shared packages'
Invoke-Checked 'build:packages' { npm run build:packages }

$windows = @{
  api   = @{ dir = 'apps\api';   cmd = 'npm run start:dev' }
  web   = @{ dir = 'apps\web';   cmd = '$env:API_INTERNAL_URL="http://localhost:4000"; npm run dev' }
  admin = @{ dir = 'apps\admin'; cmd = '$env:API_INTERNAL_URL="http://localhost:4000"; npm run dev' }
}
foreach ($name in $Only) {
  $w = $windows[$name]
  if (-not $w) { Write-Warn2 "Unknown app '$name' (use api, web, admin)"; continue }
  $dir = Join-Path $Root $w.dir
  $envPrefix = if ($env:GRADLE_USER_HOME) { "`$env:TMP='$env:TMP'; `$env:TEMP='$env:TEMP'; `$env:npm_config_cache='$env:npm_config_cache'; " } else { '' }
  Start-Process powershell -ArgumentList '-NoExit', '-Command', "`$host.UI.RawUI.WindowTitle='MAM! $name'; Set-Location '$dir'; $envPrefix$($w.cmd)" | Out-Null
  Write-Ok "Started $name in a new window"
}
Write-Host "`n  API http://localhost:4000/api/docs   Web http://localhost:3000   Admin http://localhost:3001"
