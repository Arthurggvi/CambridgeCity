param(
    [Parameter(Mandatory = $false)][string]$BindHost = '127.0.0.1',
    [Parameter(Mandatory = $false)][int]$Port = 5500,
    [Parameter(Mandatory = $false)][string]$Root = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'
$AssetVersion = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString()

function Add-AssetVersionToRelativeSpecifier([string]$Specifier, [string]$Version) {
    if ([string]::IsNullOrWhiteSpace($Specifier)) { return $Specifier }
    if (-not ($Specifier.StartsWith('./') -or $Specifier.StartsWith('../'))) { return $Specifier }
    if ($Specifier -match '(^|[?&])v=') { return $Specifier }
    if ($Specifier.Contains('?')) { return ("{0}&v={1}" -f $Specifier, $Version) }
    return ("{0}?v={1}" -f $Specifier, $Version)
}

function Rewrite-ModuleImports([string]$Text, [string]$Version) {
    if ([string]::IsNullOrEmpty($Text)) { return $Text }

    $patterns = @(
        '(?<prefix>(?:^|\n)\s*import\s*["''])(?<specifier>\.{1,2}/[^"''\r\n]+)(?<suffix>["''])',
        '(?<prefix>\bfrom\s*["''])(?<specifier>\.{1,2}/[^"''\r\n]+)(?<suffix>["''])',
        '(?<prefix>\bimport\s*\(\s*["''])(?<specifier>\.{1,2}/[^"''\r\n]+)(?<suffix>["'']\s*\))'
    )

    $result = $Text
    foreach ($pattern in $patterns) {
        $regex = [regex]::new($pattern, [System.Text.RegularExpressions.RegexOptions]::Multiline)
        $result = $regex.Replace($result, {
            param($match)
            $prefix = $match.Groups['prefix'].Value
            $specifier = $match.Groups['specifier'].Value
            $suffix = $match.Groups['suffix'].Value
            return $prefix + (Add-AssetVersionToRelativeSpecifier $specifier $Version) + $suffix
        })
    }

    return $result
}

function Write-Plain([System.IO.Stream]$Stream, [int]$StatusCode, [string]$StatusText, [byte[]]$Body, [string]$ContentType) {
    $header = "HTTP/1.1 $StatusCode $StatusText`r`n" +
        "Connection: close`r`n" +
        "Cache-Control: no-store`r`n" +
        "Content-Type: $ContentType`r`n" +
        "Content-Length: $($Body.Length)`r`n" +
        "`r`n"

    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    $Stream.Write($Body, 0, $Body.Length)
}

function Write-Text([System.IO.Stream]$Stream, [int]$StatusCode, [string]$StatusText, [string]$Text, [string]$ContentType) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    Write-Plain -Stream $Stream -StatusCode $StatusCode -StatusText $StatusText -Body $bytes -ContentType $ContentType
}

function Get-MimeType([string]$Path) {
    $ext = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
    switch ($ext) {
        '.html' { return 'text/html; charset=utf-8' }
        '.css' { return 'text/css; charset=utf-8' }
        '.js' { return 'text/javascript; charset=utf-8' }
        '.mjs' { return 'text/javascript; charset=utf-8' }
        '.json' { return 'application/json; charset=utf-8' }
        '.txt' { return 'text/plain; charset=utf-8' }
        '.png' { return 'image/png' }
        '.jpg' { return 'image/jpeg' }
        '.jpeg' { return 'image/jpeg' }
        '.gif' { return 'image/gif' }
        '.svg' { return 'image/svg+xml' }
        '.webp' { return 'image/webp' }
        '.ico' { return 'image/x-icon' }
        '.mp3' { return 'audio/mpeg' }
        '.wav' { return 'audio/wav' }
        '.ogg' { return 'audio/ogg' }
        '.mp4' { return 'video/mp4' }
        '.woff' { return 'font/woff' }
        '.woff2' { return 'font/woff2' }
        '.ttf' { return 'font/ttf' }
        '.otf' { return 'font/otf' }
        default { return 'application/octet-stream' }
    }
}

function Should-RewriteModuleImports([string]$Path) {
    $ext = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
    return $ext -eq '.js' -or $ext -eq '.mjs'
}

function Html-Escape([string]$s) {
    return $s.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;').Replace('"', '&quot;')
}

function Build-DirectoryListingHtml([string]$UrlPath, [string]$DirPath) {
    $title = "Directory listing for $UrlPath"
    $entries = Get-ChildItem -LiteralPath $DirPath -Force | Sort-Object @{ Expression = { -not $_.PSIsContainer } }, Name

    $items = New-Object System.Collections.Generic.List[string]
    if ($UrlPath -ne '/') {
        $items.Add('<li><a href="../">../</a></li>')
    }

    foreach ($e in $entries) {
        $name = $e.Name
        $display = if ($e.PSIsContainer) { "$name/" } else { $name }
        $hrefName = [System.Uri]::EscapeDataString($name)
        $href = if ($e.PSIsContainer) { "$hrefName/" } else { $hrefName }
        $items.Add('<li><a href="' + $href + '">' + (Html-Escape $display) + '</a></li>')
    }

    $body = @(
        '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 3.2 Final//EN">',
        '<html>',
        ' <head>',
        "  <title>$(Html-Escape $title)</title>",
        ' </head>',
        ' <body>',
        "  <h1>$(Html-Escape $title)</h1>",
        '  <hr>',
        '  <ul>',
        ($items | ForEach-Object { "   $_" }),
        '  </ul>',
        '  <hr>',
        ' </body>',
        '</html>',
        ''
    ) -join "`n"

    return $body
}

