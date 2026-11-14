param(
    [switch]$SkipE2E
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Invoke-Step {
    param(
        [string]$Name,
        [string]$Directory,
        [scriptblock]$Action
    )
    Write-Host ""
    Write-Host "==> $Name" -ForegroundColor Cyan
    Push-Location $Directory
    try {
        & $Action
        if ($LASTEXITCODE -ne 0) {
            throw "$Name failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

Write-Host "ASTERGRID production verification" -ForegroundColor White
Write-Host "Repository: $root"

# --- Secret and repository hygiene -----------------------------------------
Write-Host ""
Write-Host "==> Repository hygiene" -ForegroundColor Cyan

if (Test-Path '.env') {
    $trackedEnv = git ls-files --error-unmatch .env 2>$null
    if ($LASTEXITCODE -eq 0 -and $trackedEnv) {
        throw ".env is tracked by Git. Remove it before continuing."
    }
}

$secretPattern = '(AIza[0-9A-Za-z_-]{35}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50,}|sk-[A-Za-z0-9]{32,}|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY)'
$secretHits = git grep -nIE $secretPattern -- . ':(exclude)package-lock.json' ':(exclude)uv.lock' 2>$null
if ($LASTEXITCODE -eq 0 -and $secretHits) {
    $secretHits | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    throw "Potential secret material found in tracked files."
}

git diff --check
if ($LASTEXITCODE -ne 0) { throw "Whitespace errors found." }
Write-Host "Hygiene checks passed." -ForegroundColor Green

# --- Backend ---------------------------------------------------------------
if (Test-Path 'backend/pyproject.toml') {
    Invoke-Step -Name "Backend tests" -Directory 'backend' -Action {
        uv run --extra dev python -m pytest -q
    }
    Invoke-Step -Name "Backend lint" -Directory 'backend' -Action {
        uv run --extra dev python -m ruff check .
    }
    Invoke-Step -Name "Backend format" -Directory 'backend' -Action {
        uv run --extra dev python -m ruff format --check .
    }
}
else {
    Write-Host "Backend not scaffolded yet; skipping tests." -ForegroundColor Yellow
}

# --- Frontend --------------------------------------------------------------
if (Test-Path 'frontend/package.json') {
    Invoke-Step -Name "Frontend typecheck" -Directory 'frontend' -Action {
        npm run typecheck
    }
    Invoke-Step -Name "Frontend unit tests" -Directory 'frontend' -Action {
        npm run test -- --run
    }
    Invoke-Step -Name "Frontend production build" -Directory 'frontend' -Action {
        npm run build
    }
    if (-not $SkipE2E -and (Test-Path 'frontend/playwright.config.ts')) {
        Invoke-Step -Name "Browser end-to-end tests" -Directory 'frontend' -Action {
            npx playwright test
        }
    }
}
else {
    Write-Host "Frontend not scaffolded yet; skipping tests." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "All requested checks passed." -ForegroundColor Green
