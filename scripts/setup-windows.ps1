<#
.SYNOPSIS
  One-time setup for MAM! on Windows 10/11.
.DESCRIPTION
  Checks prerequisites, creates env files (never overwriting existing ones without confirmation),
  installs dependencies, builds shared packages, generates the Prisma client, starts a database,
  runs migrations + seed, and prepares the Android project.
.PARAMETER PortablePostgres
  No Docker? Download a portable PostgreSQL 17 + PostGIS 3.6 into .devtools and run it on port 5433.
.PARAMETER SkipInstall
  Skip `npm ci`.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1
  powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1 -PortablePostgres
#>
param([switch]$PortablePostgres, [switch]$SkipInstall)
. "$PSScriptRoot\common.ps1"
Set-Location $Root
Use-LocalCaches

Write-Step 'Checking required software'
$problems = 0
if (Test-Command 'node') {
  $v = [version]((node -v).TrimStart('v'))
  if ($v -ge [version]'20.11.0') { Write-Ok "Node.js $v" } else { Write-Fail "Node.js $v - need >= 20.11"; $problems++ }
} else { Write-Fail 'Node.js not found - install from https://nodejs.org (LTS)'; $problems++ }
if (Test-Command 'npm') { Write-Ok "npm $(npm -v)" } else { Write-Fail 'npm not found'; $problems++ }
if (Test-Command 'git') { Write-Ok ((git --version) -replace 'git version ', 'Git ') } else { Write-Warn2 'Git not found (needed for version control only)' }
if (Test-Command 'java') {
  $jv = (& java -version 2>&1 | Select-Object -First 1).ToString()
  if ($jv -match '"(\d+)') { if ([int]$Matches[1] -ge 17) { Write-Ok "Java: $jv" } else { Write-Fail "Java 17+ required for Android ($jv)"; $problems++ } }
} else { Write-Warn2 'Java JDK not found - required only for the Android build (install Temurin 17)' }
if ($env:JAVA_HOME) { Write-Ok "JAVA_HOME=$env:JAVA_HOME" } else { Write-Warn2 'JAVA_HOME is not set (Android build may fail)' }
$sdk = Get-AndroidSdk
if ($sdk) { Write-Ok "Android SDK: $sdk" } else { Write-Warn2 'Android SDK not found (install Android Studio or set ANDROID_HOME)' }
$docker = Test-DockerAvailable
if ($docker) { Write-Ok 'Docker is running' } elseif (Test-Command 'docker') { Write-Warn2 'Docker installed but not running - start Docker Desktop, or use -PortablePostgres' } else { Write-Warn2 'Docker not found - use -PortablePostgres for a local database' }
$freeC = Get-FreeGB $env:SystemDrive
if ($freeC -ne $null) { if ($freeC -lt 5) { Write-Warn2 "$($env:SystemDrive) free space: $freeC GB (low - caches redirected to .devtools)" } else { Write-Ok "$($env:SystemDrive) free space: $freeC GB" } }
if ($problems -gt 0) { throw "$problems required tool(s) missing. Fix the items marked [FAIL] and re-run." }

