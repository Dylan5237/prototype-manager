<#
.SYNOPSIS
Clones the platform GitLab develop branch and Skill GitLab main branch, then deploys a lightweight release to 16077.

.DESCRIPTION
This is the only high-level test release entrypoint. It never packages the current
developer worktree. Sources are cloned into a temporary directory, verified clean,
and passed to the existing immutable test deployment workflow.
#>
[CmdletBinding()]
param(
  [string]$PlatformRepositoryUrl = 'http://192.168.2.145:11980/fuxi/fuxi-platform',
  [string]$SkillsRepositoryUrl = 'http://192.168.2.145:11980/fuxi/fuxi-prototype-skills',
  [string]$PlatformBranch = 'develop',
  [string]$SkillsBranch = 'main',
  [string]$PlatformRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path,
  [string]$OutputDirectory,
  [Parameter(Mandatory)][string]$ConfirmTestDeploy,
  [switch]$InitData,
  [string]$FilterUser = 'wushengzhi'
)
$ErrorActionPreference = 'Stop'
if ($PlatformBranch -cne 'develop') { throw 'Test releases are restricted to the platform develop branch.' }
if ($SkillsBranch -cne 'main') { throw 'Test releases are restricted to the Skill main branch.' }
if ($ConfirmTestDeploy -cne 'DEPLOY_FUXI_TEST') { throw 'Test deployment confirmation must be DEPLOY_FUXI_TEST.' }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $PlatformRoot '.release' }
$buildScript = Join-Path $PSScriptRoot 'build-release.ps1'
$deployScript = Join-Path $PSScriptRoot 'deploy-test.ps1'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) "fuxi-test-develop-$([guid]::NewGuid().ToString('N'))"
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
  Invoke-Checked git @('clone','--branch',$PlatformBranch,'--single-branch','--depth','1',$PlatformRepositoryUrl,$clonedPlatform) $tempRoot
  Invoke-Checked git @('clone','--branch',$SkillsBranch,'--single-branch','--depth','1',$SkillsRepositoryUrl,$clonedSkills) $tempRoot
  foreach ($source in @(@($clonedPlatform, $PlatformBranch), @($clonedSkills, $SkillsBranch))) {
    $root, $expectedBranch = $source
    $actualBranch = (& git -c 'core.excludesFile=' -C $root branch --show-current).Trim()
    if ($actualBranch -cne $expectedBranch) { throw "GitLab checkout branch mismatch: $root ($actualBranch, expected $expectedBranch)." }
    $status = & git -c 'core.excludesFile=' -C $root status --porcelain
    if ($status) { throw "Fresh GitLab checkout is dirty: $root" }
  }
  Invoke-Checked npm @('ci') (Join-Path $clonedPlatform 'frontend')
  & $buildScript -PlatformRoot $clonedPlatform -SkillsRepositoryRoot $clonedSkills -OutputDirectory $OutputDirectory -ResultPath $resultPath -Lightweight
  if ($LASTEXITCODE -ne 0) { throw "Lightweight GitLab test build failed with exit code $LASTEXITCODE." }
  if (-not (Test-Path $resultPath)) { throw 'GitLab test build did not write a result manifest.' }
  $result = Get-Content -Raw -Encoding utf8 $resultPath | ConvertFrom-Json
  $deployParams = @{ Archive = $result.archive; ConfirmTestDeploy = $ConfirmTestDeploy; FilterUser = $FilterUser }
  if ($InitData) { $deployParams.InitData = $true }
  & $deployScript @deployParams
  if ($LASTEXITCODE -ne 0) { throw "Test deployment failed with exit code $LASTEXITCODE." }
  $result | Add-Member -NotePropertyName deployment -NotePropertyValue '16077' -Force
  $result | Add-Member -NotePropertyName sourceBranches -NotePropertyValue @{ platform = $PlatformBranch; skill = $SkillsBranch } -Force
  $result | Add-Member -NotePropertyName sourceRepositories -NotePropertyValue @($PlatformRepositoryUrl, $SkillsRepositoryUrl) -Force
  $result | ConvertTo-Json -Depth 4
} finally {
  if (Test-Path $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}
