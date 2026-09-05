# f1gures fantasy — local PocketBase dev server (Windows)
#
# Downloads the pinned PocketBase release, extracts it to ./bin (gitignored),
# upserts a dev superuser, and serves with the committed pb_migrations/ and
# pb_hooks/ directories.
#
#   .\dev.ps1                 # download (if needed) + serve on :8090
#   .\dev.ps1 -Reset          # wipe pb_data first (fresh migrate)
#   .\dev.ps1 -NoServe        # download + migrate + superuser, then exit
#
# Pinned release:
#   PocketBase v0.40.1 (2026-08-24)
#   https://github.com/pocketbase/pocketbase/releases/download/v0.40.1/pocketbase_0.40.1_windows_amd64.zip
#
# Bump $PbVersion below to move; keep dev.sh (VPS) and README.md in step.

[CmdletBinding()]
param(
  [switch]$Reset,
  [switch]$NoServe,
  [int]$Port = 8090
)

$ErrorActionPreference = 'Stop'

$PbVersion = '0.40.1'
$Root      = Split-Path -Parent $MyInvocation.MyCommand.Path
$BinDir    = Join-Path $Root 'bin'
$DataDir   = Join-Path $Root 'pb_data'
$MigDir    = Join-Path $Root 'pb_migrations'
$HookDir   = Join-Path $Root 'pb_hooks'
$Exe       = Join-Path $BinDir 'pocketbase.exe'

# Dev-only credentials. Never reuse these anywhere real.
$SuperEmail = if ($env:PB_SUPERUSER_EMAIL)    { $env:PB_SUPERUSER_EMAIL }    else { 'dev@f1gures.local' }
$SuperPass  = if ($env:PB_SUPERUSER_PASSWORD) { $env:PB_SUPERUSER_PASSWORD } else { 'fantasy-dev-1234' }

function Get-PbArch {
  if ([Environment]::Is64BitOperatingSystem) {
    if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { return 'arm64' }
    return 'amd64'
  }
  throw '32-bit Windows is not supported by PocketBase releases.'
}

# ---------------------------------------------------------------- download
if (-not (Test-Path $Exe)) {
  $arch = Get-PbArch
  $zipName = "pocketbase_${PbVersion}_windows_${arch}.zip"
  $url = "https://github.com/pocketbase/pocketbase/releases/download/v$PbVersion/$zipName"
  $tmp = Join-Path ([IO.Path]::GetTempPath()) $zipName

  Write-Host "Downloading PocketBase v$PbVersion ($arch)..." -ForegroundColor Cyan
  Write-Host "  $url"

  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing

  if (-not (Test-Path $BinDir)) { New-Item -ItemType Directory -Path $BinDir | Out-Null }
  Expand-Archive -Path $tmp -DestinationPath $BinDir -Force
  Remove-Item $tmp -Force

  if (-not (Test-Path $Exe)) { throw "Extraction finished but $Exe is missing." }
  Write-Host "Installed to $Exe" -ForegroundColor Green
} else {
  $found = (& $Exe --version) -join ' '
  Write-Host "Using existing binary: $found" -ForegroundColor DarkGray
}

# ------------------------------------------------------------------ reset
if ($Reset -and (Test-Path $DataDir)) {
  Write-Host "Removing $DataDir ..." -ForegroundColor Yellow
  Remove-Item -Recurse -Force $DataDir
}

# Shared flags. Absolute paths matter: PocketBase resolves relative dirs
# against the *executable* location, which is ./bin here.
$Common = @(
  '--dir',           $DataDir,
  '--migrationsDir', $MigDir,
  '--hooksDir',      $HookDir
)

# ------------------------------------------------------- migrate + admin
Write-Host 'Applying migrations...' -ForegroundColor Cyan
& $Exe migrate up @Common
if ($LASTEXITCODE -ne 0) { throw "migrate up failed ($LASTEXITCODE)" }

Write-Host "Upserting dev superuser $SuperEmail ..." -ForegroundColor Cyan
& $Exe superuser upsert $SuperEmail $SuperPass @Common
if ($LASTEXITCODE -ne 0) { throw "superuser upsert failed ($LASTEXITCODE)" }

if ($NoServe) {
  Write-Host 'Done (--NoServe).' -ForegroundColor Green
  exit 0
}

# ------------------------------------------------------------------ serve
Write-Host ''
Write-Host "PocketBase  http://127.0.0.1:$Port/"           -ForegroundColor Green
Write-Host "Dashboard   http://127.0.0.1:$Port/_/"         -ForegroundColor Green
Write-Host "Superuser   $SuperEmail / $SuperPass"          -ForegroundColor DarkGray
Write-Host "Seed data   node seed-dev.mjs"                 -ForegroundColor DarkGray
Write-Host ''

& $Exe serve --http "127.0.0.1:$Port" @Common
