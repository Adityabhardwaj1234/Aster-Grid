param(
    [int]$Port = 0
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if ($Port -le 0) {
    $Port = if ($env:ASTERGRID_E2E_PORT) { [int]$env:ASTERGRID_E2E_PORT } else { 8127 }
}

$frontendDist = Join-Path $root 'frontend\dist'
$indexFile = Join-Path $frontendDist 'index.html'
if (-not (Test-Path $indexFile)) {
    throw "Frontend production build not found at $indexFile. Run 'npm run build' in frontend first."
}

# Keep E2E state isolated from the developer database and from other checkouts.
$resolvedRoot = (Resolve-Path $root).Path.ToLowerInvariant()
$sha = [System.Security.Cryptography.SHA256]::Create()
try {
    $digest = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($resolvedRoot))
}
finally {
    $sha.Dispose()
}
$rootKey = -join ($digest[0..5] | ForEach-Object { $_.ToString('x2') })
# Canonicalize the temp root: some environments expose an 8.3 short path
# (C:\Users\NAME~1\...), which Windows PowerShell cannot reliably delete.
$tempBase = if ($env:TEMP -and (Test-Path -LiteralPath $env:TEMP)) {
    (Get-Item -LiteralPath $env:TEMP).FullName
} else {
    [System.IO.Path]::GetTempPath()
}
$dataDir = Join-Path $tempBase "astergrid-e2e-$rootKey-$Port"

if (Test-Path $dataDir) {
    Remove-Item -Recurse -Force -LiteralPath $dataDir
}
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

$env:PYTHONPATH = Join-Path $root 'backend\src'
$env:ASTERGRID_DATA_DIR = $dataDir
$env:ASTERGRID_FRONTEND_DIR = $frontendDist
$env:ASTERGRID_HOST = '127.0.0.1'
$env:ASTERGRID_PORT = [string]$Port
$env:ASTERGRID_EXECUTION_MODE = 'deterministic'
$env:ASTERGRID_MAX_REVISIONS = '2'
$env:ASTERGRID_RUN_TIMEOUT_SECONDS = '90'
$env:ASTERGRID_RUNS_RETENTION = '10'
Remove-Item Env:GEMINI_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:GOOGLE_API_KEY -ErrorAction SilentlyContinue

Write-Host "ASTERGRID E2E server" -ForegroundColor Cyan
Write-Host "  root:      $root"
Write-Host "  frontend:  $frontendDist"
Write-Host "  data:      $dataDir"
Write-Host "  address:   http://127.0.0.1:$Port"

Set-Location (Join-Path $root 'backend')
& python -m uvicorn astergrid.main:app --host 127.0.0.1 --port $Port --log-level warning
exit $LASTEXITCODE
