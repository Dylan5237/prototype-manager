<#
.SYNOPSIS
Builds the current committed worktree and deploys it directly to the isolated 16077 test environment.

.DESCRIPTION
This is the short test loop. It uses the current platform and local Skill worktrees,
builds a lightweight immutable release, and delegates the guarded remote switch to
deploy-test.ps1. It never targets production 16088.
#>
[CmdletBinding()]
param(
  [string]$PlatformRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path,
  [string]$SkillsRepositoryRoot = 'D:\_projects\skills\prototype-manager-skills',
  [string]$OutputDirectory,
  [Parameter(Mandatory)][string]$ConfirmTestDeploy,
  [switch]$InitData,
  [string]$FilterUser = 'wushengzhi'
)
$ErrorActionPreference = 'Stop'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $PlatformRoot '.release' }
$PlatformRoot = (Resolve-Path $PlatformRoot).Path
$SkillsRepositoryRoot = (Resolve-Path $SkillsRepositoryRoot).Path
$buildScript = Join-Path $PSScriptRoot 'build-release.ps1'
$deployScript = Join-Path $PSScriptRoot 'deploy-test.ps1'
$resultPath = Join-Path $OutputDirectory ".quick-test-result-$([guid]::NewGuid().ToString('N')).json"
try {
  & $buildScript -PlatformRoot $PlatformRoot -SkillsRepositoryRoot $SkillsRepositoryRoot -OutputDirectory $OutputDirectory -ResultPath $resultPath -Lightweight
  if ($LASTEXITCODE -ne 0) { throw "Lightweight test build failed with exit code $LASTEXITCODE." }
  if (-not (Test-Path $resultPath)) { throw 'Lightweight test build did not write a result manifest.' }
  $result = Get-Content -Raw -Encoding utf8 $resultPath | ConvertFrom-Json
  $deployArgs = @('-Archive', $result.archive, '-ConfirmTestDeploy', $ConfirmTestDeploy, '-FilterUser', $FilterUser)
  if ($InitData) { $deployArgs += '-InitData' }
  & $deployScript @deployArgs
  if ($LASTEXITCODE -ne 0) { throw "Test deployment failed with exit code $LASTEXITCODE." }
  $result | Add-Member -NotePropertyName deployment -NotePropertyValue '16077' -Force
  $result | ConvertTo-Json -Depth 4
} finally {
  if (Test-Path $resultPath) { Remove-Item -LiteralPath $resultPath -Force }
}
