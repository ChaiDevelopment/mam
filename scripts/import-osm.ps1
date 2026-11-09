<#
.SYNOPSIS  Imports all food places in Indonesia from OpenStreetMap (Geofabrik extracts) into the MAM! database.
.DESCRIPTION
  1. Downloads the regional .osm.pbf extracts (Sumatra, Jawa, Kalimantan, Sulawesi, Nusa Tenggara, Maluku, Papua)
     from download.geofabrik.de into .devtools\osm\pbf (~1.7 GB; skipped when already present).
  2. Extracts named restaurants/cafes/warung/bakeries + localities with pyosmium (installed into .devtools\pylib).
  3. Loads them idempotently into PostgreSQL (re-running updates places in place, never duplicates).
  Data (c) OpenStreetMap contributors, ODbL 1.0 - see docs\integrations\OPENSTREETMAP.md.
.PARAMETER Regions  Subset of regions (Geofabrik names): sumatra, java, kalimantan, sulawesi, nusa-tenggara, maluku, papua.
.PARAMETER Refresh  Re-download extracts (Geofabrik updates them daily).
.EXAMPLE   powershell -ExecutionPolicy Bypass -File scripts\import-osm.ps1
.EXAMPLE   powershell -ExecutionPolicy Bypass -File scripts\import-osm.ps1 -Regions maluku,papua -Refresh
#>
param([string[]]$Regions = @('sumatra', 'java', 'kalimantan', 'sulawesi', 'nusa-tenggara', 'maluku', 'papua'), [switch]$Refresh)
. "$PSScriptRoot\common.ps1"
Use-LocalCaches
$ErrorActionPreference = 'Continue'
$osmDir = Join-Path $DevTools 'osm'
$pbfDir = Join-Path $osmDir 'pbf'
$pyLib = Join-Path $DevTools 'pylib'
New-Item -ItemType Directory -Force $pbfDir | Out-Null
$api = Join-Path $Root 'apps\api'
if (-not (Test-Path (Join-Path $api '.env'))) { throw 'apps\api\.env missing - run scripts\setup-windows.ps1 first.' }

Write-Step 'Python + pyosmium'
$python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $python) { throw 'Python 3 is required (https://www.python.org/downloads/ or "winget install Python.Python.3.13").' }
$env:PYTHONPATH = $pyLib
& $python -c "import osmium" 2>$null
if ($LASTEXITCODE -ne 0) {
  $env:PIP_CACHE_DIR = Join-Path $DevTools 'pip-cache'
  Invoke-Checked 'pip install osmium' { & $python -m pip install --disable-pip-version-check --target $pyLib osmium }
}
Write-Ok 'pyosmium available'

Write-Step 'Download Geofabrik extracts'
foreach ($r in $Regions) {
  $file = Join-Path $pbfDir "$r-latest.osm.pbf"
  if ((Test-Path $file) -and -not $Refresh) { Write-Ok "$r (cached)"; continue }
  $url = "https://download.geofabrik.de/asia/indonesia/$r-latest.osm.pbf"
  Write-Host "  downloading $url"
  Invoke-Checked "download $r" { & curl.exe -L --fail --retry 3 -A 'MAM-osm-import/0.1' -o "$file.part" $url }
  Move-Item -Force "$file.part" $file
  Write-Ok "$r ($([math]::Round((Get-Item $file).Length / 1MB)) MB)"
}

Write-Step 'Extract food places and localities'
$ndjson = @()
foreach ($r in $Regions) {
  $pbf = Join-Path $pbfDir "$r-latest.osm.pbf"
  $out = Join-Path $osmDir "$r.ndjson"
  if ((Test-Path $out) -and ((Get-Item $out).LastWriteTime -gt (Get-Item $pbf).LastWriteTime)) { Write-Ok "$r (up to date)"; $ndjson += $out; continue }
  Invoke-Checked "extract $r" { & $python -P (Join-Path $api 'scripts\osm\extract_osm.py') $pbf "$out.tmp" }
  Move-Item -Force "$out.tmp" $out
  $ndjson += $out
}

Write-Step 'Load into PostgreSQL'
if (Test-PortablePg) { Start-PortablePg }
Push-Location $api
try {
  Invoke-Checked 'import-osm' { npx ts-node --transpile-only scripts/osm/import-osm.ts @ndjson }
  # Known food brands (Wikidata + freely licensed Commons logos/photos) and brand links for chain outlets.
  Invoke-Checked 'import-brands' { npx ts-node --transpile-only scripts/import-brands.ts prisma/data/brands.json }
}
finally { Pop-Location }
Write-Ok 'OpenStreetMap import finished. Attribution "(c) OpenStreetMap contributors" is shown wherever this data appears.'
