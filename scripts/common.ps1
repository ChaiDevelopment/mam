# Shared helpers for MAM! Windows scripts (PowerShell 5.1+). Dot-source: . "$PSScriptRoot\common.ps1"
$ErrorActionPreference = 'Stop'
$Script:Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Script:DevTools = Join-Path $Root '.devtools'
$Script:PortablePg = Join-Path $DevTools 'pgsql'
$Script:PortablePgData = Join-Path $DevTools 'pgdata'
$Script:PortablePgPort = 5433

function Write-Step([string]$m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok([string]$m) { Write-Host "  [OK]   $m" -ForegroundColor Green }
function Write-Warn2([string]$m) { Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Write-Fail([string]$m) { Write-Host "  [FAIL] $m" -ForegroundColor Red }

function Test-Command([string]$name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }

function Invoke-Checked([string]$what, [scriptblock]$block) {
  # Native tools (npm, jest, gradle) write progress to stderr; under 'Stop' PowerShell 5.1 would abort on it.
  $ErrorActionPreference = 'Continue'
  & $block
  if ($LASTEXITCODE -ne 0) { throw "$what failed (exit $LASTEXITCODE)" }
}

function Get-AndroidSdk {
  foreach ($p in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android\Sdk'))) {
    if ($p -and (Test-Path (Join-Path $p 'platforms'))) { return $p }
  }
  return $null
}

function Test-DockerAvailable {
  if (-not (Test-Command 'docker')) { return $false }
  docker info *> $null
  return ($LASTEXITCODE -eq 0)
}

function Test-PortablePg { return (Test-Path (Join-Path $PortablePg 'bin\pg_ctl.exe')) }

function Start-PortablePg {
  $pgctl = Join-Path $PortablePg 'bin\pg_ctl.exe'
  & $pgctl -D $PortablePgData status *> $null
  if ($LASTEXITCODE -eq 0) { Write-Ok "Portable PostgreSQL already running on :$PortablePgPort"; return }
  & $pgctl -D $PortablePgData -l (Join-Path $DevTools 'pg.log') -o "-p $PortablePgPort" start | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not start portable PostgreSQL (see .devtools\pg.log)" }
  Write-Ok "Portable PostgreSQL started on :$PortablePgPort"
}

function Get-FreeGB([string]$drive) {
  $d = Get-PSDrive -Name $drive.TrimEnd(':') -ErrorAction SilentlyContinue
  if ($d) { return [math]::Round($d.Free / 1GB, 1) } else { return $null }
}

# Keep npm, Gradle, Playwright and temp files next to the repo (under .devtools) instead of the system drive.
# Set MAM_USE_SYSTEM_CACHES=1 to opt out.
function Use-LocalCaches {
  if ($env:MAM_USE_SYSTEM_CACHES -ne '1') {
    $free = Get-FreeGB $env:SystemDrive
    Write-Ok "Using caches/temp under $DevTools ($($env:SystemDrive) free: $free GB)"
    New-Item -ItemType Directory -Force (Join-Path $DevTools 'npm-cache'), (Join-Path $DevTools 'tmp'), (Join-Path $DevTools 'gradle-home') | Out-Null
    $env:npm_config_cache = Join-Path $DevTools 'npm-cache'
    $env:TMP = Join-Path $DevTools 'tmp'
    $env:TEMP = $env:TMP
    $env:GRADLE_USER_HOME = Join-Path $DevTools 'gradle-home'
    $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $DevTools 'pw'
    $env:NEXT_TELEMETRY_DISABLED = '1'
  }
}

function New-Secret { $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); return (-join ($b | ForEach-Object { $_.ToString('x2') })) }
