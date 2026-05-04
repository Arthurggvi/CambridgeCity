param(
    [string]$OutputDir = (Join-Path ([System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..')) ) 'dist\launcher_bundle')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir '..'))
$LauncherDir = Join-Path $RepoRoot 'launcher'
$EmbeddedNodeDir = Join-Path $LauncherDir 'runtime\node'
$EmbeddedNodePath = Join-Path $EmbeddedNodeDir 'node.exe'

function New-DirectoryIfMissing([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Resolve-SystemNodePath() {
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        $command = Get-Command node -ErrorAction SilentlyContinue
    }

    if ($null -eq $command) {
        return $null
    }

    return $command.Source
}

function Initialize-EmbeddedRuntime() {
    if (Test-Path -LiteralPath $EmbeddedNodePath -PathType Leaf) {
        return $EmbeddedNodePath
    }

    $systemNodePath = Resolve-SystemNodePath
    if ([string]::IsNullOrWhiteSpace($systemNodePath)) {
        throw "Cannot build launcher bundle because embedded runtime is missing at $EmbeddedNodePath and no local node.exe is available to seed it."
    }

    New-DirectoryIfMissing -Path $EmbeddedNodeDir
    Copy-Item -LiteralPath $systemNodePath -Destination $EmbeddedNodePath -Force
    return $EmbeddedNodePath
}

function Copy-FileIntoBundle([string]$RelativePath) {
    $sourcePath = Join-Path $RepoRoot $RelativePath
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        return
    }

    $destinationPath = Join-Path $OutputDir $RelativePath
    $destinationParent = Split-Path -Parent $destinationPath
    New-DirectoryIfMissing -Path $destinationParent
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
}

function Copy-DirectoryIntoBundle([string]$RelativePath) {
    $sourcePath = Join-Path $RepoRoot $RelativePath
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Container)) {
        return
    }

    $destinationPath = Join-Path $OutputDir $RelativePath
    if (Test-Path -LiteralPath $destinationPath) {
        Remove-Item -LiteralPath $destinationPath -Recurse -Force
    }

    $destinationParent = Split-Path -Parent $destinationPath
    New-DirectoryIfMissing -Path $destinationParent
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Recurse -Force
}

$null = Initialize-EmbeddedRuntime

if (Test-Path -LiteralPath $OutputDir) {
    Remove-Item -LiteralPath $OutputDir -Recurse -Force
}
New-DirectoryIfMissing -Path $OutputDir

foreach ($relativeFile in @(
    'index.html',
    'style.css',
    'README_PLAY.txt'
)) {
    Copy-FileIntoBundle -RelativePath $relativeFile
}

Get-ChildItem -LiteralPath $RepoRoot -File -Filter '*.bat' | ForEach-Object {
    Copy-FileIntoBundle -RelativePath $_.Name
}

foreach ($relativeDirectory in @(
    'assets',
    'data',
    'src',
    'picture',
    'launcher'
)) {
    Copy-DirectoryIntoBundle -RelativePath $relativeDirectory
}

Write-Host "Launcher bundle created: $OutputDir"
Write-Host "Embedded runtime: $(Join-Path $OutputDir 'launcher\runtime\node\node.exe')"