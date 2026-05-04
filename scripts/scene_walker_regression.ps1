$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

try {
  $cases = @(
    @{
      Name = 'clinic'
      Report = '.\qa\scene_walker\clinic.json'
      Args = @('./src/engine/debug/scene_walker.js', '--preset=clinic', '--entry=bayport_clinic', '--report=./qa/scene_walker/clinic.json')
    },
    @{
      Name = 'gov'
      Report = '.\qa\scene_walker\gov.json'
      Args = @('./src/engine/debug/scene_walker.js', '--preset=gov', '--entry=gov_hall_entry_split', '--report=./qa/scene_walker/gov.json')
    },
    @{
      Name = 'missing'
      Report = '.\qa\scene_walker\missing.json'
      Args = @('./src/engine/debug/scene_walker.js', '--entry=missing_map', '--report=./qa/scene_walker/missing.json')
    }
  )

  $parsedReports = @{}
  $summaryRows = @()

  foreach ($case in $cases) {
    & node @($case.Args)
    if ($LASTEXITCODE -ne 0) {
      throw "scene_walker run failed: $($case.Name)"
    }

    $report = Get-Content $case.Report -Raw | ConvertFrom-Json
    $parsedReports[$case.Name] = $report

    $saveLoadChecks = @($report.saveLoadChecks)
    $saveLoadAllOk = ($saveLoadChecks.Count -eq 0) -or (@($saveLoadChecks | Where-Object { -not $_.ok }).Count -eq 0)

    $summaryRows += [pscustomobject]@{
      Name = $case.Name
      JsonParseable = $true
      SaveLoadChecks = $saveLoadChecks.Count
      SaveLoadAllOk = $saveLoadAllOk
      TransitionFailures = @($report.transitionFailures).Count
      NoopActions = @($report.noopActions).Count
      TimeTruncations = @($report.timeTruncations).Count
      FatalErrors = @($report.fatalErrors).Count
    }
  }

  $clinic = $parsedReports['clinic']
  $gov = $parsedReports['gov']

  $failures = @()

  if (@($clinic.saveLoadChecks | Where-Object { -not $_.ok }).Count -ne 0) {
    $failures += 'clinic saveLoadChecks contains ok=false'
  }
  if (@($gov.saveLoadChecks | Where-Object { -not $_.ok }).Count -ne 0) {
    $failures += 'gov saveLoadChecks contains ok=false'
  }
  if (@($clinic.transitionFailures).Count -ne 0) {
    $failures += 'clinic transitionFailures is not empty'
  }
  if (@($clinic.noopActions).Count -ne 0) {
    $failures += 'clinic noopActions is not empty'
  }
  if (@($clinic.timeTruncations).Count -ne 0) {
    $failures += 'clinic timeTruncations is not empty'
  }

  Write-Host '[scene_walker_regression] summary'
  $summaryRows | Format-Table -AutoSize | Out-String -Width 220 | Write-Host

  if ($failures.Count -gt 0) {
    Write-Host '[scene_walker_regression] failures'
    $failures | ForEach-Object { Write-Host "- $_" }
    exit 1
  }

  Write-Host '[scene_walker_regression] PASS'
}
finally {
  Pop-Location
}