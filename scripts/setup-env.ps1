# Creates .env from .env.example with freshly generated random secrets (Windows).
# Usage: powershell -ExecutionPolicy Bypass -File scripts\setup-env.ps1 [-Force]
param([switch]$Force)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

if ((Test-Path .env) -and -not $Force) {
    Write-Error '.env already exists. Not overwriting. Use -Force to replace it.'
    exit 1
}

function New-HexSecret([int]$Bytes) {
    $buf = New-Object byte[] $Bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($buf)
    $rng.Dispose()
    return -join ($buf | ForEach-Object { $_.ToString('x2') })
}

$dbPass = New-HexSecret 24
$agentKey = New-HexSecret 32
$tgSecret = New-HexSecret 32

$lines = Get-Content .env.example | ForEach-Object {
    if ($_ -match '^POSTGRES_PASSWORD=') { "POSTGRES_PASSWORD=$dbPass" }
    elseif ($_ -match '^DATABASE_URL=') { "DATABASE_URL=postgresql://cyberreserve:$dbPass@postgres:5432/cyberreserve?schema=public" }
    elseif ($_ -match '^AGENT_KEY=') { "AGENT_KEY=$agentKey" }
    elseif ($_ -match '^TELEGRAM_WEBHOOK_SECRET=') { "TELEGRAM_WEBHOOK_SECRET=$tgSecret" }
    else { $_ }
}

# UTF-8 without BOM, LF endings (Docker's env_file parser dislikes BOMs).
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path (Get-Location) '.env'), (($lines -join "`n") + "`n"), $utf8NoBom)
Write-Host '.env created with new random secrets.'
