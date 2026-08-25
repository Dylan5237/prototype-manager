<#
.SYNOPSIS
Uploads and deploys an approved immutable Fuxi release to the isolated 16077 test environment.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Archive,
  [Parameter(Mandatory)][string]$ConfirmTestDeploy,
  [switch]$InitData,
  [string]$FilterUser = 'wushengzhi',
  [string]$Server = '192.168.2.145',
  [string]$User = 'root',
  [string]$HostKey = 'ssh-ed25519 255 d0:c5:d3:c9:5f:a9:3c:b9:17:3b:6f:5c:e7:1d:61:d1'
)
$ErrorActionPreference = 'Stop'
if ($ConfirmTestDeploy -cne 'DEPLOY_FUXI_TEST') { throw 'Use -ConfirmTestDeploy DEPLOY_FUXI_TEST after explicit user approval.' }
$password = $env:FUXI_SSH_PASSWORD
if ([string]::IsNullOrWhiteSpace($password)) { throw 'FUXI_SSH_PASSWORD is required in the current process.' }
$archivePath = (Resolve-Path $Archive).Path
$manifestPath = "$archivePath.manifest.json"
$hashPath = "$archivePath.sha256"
if (-not (Test-Path $manifestPath) -or -not (Test-Path $hashPath)) { throw 'Release manifest or checksum sidecar is missing.' }
$manifest = Get-Content -Raw -Encoding utf8 $manifestPath | ConvertFrom-Json
if ([IO.Path]::GetFileName($archivePath) -ne "fuxi-release-$($manifest.releaseId).tar.gz") { throw 'Archive filename and manifest release ID differ.' }
$expectedHash = ((Get-Content -Raw -Encoding ascii $hashPath).Split(' ',[StringSplitOptions]::RemoveEmptyEntries)[0]).ToLowerInvariant()
$actualHash = (Get-FileHash -Algorithm SHA256 $archivePath).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) { throw 'Local archive checksum mismatch.' }
$plink = (Get-Command plink.exe -ErrorAction Stop).Source
$pscp = (Get-Command pscp.exe -ErrorAction Stop).Source
$remoteArchive = "/tmp/$([IO.Path]::GetFileName($archivePath))"
$remoteScript = "/tmp/fuxi-remote-deploy-test-$($manifest.releaseId).sh"
$remoteFilter = "/tmp/fuxi-filter-test-data-$($manifest.releaseId).js"
$scriptPath = Join-Path $PSScriptRoot 'remote-deploy-test.sh'
$filterPath = Join-Path $PSScriptRoot 'filter-test-data.js'
& $pscp -batch -hostkey $HostKey -pw $password $archivePath "${User}@${Server}:$remoteArchive"
if ($LASTEXITCODE -ne 0) { throw 'Test release archive upload failed; test environment was not switched.' }
& $pscp -batch -hostkey $HostKey -pw $password $scriptPath "${User}@${Server}:$remoteScript"
if ($LASTEXITCODE -ne 0) { throw 'Test deploy script upload failed; test environment was not switched.' }
& $pscp -batch -hostkey $HostKey -pw $password $filterPath "${User}@${Server}:$remoteFilter"
if ($LASTEXITCODE -ne 0) { throw 'Test data filter script upload failed; test environment was not switched.' }
$initFlag = if ($InitData) { '--init-data true' } else { '' }
& $plink -batch -ssh -hostkey $HostKey -l $User -pw $password $Server "bash '$remoteScript' --archive '$remoteArchive' --sha256 '$expectedHash' --release-id '$($manifest.releaseId)' --filter-user '$FilterUser' --filter-script '$remoteFilter' $initFlag --confirm DEPLOY_FUXI_TEST"
if ($LASTEXITCODE -ne 0) { throw "Remote test deployment failed with exit code $LASTEXITCODE. Read its deployment_status before retrying." }