function Try-MapUrlToFsPath([string]$RootAbs, [string]$UrlPath) {
    try {
        $decoded = [System.Uri]::UnescapeDataString($UrlPath)
    } catch {
        return $null
    }

    $clean = $decoded.Split('?')[0].Split('#')[0].TrimStart('/')
    $joined = Join-Path -Path $RootAbs -ChildPath $clean
    $full = [System.IO.Path]::GetFullPath($joined)

    if (-not $full.StartsWith($RootAbs, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $null
    }

    return $full
}

$rootAbs = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Root).Path)

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse($BindHost), $Port)
$listener.Start()

Write-Host "[CambridgeCity] Static server running: http://$BindHost`:$Port/"
Write-Host "[CambridgeCity] Root: $rootAbs"
Write-Host "[CambridgeCity] Asset version: $AssetVersion"
Write-Host "[CambridgeCity] Press Ctrl+C to stop."

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 8192, $true)

            $requestLine = $reader.ReadLine()
            if (-not $requestLine) {
                continue
            }

            # read headers until blank line
            while ($true) {
                $line = $reader.ReadLine()
                if ($null -eq $line -or $line -eq '') { break }
            }

            $parts = $requestLine.Split(' ')
            if ($parts.Length -lt 2) {
                Write-Text -Stream $stream -StatusCode 400 -StatusText 'Bad Request' -Text 'Bad Request' -ContentType 'text/plain; charset=utf-8'
                continue
            }

            $method = $parts[0]
            $urlPath = $parts[1]

            if ($method -ne 'GET' -and $method -ne 'HEAD') {
                Write-Text -Stream $stream -StatusCode 405 -StatusText 'Method Not Allowed' -Text 'Method Not Allowed' -ContentType 'text/plain; charset=utf-8'
                continue
            }

            $fsPath = Try-MapUrlToFsPath -RootAbs $rootAbs -UrlPath $urlPath
            if (-not $fsPath) {
                Write-Text -Stream $stream -StatusCode 400 -StatusText 'Bad Request' -Text 'Bad Request' -ContentType 'text/plain; charset=utf-8'
                continue
            }

            if (Test-Path -LiteralPath $fsPath -PathType Container) {
                if (-not $urlPath.EndsWith('/')) {
                    $loc = "$urlPath/"
                    $hdr = "HTTP/1.1 301 Moved Permanently`r`nConnection: close`r`nLocation: $loc`r`nCache-Control: no-store`r`nContent-Length: 0`r`n`r`n"
                    $hb = [System.Text.Encoding]::ASCII.GetBytes($hdr)
                    $stream.Write($hb, 0, $hb.Length)
                    continue
                }

                $index = Join-Path -Path $fsPath -ChildPath 'index.html'
                if (Test-Path -LiteralPath $index -PathType Leaf) {
                    $bytes = [System.IO.File]::ReadAllBytes($index)
                    Write-Plain -Stream $stream -StatusCode 200 -StatusText 'OK' -Body $bytes -ContentType 'text/html; charset=utf-8'
                    continue
                }

                $html = Build-DirectoryListingHtml -UrlPath $urlPath -DirPath $fsPath
                Write-Text -Stream $stream -StatusCode 200 -StatusText 'OK' -Text $html -ContentType 'text/html; charset=utf-8'
                continue
            }

            if (-not (Test-Path -LiteralPath $fsPath -PathType Leaf)) {
                Write-Text -Stream $stream -StatusCode 404 -StatusText 'Not Found' -Text 'Not Found' -ContentType 'text/plain; charset=utf-8'
                continue
            }

            $ct = Get-MimeType -Path $fsPath
            if (Should-RewriteModuleImports -Path $fsPath) {
                $text = [System.IO.File]::ReadAllText($fsPath, [System.Text.Encoding]::UTF8)
                $text = Rewrite-ModuleImports -Text $text -Version $AssetVersion
                Write-Text -Stream $stream -StatusCode 200 -StatusText 'OK' -Text $text -ContentType $ct
            } else {
                $bytes = [System.IO.File]::ReadAllBytes($fsPath)
                Write-Plain -Stream $stream -StatusCode 200 -StatusText 'OK' -Body $bytes -ContentType $ct
            }
        } catch {
            try {
                $msg = "Internal Server Error: $($_.Exception.Message)"
                Write-Text -Stream $stream -StatusCode 500 -StatusText 'Internal Server Error' -Text $msg -ContentType 'text/plain; charset=utf-8'
            } catch {
                # ignore
            }
        } finally {
            try { $client.Close() } catch {}
        }
    }
} finally {
    try { $listener.Stop() } catch {}
}
