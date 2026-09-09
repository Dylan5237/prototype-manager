<#
.SYNOPSIS
Compatibility wrapper for the GitLab develop test deployment entrypoint.

.DESCRIPTION
Test releases no longer package local worktrees. This wrapper delegates to
deploy-test-from-gitlab.ps1, which fresh-clones platform and Skill develop.
#>
[CmdletBinding()]
param(
  [string]$PlatformRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path,
  [string]$OutputDirectory,
  [Parameter(Mandatory)][string]$ConfirmTestDeploy,
  [switch]$InitData,
  [string]$FilterUser = 'wushengzhi'
)
$ErrorActionPreference = 'Stop'
$entrypoint = Join-Path $PSScriptRoot 'deploy-test-from-gitlab.ps1'
$params = @{ PlatformRoot = $PlatformRoot; ConfirmTestDeploy = $ConfirmTestDeploy; FilterUser = $FilterUser }
if ($OutputDirectory) { $params.OutputDirectory = $OutputDirectory }
if ($InitData) { $params.InitData = $true }
& $entrypoint @params
if ($LASTEXITCODE -ne 0) { throw "GitLab develop test deployment failed with exit code $LASTEXITCODE." }
