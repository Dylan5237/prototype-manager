<#
.SYNOPSIS
Builds an immutable Fuxi release archive from two clean committed repositories.

Use -Lightweight for the isolated 16077 test loop. It still builds the frontend
and packages a checksumed immutable archive, but leaves full MCP integration
verification to the user's manual test. Production releases must omit this flag.
#>
[CmdletBinding()]
param(
  [string]$PlatformRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path,
  [Parameter(Mandatory)][string]$SkillsRepositoryRoot,
  [string]$OutputDirectory = (Join-Path $PlatformRoot '.release'),
  [string]$ResultPath,
  [switch]$Lightweight
)
$ErrorActionPreference = 'Stop'
function Invoke-Checked([string]$File, [string[]]$Arguments, [string]$WorkingDirectory) {
  Push-Location $WorkingDirectory
  try {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$File failed with exit code $LASTEXITCODE" }
  } finally { Pop-Location }
}
function Assert-Clean([string]$Root, [string]$Label) {
  $status = & git -c 'core.excludesFile=' -C $Root status --porcelain
  if ($LASTEXITCODE -ne 0) { throw "$Label is not a Git repository: $Root" }
  if ($status) { throw "$Label worktree is not clean. Commit or remove task residue before packaging.`n$($status -join "`n")" }
}
function Get-BranchLabel([string]$Root) {
  $branch = [string](& git -c 'core.excludesFile=' -C $Root branch --show-current)
  if ($LASTEXITCODE -ne 0) { throw "Unable to resolve Git branch for $Root" }
  $branch = $branch.Trim()
  if ([string]::IsNullOrWhiteSpace($branch)) { return '(detached)' }
  return $branch
}

$PlatformRoot = (Resolve-Path $PlatformRoot).Path
$SkillsRepositoryRoot = (Resolve-Path $SkillsRepositoryRoot).Path
Assert-Clean $PlatformRoot 'Platform'
Assert-Clean $SkillsRepositoryRoot 'Skills'
if (-not (Test-Path (Join-Path $SkillsRepositoryRoot 'fuxi-prototype\SKILL.md'))) {
  throw 'Skills repository does not contain fuxi-prototype/SKILL.md.'
}
Invoke-Checked npm @('run','build') (Join-Path $PlatformRoot 'frontend')
if (-not $Lightweight) {
  Invoke-Checked npm @('run','check') (Join-Path $PlatformRoot 'mcp-server')
  Invoke-Checked npm @('run','test:integration') (Join-Path $PlatformRoot 'mcp-server')
}
Assert-Clean $PlatformRoot 'Platform after verification'
Assert-Clean $SkillsRepositoryRoot 'Skills after verification'

$platformCommit = (& git -c 'core.excludesFile=' -C $PlatformRoot rev-parse HEAD).Trim()
$skillCommit = (& git -c 'core.excludesFile=' -C $SkillsRepositoryRoot rev-parse HEAD).Trim()
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$releaseId = "$stamp-$($platformCommit.Substring(0,8))"
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) "fuxi-release-$releaseId"
$stage = Join-Path $tempRoot 'stage'
$platformTar = Join-Path $tempRoot 'platform.tar'
$skillTar = Join-Path $tempRoot 'skill.tar'
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'platform'),(Join-Path $stage 'skills') | Out-Null
try {
  Invoke-Checked git @('-c','core.excludesFile=','-C',$PlatformRoot,'archive','--format=tar',"--output=$platformTar",'HEAD') $PlatformRoot
  Invoke-Checked tar @('-xf',$platformTar,'-C',(Join-Path $stage 'platform')) $PlatformRoot
  Invoke-Checked git @('-c','core.excludesFile=','-C',$SkillsRepositoryRoot,'archive','--format=tar',"--output=$skillTar",'HEAD','fuxi-prototype') $SkillsRepositoryRoot
  Invoke-Checked tar @('-xf',$skillTar,'-C',(Join-Path $stage 'skills')) $SkillsRepositoryRoot
  $distSource = Join-Path $PlatformRoot 'frontend\dist'
  if (-not (Test-Path (Join-Path $distSource 'index.html'))) { throw 'Frontend dist/index.html is missing after build.' }
  Copy-Item -LiteralPath $distSource -Destination (Join-Path $stage 'platform\frontend\dist') -Recurse -Force

  $manifest = [ordered]@{
    schemaVersion = 1
    releaseId = $releaseId
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    platformCommit = $platformCommit
    skillCommit = $skillCommit
    platformBranch = Get-BranchLabel $PlatformRoot
    skillBranch = Get-BranchLabel $SkillsRepositoryRoot
    releaseProfile = if ($Lightweight) { 'test-lightweight' } else { 'full' }
    verification = if ($Lightweight) { 'frontend-build+package-checksum+manual-test' } else { 'frontend-build+mcp-check+mcp-integration' }
    persistentPaths = @('backend/data','backend/repos','backend/uploads','backend/.env')
  }
  [IO.File]::WriteAllText((Join-Path $stage 'manifest.json'), ($manifest | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
  New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
  $archive = Join-Path $OutputDirectory "fuxi-release-$releaseId.tar.gz"
  Invoke-Checked tar @('-czf',$archive,'-C',$stage,'.') $PlatformRoot
  $hash = (Get-FileHash -Algorithm SHA256 $archive).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText("$archive.sha256", "$hash  $([IO.Path]::GetFileName($archive))`n", [Text.UTF8Encoding]::new($false))
  Copy-Item -LiteralPath (Join-Path $stage 'manifest.json') -Destination "$archive.manifest.json" -Force
  $result = [ordered]@{ releaseId=$releaseId; archive=$archive; sha256=$hash; platformCommit=$platformCommit; skillCommit=$skillCommit; verification=$manifest.verification }
  if ($ResultPath) {
    $resultParent = Split-Path -Parent $ResultPath
    if ($resultParent) { New-Item -ItemType Directory -Force -Path $resultParent | Out-Null }
    $resultFile = if ([IO.Path]::IsPathRooted($ResultPath)) { $ResultPath } else { Join-Path (Get-Location) $ResultPath }
    [IO.File]::WriteAllText($resultFile, ($result | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
  }
  $result | ConvertTo-Json
} finally {
  if (Test-Path $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}
