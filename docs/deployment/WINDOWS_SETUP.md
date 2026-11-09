# Windows 10/11 Development Setup

## Requirements

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 20.11 (22 LTS recommended) | https://nodejs.org |
| Git | any recent | |
| Java JDK | 17 (Temurin) | Android only; set `JAVA_HOME` |
| Android SDK | platform 35, build-tools 34+ | via Android Studio; `ANDROID_HOME` or default `%LOCALAPPDATA%\Android\Sdk` |
| Docker Desktop | optional | otherwise use `-PortablePostgres` |
| Free disk | ≥ 5 GB on the drive holding caches | see "C: drive full" below |

## Setup

```powershell
git clone <repo> D:\mam ; cd D:\mam
powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1                 # Docker Desktop running
powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1 -PortablePostgres   # no Docker
```

The script checks tools, creates `apps\api\.env` with random secrets (asks before overwriting an existing file),
runs `npm ci`, builds shared packages, generates the Prisma client, starts PostgreSQL (+ Redis with Docker), applies
migrations, seeds categories and demo accounts, and prepares `apps\android\local.properties` / `secrets.properties`.

`-PortablePostgres` downloads PostgreSQL 17 (EDB binaries) + PostGIS 3.6 (OSGeo bundle) into `.devtools\`, initializes
a cluster in `.devtools\pgdata`, and runs it on **port 5433** with localhost-only trust auth (development only).
Redis is optional locally (the API falls back to an in-memory cache).

## Daily use

```powershell
scripts\dev-windows.ps1                      # API + web + admin, one window each
scripts\dev-windows.ps1 -Only api,web
scripts\test-windows.ps1 [-E2E] [-Skip android]
scripts\build-android.ps1 [-Test] [-Release]
scripts\build-web.ps1
cd apps\android ; .\gradlew.bat assembleDebug
```

Stop the portable database: `.devtools\pgsql\bin\pg_ctl.exe -D .devtools\pgdata stop`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `running scripts is disabled on this system` | Use `powershell -ExecutionPolicy Bypass -File …` or `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| Script parse errors like `Unexpected token` in PowerShell 5.1 | Files must be ASCII/UTF-8-BOM. Our scripts are ASCII; re-save edited scripts as "UTF-8 with BOM" |
| `curl: (23) Failure writing output` / npm `ENOSPC` / Gradle `There is not enough space on the disk` | System drive full. The scripts redirect npm cache, TEMP and `GRADLE_USER_HOME` to `.devtools` when C: has < 5 GB free. Free space or move caches permanently: `setx GRADLE_USER_HOME D:\gradle-home`, `npm config set cache D:\npm-cache` |
| Gradle: `Could not reserve enough space for object heap` / `The paging file is too small` | Not enough commit memory (page file is on a full drive or many JVMs running). Stop stray daemons: `gradlew.bat --stop` (with the same `GRADLE_USER_HOME`), close other Java apps (the VS Code Java extension spawns Gradle daemons), free C: so Windows can grow the page file. `gradle.properties` already uses a 1.25 GB heap, SerialGC and in-process Kotlin compilation |
| Gradle: `Could not move temporary workspace … to immutable location` | Antivirus/indexer locking files. Re-run (usually transient), exclude `.devtools\gradle-home` and `apps\android\build` from Defender real-time scanning, or exclude `.devtools` from the editor's file watcher |
| `local.properties`: `The filename, directory name, or volume label syntax is incorrect` | Backslashes are escape characters in `.properties`. Use `sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk` |
| `SDK location not found` | Install Android SDK platform 35 or set `ANDROID_HOME`; re-run `scripts\build-android.ps1` (creates `local.properties`) |
| Android emulator can't reach API | Use `http://10.0.2.2:4000/api/v1/` (default); physical device: PC's LAN IP + allow port 4000 in Windows Firewall |
| Prisma `P1001 Can't reach database server` | Start DB: `scripts\dev-windows.ps1` or `docker compose up -d postgres` |
| `prisma migrate reset` refused when run by an AI agent | Expected safety guard — reset the dev DB yourself or create a new database |
| `type "geography" does not exist` | PostGIS not installed in the cluster; use the `postgis/postgis` image or the portable bundle |
| Port 5432/5433/3000/3001/4000 in use | `netstat -ano | findstr :4000` then `taskkill /PID <pid> /F`, or change `PORT` |
| `sharp` install errors | Delete `node_modules\sharp` and run `npm ci` again (prebuilt Windows binaries are downloaded) |
| Login button disabled / "belum dikonfigurasi" | Set Google OAuth vars in `apps\api\.env`; for local testing use `DEV_LOGIN_ENABLED=true` |
| Map is grey / no tiles | The OpenStreetMap tile server needs internet access; check proxy/firewall, or set `NEXT_PUBLIC_MAP_TILE_URL` |
| Discovery shows no places | Load OpenStreetMap data: `powershell -ExecutionPolicy Bypass -File scripts\import-osm.ps1` |
| `import-osm.ps1`: "No module named osmium" | The script installs pyosmium into `.devtools\pylib`; needs Python 3 and internet. Re-run the script |
| Long path errors in `node_modules` | `git config --system core.longpaths true` and enable Win32 long paths (gpedit or registry `LongPathsEnabled=1`) |
| CRLF warnings | `git config core.autocrlf true`; `gradlew` must keep LF in CI (handled by `chmod +x` step) |
