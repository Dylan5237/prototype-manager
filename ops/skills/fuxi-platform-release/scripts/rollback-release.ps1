<#
.SYNOPSIS
Rolls Fuxi production back to a server-side backup after explicit approval.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$BackupId,
  [Parameter(Mandatory)][string]$ConfirmProductionRollback,
  [switch]$RestoreData,
  [string]$Server = '192.168.2.145',
  [string]$User = 'root',
  [string]$HostKey = 'ssh-ed25519 255 d0:c5:d3:c9:5f:a9:3c:b9:17:3b:6f:5c:e7:1d:61:d1'
)
$ErrorActionPreference = 'Stop'
if ($ConfirmProductionRollback -cne 'ROLLBACK_FUXI_PRODUCTION') { throw 'Use -ConfirmProductionRollback ROLLBACK_FUXI_PRODUCTION after explicit user approval.' }
if ($BackupId -notmatch '^\d{8}-\d{6}-pre-\d{8}-\d{6}-[0-9a-f]{8}$') { throw 'BackupId format is invalid.' }
$password = $env:FUXI_SSH_PASSWORD
if ([string]::IsNullOrWhiteSpace($password)) { throw 'FUXI_SSH_PASSWORD is required in the current process.' }
$plink = (Get-Command plink.exe -ErrorAction Stop).Source
$pscp = (Get-Command pscp.exe -ErrorAction Stop).Source
$scriptPath = Join-Path $PSScriptRoot 'remote-rollback.sh'
$remoteScript = "/tmp/fuxi-remote-rollback-$BackupId.sh"
& $pscp -batch -hostkey $HostKey -pw $password $scriptPath "${User}@${Server}:$remoteScript"
if ($LASTEXITCODE -ne 0) { throw 'Rollback script upload failed; production was not changed.' }
$dataFlag = if ($RestoreData) { '--restore-data' } else { '' }
& $plink -batch -ssh -hostkey $HostKey -l $User -pw $password $Server "bash '$remoteScript' --backup-id '$BackupId' $dataFlag --confirm ROLLBACK_FUXI_PRODUCTION"
if ($LASTEXITCODE -ne 0) { throw "Remote rollback failed with exit code $LASTEXITCODE." }
