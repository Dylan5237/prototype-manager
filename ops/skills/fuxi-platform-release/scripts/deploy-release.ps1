<#
.SYNOPSIS
Uploads and deploys an approved immutable Fuxi release.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Archive,
  [Parameter(Mandatory)][string]$BaselinePath,
  [Parameter(Mandatory)][string]$ConfirmProductionDeploy,
  [string]$Server = '192.168.2.145',
  [string]$User = 'root',
  [string]$HostKey = 'ssh-ed25519 255 d0:c5:d3:c9:5f:a9:3c:b9:17:3b:6f:5c:e7:1d:61:d1'
)
$ErrorActionPreference = 'Stop'
if ($ConfirmProductionDeploy -cne 'DEPLOY_FUXI_PRODUCTION') { throw 'Use -ConfirmProductionDeploy DEPLOY_FUXI_PRODUCTION after explicit user approval.' }
$password = $env:FUXI_SSH_PASSWORD
if ([string]::IsNullOrWhiteSpace($password)) { throw 'FUXI_SSH_PASSWORD is required in the current process.' }
$archivePath = (Resolve-Path $Archive).Path
$baselinePath = (Resolve-Path $BaselinePath).Path
$manifestPath = "$archivePath.manifest.json"
$hashPath = "$archivePath.sha256"
if (-not (Test-Path $manifestPath) -or -not (Test-Path $hashPath)) { throw 'Release manifest or checksum sidecar is missing.' }
$manifest = Get-Content -Raw -Encoding utf8 $manifestPath | ConvertFrom-Json
if ([IO.Path]::GetFileName($archivePath) -ne "fuxi-release-$($manifest.releaseId).tar.gz") { throw 'Archive filename and manifest release ID differ.' }
$expectedHash = ((Get-Content -Raw -Encoding ascii $hashPath).Split(' ',[StringSplitOptions]::RemoveEmptyEntries)[0]).ToLowerInvariant()
$actualHash = (Get-FileHash -Algorithm SHA256 $archivePath).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) { throw 'Local archive checksum mismatch.' }
$baseline = Get-Content -Raw -Encoding utf8 $baselinePath | ConvertFrom-Json
if (-not $baseline.capturedAt -or @($baseline.prototypes).Count -eq 0) { throw 'Production baseline is invalid.' }
if ((Get-Date).ToUniversalTime() - [datetime]::Parse($baseline.capturedAt).ToUniversalTime() -gt [timespan]::FromHours(1)) { throw 'Production baseline is older than one hour.' }
$plink = (Get-Command plink.exe -ErrorAction Stop).Source
$pscp = (Get-Command pscp.exe -ErrorAction Stop).Source
$remoteArchive = "/tmp/$([IO.Path]::GetFileName($archivePath))"
$remoteScript = "/tmp/fuxi-remote-deploy-$($manifest.releaseId).sh"
$remoteBaseline = "/tmp/fuxi-production-baseline-$($manifest.releaseId).json"
$scriptPath = Join-Path $PSScriptRoot 'remote-deploy.sh'
& $pscp -batch -hostkey $HostKey -pw $password $archivePath "${User}@${Server}:$remoteArchive"
if ($LASTEXITCODE -ne 0) { throw 'Release archive upload failed; production was not switched.' }
& $pscp -batch -hostkey $HostKey -pw $password $scriptPath "${User}@${Server}:$remoteScript"
if ($LASTEXITCODE -ne 0) { throw 'Deploy script upload failed; production was not switched.' }
& $pscp -batch -hostkey $HostKey -pw $password $baselinePath "${User}@${Server}:$remoteBaseline"
if ($LASTEXITCODE -ne 0) { throw 'Production baseline upload failed; production was not switched.' }
& $plink -batch -ssh -hostkey $HostKey -l $User -pw $password $Server "bash '$remoteScript' --archive '$remoteArchive' --baseline '$remoteBaseline' --sha256 '$expectedHash' --release-id '$($manifest.releaseId)' --confirm DEPLOY_FUXI_PRODUCTION"
if ($LASTEXITCODE -ne 0) { throw "Remote deployment failed with exit code $LASTEXITCODE. Read its deployment_status before retrying." }
