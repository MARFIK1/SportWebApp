param(
    [int]$DaysAhead = 2,
    [int]$UpdateDaysBack = 1,
    [string]$Python = "python",
    [switch]$SkipScrape,
    [switch]$SkipBuild,
    [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-Step {
    param(
        [string]$Label,
        [string]$FilePath,
        [string[]]$Arguments
    )

    Write-Host ""
    Write-Host "==> $Label"
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}

function Format-Ymd {
    param([datetime]$Date)
    return $Date.ToString("yyyy-MM-dd")
}

$today = (Get-Date).Date

if ($SkipScrape) {
    Write-Host ""
    Write-Host "==> Skipping scrape because -SkipScrape was provided"
} else {
    Invoke-Step "Scrape all competitions" $Python @("SofascoreData/scrape_all.py")
}

for ($i = $UpdateDaysBack; $i -ge 1; $i--) {
    $date = Format-Ymd $today.AddDays(-$i)
    Invoke-Step "Update finished report $date" $Python @("SofascoreData/predict_today.py", $date, "--update")
}

for ($i = 0; $i -le $DaysAhead; $i++) {
    $date = Format-Ymd $today.AddDays($i)
    Invoke-Step "Predict $date" $Python @("SofascoreData/predict_today.py", $date)
}

if ($SkipBuild) {
    Write-Host ""
    Write-Host "==> Skipping production build because -SkipBuild was provided"
} else {
    Invoke-Step "Build production bundle" "npm" @("run", "build:prod")
}

if ($SkipDeploy -or $env:SKIP_VERCEL_DEPLOY -eq "1") {
    Write-Host ""
    Write-Host "==> Skipping Vercel deploy"
} elseif (-not $SkipBuild) {
    Invoke-Step "Deploy to Vercel" "npm" @("run", "deploy:vercel")
}
