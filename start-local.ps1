$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodeExecutable = Get-Command node -ErrorAction SilentlyContinue
if ($nodeExecutable) {
    & $nodeExecutable.Source server/index.mjs
} else {
    $bundledNode = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
    if (-not (Test-Path -LiteralPath $bundledNode)) { throw 'Install Node.js 24 or newer, then run this script again.' }
    & $bundledNode server/index.mjs
}
