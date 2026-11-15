param(
    [switch]$InstallPrerequisites,
    [switch]$OpenBridge,
    [ValidateSet('safe','replica')][string]$Profile = 'safe',
    [switch]$AllowBroadTools,
    [int]$CompactWindow = 0,
    [string]$Workspace = ''
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$HomeDir = [Environment]::GetFolderPath('UserProfile')
$BridgeDir = Join-Path $HomeDir 'cc-switch'
$BridgeExe = Join-Path $BridgeDir 'cc-switch.exe'
$Version = '4.0.25'

function Invoke-Checked {
    param([string]$Exe, [string[]]$Arguments)
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed with exit $LASTEXITCODE : $Exe" }
}
function Resolve-Bun {
    $Candidates = @((Join-Path $HomeDir '.bun\bin\bun.exe'), (Join-Path $env:APPDATA 'npm\node_modules\bun\bin\bun.exe'))
    foreach ($Candidate in $Candidates) { if (Test-Path -LiteralPath $Candidate) { return $Candidate } }
    $Command = Get-Command bun.exe -ErrorAction SilentlyContinue
    if ($Command) { return $Command.Source }
    return $null
}
function Refresh-ChildPath {
    $env:PATH = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
}
$Bun = Resolve-Bun
$Claude = Join-Path $HomeDir '.local\bin\claude.exe'
if ($InstallPrerequisites) {
    $Winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (!$Winget) { throw 'Install Microsoft App Installer from the Microsoft Store to get winget.' }
    if (!$Bun) { Invoke-Checked $Winget.Source @('install','--id','Oven-sh.Bun','--exact','--source','winget'); Refresh-ChildPath; $Bun = Resolve-Bun }
    if (!(Test-Path -LiteralPath $Claude)) {
        Invoke-Checked $Winget.Source @('install','--id','Anthropic.ClaudeCode','--exact','--source','winget')
        Refresh-ChildPath
        $Command = Get-Command claude.exe -ErrorAction SilentlyContinue
        if (!(Test-Path -LiteralPath $Claude) -and $Command) { $Claude = $Command.Source }
    }
    if (!(Test-Path -LiteralPath $BridgeExe)) {
        $Downloads = Join-Path $Root ('downloads\cc-switch-' + [guid]::NewGuid().ToString())
        New-Item -ItemType Directory -Path $Downloads | Out-Null
        $Arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
        if ($Arch -eq 'Arm64') {
            $Asset = 'CC-Switch-v4.0.25-Windows-arm64-Portable.zip'
            $Expected = '32dee8c45275d8cab2c7510ee24e88dac428c1147fee615e46126d3e5c5e30bd'
        } else {
            $Asset = 'CC-Switch-v4.0.25-Windows-Portable.zip'
            $Expected = '154c86238521b594f83d2b2431e2026c2b49d72c4406b000a46e97bc58b682e2'
        }
        $Zip = Join-Path $Downloads $Asset
        Invoke-WebRequest -Uri "https://github.com/farion1231/cc-switch/releases/download/v$Version/$Asset" -OutFile $Zip -UseBasicParsing
        if ((Get-FileHash -LiteralPath $Zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Expected) { throw 'cc-switch download checksum mismatch; archive will not be used.' }
        $Extract = Join-Path $Downloads 'extracted'
        Expand-Archive -LiteralPath $Zip -DestinationPath $Extract
        $Found = @(Get-ChildItem -LiteralPath $Extract -Filter 'cc-switch.exe' -Recurse -File)
        if ($Found.Count -ne 1) { throw 'Unexpected official archive layout.' }
        if (Test-Path -LiteralPath $BridgeDir) { throw "Existing $BridgeDir will not be overwritten. Select your existing executable manually." }
        Copy-Item -LiteralPath $Found[0].Directory.FullName -Destination $BridgeDir -Recurse
    }
}
if (!$Bun) { throw 'Bun is missing. Re-run with -InstallPrerequisites, or install it from bun.sh.' }
if (!(Test-Path -LiteralPath $BridgeExe)) { throw 'cc-switch portable app is missing. Use -InstallPrerequisites or install v4.0.25 manually.' }
if (!(Test-Path -LiteralPath $Claude)) { throw 'Native Claude Code is missing. Install it from the official documentation.' }
$BunVersion = & $Bun --version
if ($LASTEXITCODE -ne 0 -or [version]($BunVersion.Trim()) -lt [version]'1.4.4') { throw 'Bun 1.4.4 or newer is required.' }
$ClaudeVersion = & $Claude --version
if ($LASTEXITCODE -ne 0 -or $ClaudeVersion -notmatch '(\d+\.\d+\.\d+)') { throw 'Cannot verify Claude Code version.' }
if ([version]$Matches[1] -lt [version]'2.1.293') { throw 'Claude Code 2.1.293+ is required. Run the native claude update command, then retry.' }
Invoke-Checked $Bun @('-e', 'const d = new (await import("bun:sqlite")).Database(":memory:"); d.exec("create table smoke(n integer); insert into smoke values(1)"); if(d.query("select n from smoke").get().n!==1) throw Error("SQLite smoke failed"); d.close(); console.log("Bun SQLite smoke passed")')
if ($OpenBridge) {
    Start-Process -FilePath $BridgeExe
    Write-Host 'Open cc-switch, complete onboarding and let it import current Claude settings. Then Quit from its tray and close this Claude Code chat/CLI before running configure.'
}
Write-Host "Toolkit: $Root"
Write-Host "Next: & '$Bun' '$Root\scripts\configure.ts' --profile $Profile"
Write-Host 'Use --apply with a private --key-file only after reviewing the preview and quitting cc-switch/Claude Code.'
if ($Profile -eq 'replica' -and !$AllowBroadTools) { Write-Host 'Replica allows arbitrary Bash + workflows/web tools; --allow-broad-tools is required when applying.' }
if ($CompactWindow) { Write-Host "Requested compaction: $CompactWindow (supported 100000..1000000; actual model capacity still applies)." }
if ($Workspace) { Write-Host "Workspace pin requested: $Workspace; pass --workspace to configure after inspecting existing project settings." }
