param(
    [switch]$Shutdown
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir '..'))
$RuntimeDir = Join-Path $RepoRoot '.launcher_runtime'
$LauncherRuntimeDir = Join-Path $ScriptDir 'runtime'
$EmbeddedNodeDir = Join-Path $LauncherRuntimeDir 'node'
$EmbeddedNodePath = Join-Path $EmbeddedNodeDir 'node.exe'
$ConfigPath = Join-Path $ScriptDir 'launcher.config.json'
$ServerScriptPath = Join-Path $ScriptDir 'cambrian_static_server.js'
$SessionPath = Join-Path $RuntimeDir 'session.json'
$LockPath = Join-Path $RuntimeDir 'launch.lock'
$LauncherLogPath = Join-Path $RuntimeDir 'launcher.log'
$ServerStdoutPath = Join-Path $RuntimeDir 'server.stdout.log'
$ServerStderrPath = Join-Path $RuntimeDir 'server.stderr.log'
$BrowserProfilePath = Join-Path $RuntimeDir 'browser-profile'
$ProgramFilesX86 = [Environment]::GetFolderPath('ProgramFilesX86')

function Get-LauncherText([string]$Key) {
    switch ($Key) {
        'Closed' { return ([string]([char]0x5DF2) + [char]0x5173 + [char]0x95ED) }
        'NotFound' { return ([string]([char]0x672A) + [char]0x627E + [char]0x5230 + [char]0x8FD0 + [char]0x884C + [char]0x5B9E + [char]0x4F8B) }
        'Cleaned' { return ([string]([char]0x5DF2) + [char]0x6E05 + [char]0x7406 + [char]0x6B8B + [char]0x7559) }
        default { return $Key }
    }
}

function Ensure-Directory([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Append-Utf8Line([string]$Path, [string]$Line) {
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::AppendAllText($Path, $Line + [Environment]::NewLine, $utf8NoBom)
}

function Write-LauncherLog([string]$Message) {
    Ensure-Directory -Path $RuntimeDir
    $timestamp = [DateTimeOffset]::Now.ToString('o')
    Append-Utf8Line -Path $LauncherLogPath -Line "[$timestamp] $Message"
}

function Read-Utf8Text([string]$Path) {
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    return [System.Text.Encoding]::UTF8.GetString($bytes)
}

function Read-JsonFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }

    $text = Read-Utf8Text -Path $Path
    if ($text.Length -gt 0 -and [int][char]$text[0] -eq 0xFEFF) {
        $text = $text.Substring(1)
    }

    if ([string]::IsNullOrWhiteSpace($text)) {
        return $null
    }

    return $text | ConvertFrom-Json
}

function Write-JsonFile([string]$Path, $Value) {
    $json = $Value | ConvertTo-Json -Depth 10
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

function Remove-PathIfExists([string]$Path) {
    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
        return $true
    }

    return $false
}

