<#
.SYNOPSIS  Production builds of shared packages, API, web and admin.
.EXAMPLE   powershell -ExecutionPolicy Bypass -File scripts\build-web.ps1
#>
. "$PSScriptRoot\common.ps1"
Set-Location $Root
Use-LocalCaches
$env:NEXT_TELEMETRY_DISABLED = '1'
Write-Step 'Shared packages'; Invoke-Checked 'build:packages' { npm run build:packages }
Write-Step 'API (NestJS)';    Invoke-Checked 'api build' { npm run build -w @mam/api }
Write-Step 'Web (Next.js)';   Invoke-Checked 'web build' { npm run build -w @mam/web }
Write-Step 'Admin (Next.js)'; Invoke-Checked 'admin build' { npm run build -w @mam/admin }
Write-Ok 'All production builds succeeded'
Write-Host @"
  Run:  apps\api   -> node dist/main.js           (port 4000)
        apps\web   -> npx next start -p 3000      (set API_INTERNAL_URL)
        apps\admin -> npx next start -p 3001      (set API_INTERNAL_URL)
"@
