<#
.SYNOPSIS  Runs the MAM! test suites and prints a summary.
.PARAMETER Skip  Suites to skip: typecheck, api-unit, api-integration, web, admin, android, e2e
.PARAMETER E2E   Also run Playwright end-to-end tests (needs built API/web and the mam_e2e database).
.EXAMPLE   powershell -ExecutionPolicy Bypass -File scripts\test-windows.ps1 -E2E
#>
param([string[]]$Skip = @(), [switch]$E2E)
. "$PSScriptRoot\common.ps1"
Set-Location $Root
Use-LocalCaches
if (Test-PortablePg) { Start-PortablePg; if (-not $env:TEST_DATABASE_URL) { $env:TEST_DATABASE_URL = "postgresql://postgres@localhost:$PortablePgPort/mam_itest?schema=public" } }
elseif (-not $env:TEST_DATABASE_URL) { $env:TEST_DATABASE_URL = 'postgresql://mam:mam_dev_password@localhost:5432/mam_itest?schema=public' }

$results = [ordered]@{}
function Run([string]$name, [string]$dir, [scriptblock]$block) {
  if ($Skip -contains $name) { $results[$name] = 'skipped'; return }
  Write-Step $name
  Push-Location (Join-Path $Root $dir)
  $ErrorActionPreference = 'Continue'   # test runners write to stderr; only the exit code decides pass/fail
  try { & $block; $results[$name] = if ($LASTEXITCODE -eq 0) { 'PASS' } else { "FAIL ($LASTEXITCODE)" } }
  catch { $results[$name] = "FAIL ($($_.Exception.Message))" }
  finally { Pop-Location }
}

Run 'typecheck' '.' { npm run build:packages; if ($LASTEXITCODE -eq 0) { npm run typecheck } }
Run 'api-unit' 'apps\api' { npx jest --config jest.config.js --selectProjects unit }
Run 'api-integration' 'apps\api' { npx jest --config jest.config.js --selectProjects integration --runInBand }
Run 'web' 'apps\web' { npx vitest run }
Run 'admin' 'apps\admin' { npx vitest run }
Run 'android' 'apps\android' { .\gradlew.bat testDebugUnitTest --console=plain }
if ($E2E) {
  if (-not $env:E2E_DATABASE_URL -and (Test-PortablePg)) { $env:E2E_DATABASE_URL = "postgresql://postgres@localhost:$PortablePgPort/mam_e2e?schema=public" }
  Run 'e2e' 'apps\web' { Push-Location $Root; npm run build -w @mam/api; Pop-Location; npx next build; if ($LASTEXITCODE -eq 0) { npx playwright test } }
}

Write-Step 'Summary'
$failed = 0
foreach ($k in $results.Keys) {
  $v = $results[$k]
  if ($v -eq 'PASS') { Write-Ok "$k" } elseif ($v -eq 'skipped') { Write-Host "  [SKIP] $k" } else { Write-Fail "$k - $v"; $failed++ }
}
if ($failed) { exit 1 }
