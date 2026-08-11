<#
.SYNOPSIS
Runs the bundled read-only Fuxi production probe over pinned SSH.
#>
[CmdletBinding()]
param(
  [string]$Server = '192.168.2.145',
  [string]$User = 'root',
  [string]$HostKey = 'ssh-ed25519 255 d0:c5:d3:c9:5f:a9:3c:b9:17:3b:6f:5c:e7:1d:61:d1',
  [string]$RemoteRoot = '/zoesoft/fuxi',
  [string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$password = $env:FUXI_SSH_PASSWORD
if ([string]::IsNullOrWhiteSpace($password)) { throw 'FUXI_SSH_PASSWORD is required in the current process.' }
$plink = (Get-Command plink.exe -ErrorAction Stop).Source
$probe = Join-Path $PSScriptRoot 'remote-preflight.sh'
$probeSource = (Get-Content -Raw -Encoding utf8 $probe).Replace("`r`n", "`n")
function Quote-Native([string]$value) { '"' + $value.Replace('"','\"') + '"' }
$info = [Diagnostics.ProcessStartInfo]::new()
$info.FileName = $plink
$info.Arguments = @('-batch','-ssh','-hostkey',(Quote-Native $HostKey),'-l',(Quote-Native $User),'-pw',(Quote-Native $password),(Quote-Native $Server),(Quote-Native "bash -s -- '$RemoteRoot'")) -join ' '
$info.UseShellExecute = $false
$info.RedirectStandardInput = $true
$info.RedirectStandardOutput = $true
$info.RedirectStandardError = $true
$process = [Diagnostics.Process]::new(); $process.StartInfo = $info
if (-not $process.Start()) { throw 'Failed to start plink.' }
$stdoutTask = $process.StandardOutput.ReadToEndAsync(); $stderrTask = $process.StandardError.ReadToEndAsync()
$process.StandardInput.Write($probeSource); $process.StandardInput.Close(); $process.WaitForExit()
$text = $stdoutTask.Result.TrimEnd(); $errorText = $stderrTask.Result.Trim()
if ($process.ExitCode -ne 0) { throw "Read-only production probe failed with exit code $($process.ExitCode): $errorText" }
if ($OutputPath) {
  $parent = Split-Path -Parent $OutputPath
  if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  [IO.File]::WriteAllText((Join-Path (Get-Location) $OutputPath), $text + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
}
$text