Write-Step 'Environment files'
$apiEnv = Join-Path $Root 'apps\api\.env'
$writeEnv = $true
if (Test-Path $apiEnv) {
  $ans = Read-Host "apps\api\.env already exists. Overwrite? (y/N)"
  $writeEnv = ($ans -eq 'y')
  if (-not $writeEnv) { Write-Ok 'Keeping existing apps\api\.env' }
}
if ($writeEnv) {
  $dbUrl = if ($PortablePostgres -or -not $docker) { "postgresql://postgres@localhost:$PortablePgPort/mam?schema=public" } else { 'postgresql://mam:mam_dev_password@localhost:5432/mam?schema=public' }
  $content = (Get-Content (Join-Path $Root '.env.example') -Raw) `
    -replace 'JWT_ACCESS_SECRET=.*', "JWT_ACCESS_SECRET=$(New-Secret)" `
    -replace 'COOKIE_SECRET=.*', "COOKIE_SECRET=$(New-Secret)" `
    -replace 'DATABASE_URL=.*', "DATABASE_URL=$dbUrl" `
    -replace 'POSTGRES_PASSWORD=.*', 'POSTGRES_PASSWORD=mam_dev_password' `
    -replace 'DEV_LOGIN_ENABLED=false', 'DEV_LOGIN_ENABLED=true'
  if (-not $docker) { $content = $content -replace 'REDIS_URL=.*', 'REDIS_URL=' }
  Set-Content -Path $apiEnv -Value $content -Encoding utf8
  Write-Ok 'Created apps\api\.env with fresh random secrets (DEV_LOGIN enabled for local development only)'
}
$composeEnv = Join-Path $Root '.env'
if ($docker -and -not (Test-Path $composeEnv)) { Copy-Item $apiEnv $composeEnv; Write-Ok 'Created .env for docker compose' }

Write-Step 'Installing dependencies'
if (-not $SkipInstall) { Invoke-Checked 'npm ci' { npm ci --no-audit --no-fund } }
Invoke-Checked 'build shared packages' { npm run build:packages }
Push-Location apps\api
Invoke-Checked 'prisma generate' { npx prisma generate }
Pop-Location

Write-Step 'Database'
if ($PortablePostgres -or -not $docker) {
  if (-not (Test-PortablePg)) {
    if (-not $PortablePostgres) { throw 'No Docker available. Re-run with -PortablePostgres to download a local PostgreSQL + PostGIS (~460 MB).' }
    New-Item -ItemType Directory -Force (Join-Path $DevTools 'dl') | Out-Null
    $pgZip = Join-Path $DevTools 'dl\pg.zip'; $gisZip = Join-Path $DevTools 'dl\postgis.zip'
    Write-Host '  Downloading PostgreSQL 17 binaries (EDB)...'
    Invoke-WebRequest 'https://get.enterprisedb.com/postgresql/postgresql-17.10-1-windows-x64-binaries.zip' -OutFile $pgZip -UseBasicParsing
    Write-Host '  Downloading PostGIS 3.6 bundle (OSGeo)...'
    Invoke-WebRequest 'https://download.osgeo.org/postgis/windows/pg17/postgis-bundle-pg17-3.6.2x64.zip' -OutFile $gisZip -UseBasicParsing
    Expand-Archive $pgZip -DestinationPath $DevTools -Force
    $gisTmp = Join-Path $DevTools 'gis'
    Expand-Archive $gisZip -DestinationPath $gisTmp -Force
    Copy-Item (Join-Path (Get-ChildItem $gisTmp -Directory | Select-Object -First 1).FullName '*') $PortablePg -Recurse -Force
    Remove-Item $gisTmp, (Join-Path $DevTools 'dl') -Recurse -Force
  }
  if (-not (Test-Path $PortablePgData)) {
    Invoke-Checked 'initdb' { & (Join-Path $PortablePg 'bin\initdb.exe') -D $PortablePgData -U postgres -A trust -E UTF8 --locale=C | Out-Null }
    Write-Warn2 'Portable cluster uses trust auth on localhost - development only.'
  }
  Start-PortablePg
  $psql = Join-Path $PortablePg 'bin\psql.exe'
  foreach ($db in 'mam', 'mam_itest', 'mam_e2e') {
    $exists = & $psql -p $PortablePgPort -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'"
    if (-not $exists) { & $psql -p $PortablePgPort -U postgres -q -c "CREATE DATABASE $db;"; Write-Ok "Created database $db" }
  }
} else {
  Invoke-Checked 'docker compose up' { docker compose up -d postgres redis }
  Write-Host '  Waiting for PostgreSQL...'
  for ($i = 0; $i -lt 30; $i++) { docker compose exec -T postgres pg_isready -U mam *> $null; if ($LASTEXITCODE -eq 0) { break }; Start-Sleep 2 }
  docker compose exec -T postgres psql -U mam -d mam -tAc "SELECT 1 FROM pg_database WHERE datname='mam_itest'" | Out-Null
  docker compose exec -T postgres psql -U mam -d mam -c "CREATE DATABASE mam_itest" 2>$null | Out-Null
  docker compose exec -T postgres psql -U mam -d mam -c "CREATE DATABASE mam_e2e" 2>$null | Out-Null
  Write-Ok 'PostgreSQL + Redis running in Docker'
}

Write-Step 'Migrations + seed'
Push-Location apps\api
Invoke-Checked 'prisma migrate deploy' { npx prisma migrate deploy }
Invoke-Checked 'seed' { npm run prisma:seed }
Pop-Location

Write-Step 'Android project'
$androidDir = Join-Path $Root 'apps\android'
$localProps = Join-Path $androidDir 'local.properties'
if ($sdk -and -not (Test-Path $localProps)) {
  "sdk.dir=$($sdk -replace '\\','/')" | Set-Content $localProps -Encoding ascii
  Write-Ok 'Created apps\android\local.properties'
}
$secrets = Join-Path $androidDir 'secrets.properties'
if (-not (Test-Path $secrets)) { Copy-Item (Join-Path $androidDir 'secrets.properties.example') $secrets; Write-Ok 'Created apps\android\secrets.properties (fill in keys)' }

Write-Step 'Done'
Write-Host @"
  Start everything:       powershell -ExecutionPolicy Bypass -File scripts\dev-windows.ps1
  Run tests:              powershell -ExecutionPolicy Bypass -File scripts\test-windows.ps1
  Build Android APK:      powershell -ExecutionPolicy Bypass -File scripts\build-android.ps1
  Production web builds:  powershell -ExecutionPolicy Bypass -File scripts\build-web.ps1

  Web:   http://localhost:3000     Admin: http://localhost:3001     API docs: http://localhost:4000/api/docs
  Dev login (no Google needed): superadmin@mam.local, moderator@mam.local, budi@mam.local
  Google features need keys in apps\api\.env - see docs\integrations\GOOGLE_MAPS.md
"@