function Test-ProcessExists([Nullable[int]]$ProcessId) {
    if ($null -eq $ProcessId -or $ProcessId -le 0) {
        return $false
    }

    try {
        Get-Process -Id $ProcessId -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Stop-ProcessIfRunning([Nullable[int]]$ProcessId) {
    if (-not (Test-ProcessExists -ProcessId $ProcessId)) {
        return $false
    }

    Stop-Process -Id $ProcessId -Force -ErrorAction Stop
    return $true
}

function Cleanup-Residue() {
    $cleanedAnything = $false
    foreach ($path in @($SessionPath, $LockPath, $BrowserProfilePath)) {
        if (Remove-PathIfExists -Path $path) {
            $cleanedAnything = $true
        }
    }

    return $cleanedAnything
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

function Resolve-NodeRuntime() {
    if (Test-Path -LiteralPath $EmbeddedNodePath -PathType Leaf) {
        return [pscustomobject]@{
            Path = $EmbeddedNodePath
            Source = 'embedded'
        }
    }

    $systemNodePath = Resolve-SystemNodePath
    if (-not [string]::IsNullOrWhiteSpace($systemNodePath)) {
        Write-LauncherLog "Embedded runtime missing at $EmbeddedNodePath. Falling back to development Node: $systemNodePath"
        return [pscustomobject]@{
            Path = $systemNodePath
            Source = 'system-fallback'
        }
    }

    throw "Launcher runtime is incomplete: embedded runtime is missing at $EmbeddedNodePath and no development fallback node executable is available."
}

function Resolve-BrowserExecutable([string]$PreferredBrowser) {
    $candidates = @{
        edge = @(
            (Join-Path $ProgramFilesX86 'Microsoft\Edge\Application\msedge.exe'),
            (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
        )
        chrome = @(
            (Join-Path $ProgramFilesX86 'Google\Chrome\Application\chrome.exe'),
            (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
            (Join-Path $env:LocalAppData 'Google\Chrome\Application\chrome.exe')
        )
    }

    $searchOrder = switch ($PreferredBrowser.ToLowerInvariant()) {
        'edge' { @('edge') }
        'chrome' { @('chrome') }
        default { @('edge', 'chrome') }
    }

    foreach ($browserName in $searchOrder) {
        $commandName = if ($browserName -eq 'edge') { 'msedge.exe' } else { 'chrome.exe' }
        $command = Get-Command $commandName -ErrorAction SilentlyContinue
        if ($null -ne $command -and (Test-Path -LiteralPath $command.Source -PathType Leaf)) {
            return [pscustomobject]@{
                Name = $browserName
                Path = $command.Source
            }
        }

        foreach ($candidate in $candidates[$browserName]) {
            if ([string]::IsNullOrWhiteSpace($candidate)) {
                continue
            }

            if (Test-Path -LiteralPath $candidate -PathType Leaf) {
                return [pscustomobject]@{
                    Name = $browserName
                    Path = $candidate
                }
            }
        }
    }

    return $null
}

function Wait-ForPort([string]$BindHost, [int]$Port, [int]$TimeoutMs, [Nullable[int]]$ServerPid) {
    $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($null -ne $ServerPid -and -not (Test-ProcessExists -ProcessId $ServerPid)) {
            return $false
        }

        $client = New-Object System.Net.Sockets.TcpClient
        try {
            $async = $client.BeginConnect($BindHost, $Port, $null, $null)
            if ($async.AsyncWaitHandle.WaitOne(250) -and $client.Connected) {
                $client.EndConnect($async)
                return $true
            }
        } catch {
        } finally {
            $client.Close()
        }

        Start-Sleep -Milliseconds 250
    }

    return $false
}

function Read-LauncherConfig() {
    if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
        throw "Missing launcher config file: $ConfigPath"
    }

    $config = Read-JsonFile -Path $ConfigPath
    if ($null -eq $config) {
        throw 'Launcher config is empty or invalid JSON.'
    }

    $port = [int]$config.port
    if ($port -le 0 -or $port -ge 65536) {
        throw 'launcher.config.json contains an invalid port.'
    }

    $entryPage = [string]$config.entryPage
    if ([string]::IsNullOrWhiteSpace($entryPage)) {
        $entryPage = 'index.html'
    }
    $entryPage = $entryPage.TrimStart('/')

    $preferredBrowser = [string]$config.preferredBrowser
    if ([string]::IsNullOrWhiteSpace($preferredBrowser)) {
        $preferredBrowser = 'auto'
    }

    $windowMode = [string]$config.windowMode
    if ([string]::IsNullOrWhiteSpace($windowMode)) {
        $windowMode = 'app'
    }

    return [pscustomobject]@{
        Port = $port
        EntryPage = $entryPage
        PreferredBrowser = $preferredBrowser.ToLowerInvariant()
        WindowMode = $windowMode.ToLowerInvariant()
    }
}

function Start-StaticServer([string]$NodePath, [int]$Port) {
    Remove-PathIfExists -Path $ServerStdoutPath | Out-Null
    Remove-PathIfExists -Path $ServerStderrPath | Out-Null

    return Start-Process -FilePath $NodePath `
        -ArgumentList @($ServerScriptPath, '--host', '127.0.0.1', '--port', "$Port", '--root', $RepoRoot) `
        -WorkingDirectory $RepoRoot `
        -WindowStyle Hidden `
        -PassThru `
        -RedirectStandardOutput $ServerStdoutPath `
        -RedirectStandardError $ServerStderrPath
}

function Start-BrowserSession([string]$Url, $Config) {
    $browser = Resolve-BrowserExecutable -PreferredBrowser $Config.PreferredBrowser

    if ($Config.WindowMode -eq 'app' -and $null -ne $browser) {
        Remove-PathIfExists -Path $BrowserProfilePath | Out-Null
        Ensure-Directory -Path $BrowserProfilePath

        $browserProcess = Start-Process -FilePath $browser.Path `
            -ArgumentList @(
                '--no-first-run',
                '--no-default-browser-check',
                "--user-data-dir=$BrowserProfilePath",
                '--new-window',
                "--app=$Url"
            ) `
            -WorkingDirectory $RepoRoot `
            -PassThru

        return [pscustomobject]@{
            Mode = "$($browser.Name)-app"
            BrowserName = $browser.Name
            Process = $browserProcess
            Trackable = $true
            ProfileDir = $BrowserProfilePath
        }
    }

    if ($Config.WindowMode -eq 'tab' -and $null -ne $browser) {
        $browserProcess = Start-Process -FilePath $browser.Path `
            -ArgumentList @('--new-window', $Url) `
            -WorkingDirectory $RepoRoot `
            -PassThru

        return [pscustomobject]@{
            Mode = "$($browser.Name)-tab"
            BrowserName = $browser.Name
            Process = $browserProcess
            Trackable = $false
            ProfileDir = $null
        }
    }

    Start-Process $Url | Out-Null

    return [pscustomobject]@{
        Mode = 'fallback-default'
        BrowserName = 'default'
        Process = $null
        Trackable = $false
        ProfileDir = $null
    }
}

function Invoke-Shutdown() {
    Ensure-Directory -Path $RuntimeDir

    $session = Read-JsonFile -Path $SessionPath
    $serverStopped = $false
    $launcherStopped = $false
    $browserStopped = $false
    $residueCleaned = $false

    if ($null -ne $session) {
        Write-LauncherLog "Shutdown requested for session at $($session.url)"

        if ($session.PSObject.Properties.Name -contains 'browserTracked' -and $session.browserTracked -and ($session.PSObject.Properties.Name -contains 'browserPid')) {
            $browserPid = [int]$session.browserPid
            if ($browserPid -ne $PID) {
                $browserStopped = Stop-ProcessIfRunning -ProcessId $browserPid
            }
        }

        if ($session.PSObject.Properties.Name -contains 'serverPid') {
            $serverStopped = Stop-ProcessIfRunning -ProcessId ([int]$session.serverPid)
        }

        if ($session.PSObject.Properties.Name -contains 'launcherPid') {
            $launcherPid = [int]$session.launcherPid
            if ($launcherPid -ne $PID) {
                $launcherStopped = Stop-ProcessIfRunning -ProcessId $launcherPid
            }
        }
    }

    $residueCleaned = Cleanup-Residue

    if ($serverStopped -or $launcherStopped -or $browserStopped) {
        Write-LauncherLog 'Shutdown completed and tracked processes were stopped.'
        Write-Host (Get-LauncherText -Key 'Closed')
        return
    }

    if ($null -ne $session -or $residueCleaned) {
        Write-LauncherLog 'Shutdown completed by cleaning stale residue only.'
        Write-Host (Get-LauncherText -Key 'Cleaned')
        return
    }

    Write-LauncherLog 'Shutdown requested but no tracked launcher session was found.'
    Write-Host (Get-LauncherText -Key 'NotFound')
}

if ($Shutdown) {
    Invoke-Shutdown
    exit 0
}

$serverProcess = $null
$sessionActive = $false

try {
    Ensure-Directory -Path $RuntimeDir
    Write-LauncherLog "Launcher boot requested from $ScriptDir"

    $existingSession = Read-JsonFile -Path $SessionPath
    if ($null -ne $existingSession) {
        if ($existingSession.PSObject.Properties.Name -contains 'serverPid' -and (Test-ProcessExists -ProcessId ([int]$existingSession.serverPid))) {
            throw 'An existing launcher session is still running. Use shutdown first.'
        }

        Write-LauncherLog 'Found stale launcher session metadata. Cleaning residue before restart.'
        Cleanup-Residue | Out-Null
    }

    $lockStartedAt = [DateTimeOffset]::Now.ToString('o')
    $lockText = "launcherPid=$PID`nstartedAt=$lockStartedAt"
    [System.IO.File]::WriteAllText($LockPath, $lockText)

    $nodeRuntime = Resolve-NodeRuntime
    Write-LauncherLog "Resolved Node runtime source=$($nodeRuntime.Source) path=$($nodeRuntime.Path)"

    $config = Read-LauncherConfig
    $serverProcess = Start-StaticServer -NodePath $nodeRuntime.Path -Port $config.Port
    Write-LauncherLog "Static server process started with pid=$($serverProcess.Id)"

    if (-not (Wait-ForPort -BindHost '127.0.0.1' -Port $config.Port -TimeoutMs 15000 -ServerPid $serverProcess.Id)) {
        $stderrPreview = ''
        if (Test-Path -LiteralPath $ServerStderrPath -PathType Leaf) {
            $stderrPreview = Read-Utf8Text -Path $ServerStderrPath
        }

        Stop-ProcessIfRunning -ProcessId $serverProcess.Id | Out-Null
        Cleanup-Residue | Out-Null
        Write-LauncherLog "Static server failed to start. stderr=$stderrPreview"

        if ([string]::IsNullOrWhiteSpace($stderrPreview)) {
            throw "Static server failed to start. See $ServerStderrPath"
        }

        throw "Static server failed to start: $stderrPreview"
    }

    $url = "http://127.0.0.1:$($config.Port)/$($config.EntryPage)"
    $browserSession = Start-BrowserSession -Url $url -Config $config

    $browserPid = $null
    if ($null -ne $browserSession.Process) {
        $browserPid = $browserSession.Process.Id
    }

    $session = [pscustomobject]@{
        serverPid = $serverProcess.Id
        launcherPid = $PID
        port = $config.Port
        startedAt = [DateTimeOffset]::Now.ToString('o')
        browserMode = $browserSession.Mode
        browserName = $browserSession.BrowserName
        browserTracked = $browserSession.Trackable
        browserPid = $browserPid
        entryPage = $config.EntryPage
        url = $url
        nodeRuntimeSource = $nodeRuntime.Source
        nodePath = $nodeRuntime.Path
    }

    Write-JsonFile -Path $SessionPath -Value $session
    $sessionActive = $true
    Remove-PathIfExists -Path $LockPath | Out-Null

    Write-LauncherLog "Launch ready at $url using browserMode=$($browserSession.Mode)"
    Write-Host "Launch ready: $url"
    Write-Host "browserMode=$($browserSession.Mode)"

    if ($browserSession.Trackable -and $null -ne $browserSession.Process) {
        Write-Host 'Tracked app window mode is active. Closing that window will stop this server.'
        Wait-Process -Id $browserSession.Process.Id

        Stop-ProcessIfRunning -ProcessId $serverProcess.Id | Out-Null
        Cleanup-Residue | Out-Null
        $sessionActive = $false
        Write-LauncherLog 'Tracked app window closed. Server stopped and runtime residue cleaned.'
        Write-Host 'Tracked app window closed. The server has been stopped.'
        exit 0
    }

    Write-LauncherLog 'Current browser mode is not trackable. Manual shutdown may be required.'
    Write-Host 'Current browser mode is not trackable. Use the shutdown bat file to stop the server.'
    exit 0
} catch {
    if ($null -ne $serverProcess) {
        Stop-ProcessIfRunning -ProcessId $serverProcess.Id | Out-Null
    }

    if (-not $sessionActive) {
        Cleanup-Residue | Out-Null
    }

    Write-LauncherLog "Launcher failed: $($_.Exception.Message)"
    Write-Error $_
    exit 1
}
