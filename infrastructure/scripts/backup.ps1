<#
.SYNOPSIS  PostgreSQL backup for Windows hosts (pg_dump must be on PATH or pass -PgBin).
.EXAMPLE   .\backup.ps1 -DatabaseUrl "postgresql://mam:pw@localhost:5432/mam" -BackupDir D:\backups\mam
#>
param(
  [Parameter(Mandatory)] [string] $DatabaseUrl,
  [string] $BackupDir = ".\backups",
  [int] $RetentionDays = 14,
  [string] $PgBin = ""
)
$ErrorActionPreference = 'Stop'
$pgDump = if ($PgBin) { Join-Path $PgBin 'pg_dump.exe' } else { 'pg_dump' }
$pgRestore = if ($PgBin) { Join-Path $PgBin 'pg_restore.exe' } else { 'pg_restore' }
New-Item -ItemType Directory -Force $BackupDir | Out-Null
$url = $DatabaseUrl -replace '[?&](schema|connection_limit)=[^&]*', ''
$file = Join-Path $BackupDir ("mam-{0}.dump" -f (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ'))
& $pgDump --format=custom --compress=9 --no-owner --no-privileges "--file=$file" $url
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed ($LASTEXITCODE)" }
& $pgRestore --list $file | Out-Null
(Get-FileHash $file -Algorithm SHA256).Hash | Out-File "$file.sha256" -Encoding ascii
Get-ChildItem $BackupDir -Filter 'mam-*.dump*' | Where-Object LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) | Remove-Item -Confirm:$false
Write-Host "Backup written: $file"
