$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "Starting ASTERGRID development servers..." -ForegroundColor Cyan

Start-Process -FilePath 'powershell' -ArgumentList @(
    '-NoExit',
    '-Command',
    "Set-Location '$root\backend'; uv run python -m uvicorn astergrid.main:app --reload --port 8000"
)

Start-Sleep -Seconds 2

Start-Process -FilePath 'powershell' -ArgumentList @(
    '-NoExit',
    '-Command',
    "Set-Location '$root\frontend'; npm run dev"
)

Write-Host "Backend:  http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "Frontend: http://127.0.0.1:5173" -ForegroundColor Green
Write-Host "Close the two spawned terminals to stop the servers."
