param([switch]$ServicesOnly)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
if ($ServicesOnly) { & bun (Join-Path $Root 'scripts/start.ts') '--services-only' }
else { & bun (Join-Path $Root 'scripts/start.ts') @args }
exit $LASTEXITCODE
