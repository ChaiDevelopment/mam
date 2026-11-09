<#
.SYNOPSIS  Builds the Android app with the Gradle wrapper (gradlew.bat).
.PARAMETER Release  Build a release APK (requires signing config; see docs\deployment\DEPLOYMENT_GUIDE.md).
.PARAMETER Test     Run unit tests before assembling.
.EXAMPLE   powershell -ExecutionPolicy Bypass -File scripts\build-android.ps1 -Test
#>
param([switch]$Release, [switch]$Test)
. "$PSScriptRoot\common.ps1"
Use-LocalCaches
$android = Join-Path $Root 'apps\android'
Set-Location $android

if (-not (Test-Path 'local.properties')) {
  $sdk = Get-AndroidSdk
  if (-not $sdk) { throw 'Android SDK not found. Install Android Studio or set ANDROID_HOME.' }
  "sdk.dir=$($sdk -replace '\\','/')" | Set-Content 'local.properties' -Encoding ascii
  Write-Ok "Created local.properties ($sdk)"
}
if (-not (Test-Path 'secrets.properties')) { Write-Warn2 'secrets.properties missing - building without Google keys (login/maps show "not configured").' }

if ($Test) { Write-Step 'Unit tests'; Invoke-Checked 'testDebugUnitTest' { .\gradlew.bat testDebugUnitTest --console=plain } }
$task = if ($Release) { 'assembleRelease' } else { 'assembleDebug' }
Write-Step "gradlew.bat $task"
Invoke-Checked $task { .\gradlew.bat $task --console=plain }
$variant = if ($Release) { 'release' } else { 'debug' }
$apk = Get-ChildItem (Join-Path $android "app\build\outputs\apk\$variant") -Filter *.apk | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Ok "APK: $($apk.FullName) ($([math]::Round($apk.Length/1MB,1)) MB)"
Write-Host "  Install on a connected device/emulator:  adb install -r `"$($apk.FullName)`""

# Real phone: the debug app can point to this PC's API at runtime (Profil > "Alamat server").
$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -ExpandProperty IPAddress
if (-not $Release -and $ips) {
  Write-Host ''
  Write-Host '  Testing on a real phone (same Wi-Fi as this PC):' -ForegroundColor Cyan
  Write-Host "    1. Start the API:  powershell -ExecutionPolicy Bypass -File scripts\dev-windows.ps1 -Only api"
  Write-Host "    2. In the app: Profil > Alamat server > enter one of: $($ips -join ', ')  > Tes & simpan"
  Write-Host '    3. If the test fails, allow port 4000 in Windows Firewall (run PowerShell as Administrator):'
  Write-Host "       New-NetFirewallRule -DisplayName 'MAM API 4000' -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Private"
  Write-Host '    Emulator: no change needed (10.0.2.2 = this PC).'
}
