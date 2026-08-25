<#
.SYNOPSIS
Clones platform and Skill repositories at GitLab main, builds a full release, and delegates the guarded production switch.

.DESCRIPTION
This is the only high-level production release entrypoint. It never packages the
current developer worktree. Both repositories are cloned fresh from main into a
temporary directory, dependencies are installed there, and the resulting immutable
archive is passed to deploy-release.ps1. Production still requires a fresh baseline
and explicit DEPLOY_FUXI_PRODUCTION confirmation.
#>
[CmdletBinding()]
param(
  [string]$PlatformRepositoryUrl = 'http://192.168.2.145:11980/fuxi/fuxi-platform',
  [string]$SkillsRepositoryUrl = 'http://192.168.2.145:11980/fuxi/fuxi-prototype-skills',
  [string]$Branch = 'main',
  [string]$PlatformRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path,
  [string]$OutputDirectory,
  [Parameter(Mandatory)][string]$BaselinePath,
  [Parameter(Mandatory)][string]$ConfirmProductionDeploy
)
$ErrorActionPreference = 'Stop'
if ($Branch -cne 'main') { throw 'Production releases are restricted to the main branch.' }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $PlatformRoot '.release' }
$PlatformRoot = (Resolve-Path $PlatformRoot).Path
$buildScript = Join-Path $PSScriptRoot 'build-release.ps1'
$deployScript = Join-Path $PSScriptRoot 'deploy-release.ps1'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) "fuxi-production-main-$([guid]::NewGuid().ToString('N'))"
$clonedPlatform = Join-Path $tempRoot 'fuxi-platform'
$clonedSkills = Join-Path $tempRoot 'fuxi-prototype-skills'
$resultPath = Join-Path $tempRoot 'build-result.json'
function Invoke-Checked([string]$File, [string[]]$Arguments, [string]$WorkingDirectory) {
  Push-Location $WorkingDirectory
  try {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$File failed with exit code $LASTEXITCODE." }
  } finally { Pop-Location }
}
try {
  New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
  Invoke-Checked git @('clone','--branch',$Branch,'--single-branch','--depth','1',$PlatformRepositoryUrl,$clonedPlatform) $tempRoot
  Invoke-Checked git @('clone','--branch',$Branch,'--single-branch','--depth','1',$SkillsRepositoryUrl,$clonedSkills) $tempRoot
  foreach ($root in @($clonedPlatform, $clonedSkills)) {
    $actualBranch = (& git -c 'core.excludesFile=' -C $root branch --show-current).Trim()
    if ($actualBranch -cne 'main') { throw "GitLab checkout is not on main: $root ($actualBranch)." }
    $status = & git -c 'core.excludesFile=' -C $root status --porcelain
    if ($status) { throw "Fresh GitLab checkout is dirty: $root" }
  }
  Invoke-Checked npm @('ci') (Join-Path $clonedPlatform 'frontend')
  Invoke-Checked npm @('ci') (Join-Path $clonedPlatform 'backend')
  & $buildScript -PlatformRoot $clonedPlatform -SkillsRepositoryRoot $clonedSkills -OutputDirectory $OutputDirectory -ResultPath $resultPath
  if ($LASTEXITCODE -ne 0) { throw "Full production build failed with exit code $LASTEXITCODE." }
  if (-not (Test-Path $resultPath)) { throw 'Production build did not write a result manifest.' }
  $result = Get-Content -Raw -Encoding utf8 $resultPath | ConvertFrom-Json
  & $deployScript -Archive $result.archive -BaselinePath $BaselinePath -ConfirmProductionDeploy $ConfirmProductionDeploy
  if ($LASTEXITCODE -ne 0) { throw "Production deployment failed with exit code $LASTEXITCODE." }
  $result | Add-Member -NotePropertyName sourceBranch -NotePropertyValue 'main' -Force
  $result | Add-Member -NotePropertyName sourceRepositories -NotePropertyValue @($PlatformRepositoryUrl, $SkillsRepositoryUrl) -Force
  $result | ConvertTo-Json -Depth 4
} finally {
  if (Test-Path $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}
