param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'stop', 'status')]
  [string]$Action = 'start'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $repositoryRoot 'server\.local'
$dataDirectory = Join-Path $runtimeRoot 'postgres-data'
$logPath = Join-Path $runtimeRoot 'postgres.log'
$port = 55432

$configuredBin = $env:FIRE_SAFETY_PG_BIN
if ($configuredBin) {
  $postgresBin = $configuredBin
} else {
  $initdbCommand = Get-Command 'initdb.exe' -ErrorAction SilentlyContinue
  if ($initdbCommand) {
    $postgresBin = Split-Path -Parent $initdbCommand.Source
  } elseif (Test-Path -LiteralPath 'D:\Applications\PostgreSQL\bin\initdb.exe') {
    $postgresBin = 'D:\Applications\PostgreSQL\bin'
  } else {
    throw 'PostgreSQL binaries were not found. Set FIRE_SAFETY_PG_BIN to the folder containing initdb.exe.'
  }
}

$initdb = Join-Path $postgresBin 'initdb.exe'
$pgCtl = Join-Path $postgresBin 'pg_ctl.exe'
$createdb = Join-Path $postgresBin 'createdb.exe'
$psql = Join-Path $postgresBin 'psql.exe'
foreach ($binary in @($initdb, $pgCtl, $createdb, $psql)) {
  if (-not (Test-Path -LiteralPath $binary)) { throw "Required PostgreSQL binary not found: $binary" }
}

if ($Action -eq 'status') {
  if (-not (Test-Path -LiteralPath $dataDirectory)) {
    Write-Output 'Local Fire Safety PostgreSQL has not been initialized.'
    exit 1
  }
  & $pgCtl status -D $dataDirectory
  exit $LASTEXITCODE
}

if ($Action -eq 'stop') {
  if (-not (Test-Path -LiteralPath $dataDirectory)) {
    Write-Output 'Local Fire Safety PostgreSQL is already absent.'
    exit 0
  }
  & $pgCtl status -D $dataDirectory *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Output 'Local Fire Safety PostgreSQL is already stopped.'
    exit 0
  }
  & $pgCtl stop -D $dataDirectory -m fast
  exit $LASTEXITCODE
}

New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $dataDirectory 'PG_VERSION'))) {
  Write-Output 'Initializing a local-only PostgreSQL cluster for Fire Safety development.'
  & $initdb -D $dataDirectory --username=postgres --auth-local=trust --auth-host=trust --encoding=UTF8 --no-locale
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

& $pgCtl status -D $dataDirectory *> $null
if ($LASTEXITCODE -ne 0) {
  & $pgCtl start -D $dataDirectory -l $logPath -o "-p $port -h 127.0.0.1"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$databaseExists = & $psql -h 127.0.0.1 -p $port -U postgres -d postgres -tAc "select 1 from pg_database where datname = 'fire_safety_p1_test'"
if ($databaseExists -ne '1') {
  & $createdb -h 127.0.0.1 -p $port -U postgres fire_safety_p1_test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Output "Local Fire Safety PostgreSQL is ready on 127.0.0.1:$port (database: fire_safety_p1_test)."
Write-Output 'This trust-authenticated cluster is for local development only and does not listen on external interfaces.'
