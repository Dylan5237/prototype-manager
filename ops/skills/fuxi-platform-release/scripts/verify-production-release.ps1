<#
.SYNOPSIS
Verifies old-data zero drift and the current production Skill/MCP onboarding contract after deployment.
#>
[CmdletBinding()]
param(
  [string]$ApiUrl = 'http://192.168.2.145:3001',
  [Parameter(Mandatory)][string]$BaselinePath,
  [ValidateSet('workbuddy','cursor')][string]$BootstrapHost = 'workbuddy'
)
$ErrorActionPreference = 'Stop'

function Assert-Sha256([string]$Value, [string]$Label) {
  if ([string]::IsNullOrWhiteSpace($Value) -or $Value -notmatch '^[a-fA-F0-9]{64}$') {
    throw "$Label is not a SHA-256 digest."
  }
}

function Assert-HttpUrl([string]$Value, [string]$Label) {
  if ([string]::IsNullOrWhiteSpace($Value)) { throw "$Label is missing." }
  $parsed = $null
  if (-not [Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$parsed) -or $parsed.Scheme -notin @('http','https')) {
    throw "$Label must be an absolute HTTP(S) URL."
  }
}

function Assert-ArtifactContract($Artifact, [string]$Label) {
  if ($null -eq $Artifact) { throw "$Label artifact contract is missing." }
  Assert-HttpUrl "$($Artifact.url)" "$Label artifact URL"
  Assert-Sha256 "$($Artifact.sha256)" "$Label artifact SHA-256"
  if ([int64]$Artifact.size -le 0) { throw "$Label artifact size must be positive." }
}

function Assert-DownloadedArtifact([string]$Path, $Artifact, [string]$Label) {
  $item = Get-Item -LiteralPath $Path
  if ($item.Length -ne [int64]$Artifact.size) {
    throw "$Label artifact size mismatch: expected=$($Artifact.size), actual=$($item.Length)"
  }
  $actualHash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  $expectedHash = "$($Artifact.sha256)".ToLowerInvariant()
  if ($actualHash -cne $expectedHash) {
    throw "$Label artifact SHA-256 mismatch."
  }
}

$username = $env:FUXI_USERNAME
$password = $env:FUXI_PASSWORD
if ([string]::IsNullOrWhiteSpace($username) -or [string]::IsNullOrWhiteSpace($password)) {
  throw 'FUXI_USERNAME and FUXI_PASSWORD are required in the current process.'
}

$baseline = Get-Content -Raw -Encoding utf8 (Resolve-Path $BaselinePath) | ConvertFrom-Json
$login = Invoke-RestMethod -Method Post -Uri "$ApiUrl/api/auth/login" -ContentType 'application/json' -Body (@{username=$username;password=$password}|ConvertTo-Json) -TimeoutSec 15
$headers = @{Authorization="Bearer $($login.data.token)"}

$currentResponse = Invoke-RestMethod -Uri "$ApiUrl/api/prototypes?scope=all&pageSize=1000" -Headers $headers -TimeoutSec 60
$current = @($currentResponse.data)
$currentProjectsResponse = Invoke-RestMethod -Uri "$ApiUrl/api/projects" -Headers $headers -TimeoutSec 30
$currentProjects = foreach($project in @($currentProjectsResponse.data)) {
  (Invoke-RestMethod -Uri "$ApiUrl/api/projects/$($project.id)" -Headers $headers -TimeoutSec 30).data
}
$currentById = @{}
foreach($item in $current){$currentById[$item.id]=$item}
$fields = @('name','description','github_url','entry_file','category_id','created_by','created_at','updated_at','sync_status','sync_error','deleted_at','category_name','creator_name','version','version_label')
$missing = @()
$mismatches = @()
foreach($old in @($baseline.prototypes)) {
  if(-not $currentById.ContainsKey($old.id)){$missing += $old.id;continue}
  $now=$currentById[$old.id]
  foreach($field in $fields){
    if("$($old.$field)" -cne "$($now.$field)"){$mismatches += "$($old.id):$field"}
  }
}
if($missing.Count -or $mismatches.Count){
  throw "Production compatibility failed: missing=$($missing.Count), mismatches=$($mismatches.Count)"
}

function Get-ProjectSignature($project) {
  [ordered]@{
    id=$project.id
    name=$project.name
    description=$project.description
    menu_config=$project.menu_config
    created_by=$project.created_by
    deleted_at=$project.deleted_at
    prototypes=@($project.prototypes|Sort-Object prototype_id|ForEach-Object {
      [ordered]@{
        prototype_id=$_.prototype_id
        menu_path=$_.menu_path
        entry_file=$_.entry_file
        version_number=$_.version_number
        checkout_user=$_.checkout.user_id
      }
    })
    members=@($project.members|Sort-Object user_id|ForEach-Object {
      [ordered]@{user_id=$_.user_id;role=$_.role}
    })
  } | ConvertTo-Json -Depth 8 -Compress
}

$baselineProjectSignatures=@($baseline.projects|ForEach-Object {Get-ProjectSignature $_}|Sort-Object)
$currentProjectSignatures=@($currentProjects|ForEach-Object {Get-ProjectSignature $_}|Sort-Object)
if(($baselineProjectSignatures -join "`n") -cne ($currentProjectSignatures -join "`n")){
  throw 'Project bindings, members, or checkouts drifted after release.'
}

$bootstrapHostQuery = [Uri]::EscapeDataString($BootstrapHost)
$bootstrap = Invoke-RestMethod -Uri "$ApiUrl/api/integrations/agent-bootstrap?host=$bootstrapHostQuery" -Headers $headers -TimeoutSec 30
if ("$($bootstrap.data.mode)" -cne 'install') {
  throw "Bootstrap host '$BootstrapHost' is not in install mode."
}
if ("$($bootstrap.data.host.id)" -cne $BootstrapHost) {
  throw "Bootstrap host mismatch: requested=$BootstrapHost, returned=$($bootstrap.data.host.id)"
}

$bootstrapSession = $bootstrap.data.bootstrapSession
if ($null -eq $bootstrapSession -or [string]::IsNullOrWhiteSpace("$($bootstrapSession.credential)") -or [string]::IsNullOrWhiteSpace("$($bootstrapSession.bootstrapId)") -or [string]::IsNullOrWhiteSpace("$($bootstrapSession.expiresAt)")) {
  throw 'Bootstrap session contract is incomplete.'
}
$sessionExpiry = [DateTimeOffset]::Parse("$($bootstrapSession.expiresAt)")
if ($sessionExpiry -le [DateTimeOffset]::UtcNow) {
  throw 'Bootstrap session is already expired.'
}

$canonicalOnboarding = $bootstrap.data.canonicalOnboarding
if ($null -eq $canonicalOnboarding -or [string]::IsNullOrWhiteSpace("$($canonicalOnboarding.command)")) {
  throw 'Canonical onboarding contract is incomplete.'
}
Assert-HttpUrl "$($canonicalOnboarding.url)" 'Canonical onboarding URL'
Assert-Sha256 "$($canonicalOnboarding.sha256)" 'Canonical onboarding SHA-256'
if (-not "$($bootstrap.data.prompt)".Contains("$($canonicalOnboarding.command)")) {
  throw 'Bootstrap prompt does not embed the canonical onboarding command.'
}
if (-not "$($bootstrap.data.prompt)".Contains('check_connection')) {
  throw 'Bootstrap prompt does not preserve the check_connection verification instruction.'
}

$tempRoot=Join-Path ([IO.Path]::GetTempPath()) "fuxi-release-verify-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $tempRoot|Out-Null
try {
  $onboardingFile=Join-Path $tempRoot 'fuxi-onboard.cjs'
  Invoke-WebRequest -Uri $canonicalOnboarding.url -UseBasicParsing -OutFile $onboardingFile -TimeoutSec 60
  $onboardingHash=(Get-FileHash -LiteralPath $onboardingFile -Algorithm SHA256).Hash.ToLowerInvariant()
  if($onboardingHash -cne "$($canonicalOnboarding.sha256)".ToLowerInvariant()){
    throw 'Canonical onboarding SHA-256 mismatch.'
  }

  # Resolve the short-lived manifest through the Bootstrap session contract.
  # The credential/install token/connect code are intentionally never serialized by this verifier.
  $sessionHeaders=@{Authorization="Bearer $($bootstrapSession.credential)"}
  $manifestResponse=Invoke-RestMethod -Uri "$ApiUrl/api/integrations/bootstrap-session?client=$bootstrapHostQuery" -Headers $sessionHeaders -TimeoutSec 30
  $manifest=$manifestResponse.data.manifest
  if($null -eq $manifest -or "$($manifest.schema)" -cne 'fuxi-bootstrap/2'){
    throw 'Bootstrap manifest schema is not fuxi-bootstrap/2.'
  }
  if("$($manifest.bootstrapId)" -cne "$($bootstrapSession.bootstrapId)"){
    throw 'Bootstrap manifest id does not match the Bootstrap session.'
  }
  if("$($manifest.client.name)" -cne $BootstrapHost){
    throw "Bootstrap manifest client mismatch: expected=$BootstrapHost, actual=$($manifest.client.name)"
  }
  if([string]::IsNullOrWhiteSpace("$($manifest.installToken)") -or [string]::IsNullOrWhiteSpace("$($manifest.connectCode)")){
    throw 'Bootstrap manifest is missing install credentials.'
  }

  Assert-ArtifactContract $manifest.artifacts.skill 'Skill'
  Assert-ArtifactContract $manifest.artifacts.mcp 'MCP'

  $packageHeaders=@{Authorization="Bearer $($manifest.installToken)"}
  $skillZip=Join-Path $tempRoot 'skill.zip'
  $mcpZip=Join-Path $tempRoot 'mcp.zip'
  Invoke-WebRequest -Uri $manifest.artifacts.skill.url -Headers $packageHeaders -UseBasicParsing -OutFile $skillZip -TimeoutSec 60
  Invoke-WebRequest -Uri $manifest.artifacts.mcp.url -Headers $packageHeaders -UseBasicParsing -OutFile $mcpZip -TimeoutSec 60
  Assert-DownloadedArtifact $skillZip $manifest.artifacts.skill 'Skill'
  Assert-DownloadedArtifact $mcpZip $manifest.artifacts.mcp 'MCP'

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  function Get-ZipEntries([string]$path){
    $zip=[IO.Compression.ZipFile]::OpenRead($path)
    try{@($zip.Entries|ForEach-Object FullName)}finally{$zip.Dispose()}
  }
  $skillEntries=Get-ZipEntries $skillZip
  $mcpEntries=Get-ZipEntries $mcpZip
  if('fuxi-prototype/SKILL.md' -notin $skillEntries){
    throw 'Skill package entry is missing.'
  }
  if('fuxi-platform-mcp/src/server.js' -notin $mcpEntries -or 'fuxi-platform-mcp/package.json' -notin $mcpEntries){
    throw 'MCP package entries are missing.'
  }
  $forbidden=@($skillEntries+$mcpEntries|Where-Object {
    $_ -match '(^|/)(\.git|node_modules|tests)(/|$)|\.credentials\.json$|\.npmrc$|\.log$'
  })
  if($forbidden.Count){
    throw "Distribution package contains forbidden entries: $($forbidden -join ', ')"
  }

  $skillBytes=(Get-Item $skillZip).Length
  $mcpBytes=(Get-Item $mcpZip).Length
  $skillPackageSha256="$($manifest.artifacts.skill.sha256)".ToLowerInvariant()
  $mcpPackageSha256="$($manifest.artifacts.mcp.sha256)".ToLowerInvariant()
  $canonicalOnboardingSha256="$($canonicalOnboarding.sha256)".ToLowerInvariant()
} finally {
  if(Test-Path $tempRoot){Remove-Item -LiteralPath $tempRoot -Recurse -Force}
}

$added=@($current|Where-Object {$_.id -notin @($baseline.prototypes|ForEach-Object id)}|ForEach-Object id)
[pscustomobject]@{
  ok=$true
  baselineCount=@($baseline.prototypes).Count
  currentCount=$current.Count
  oldIdsPreserved=$true
  metadataMismatchCount=0
  projectState='matched'
  addedIds=$added
  bootstrap='verified'
  bootstrapHost=$BootstrapHost
  canonicalOnboardingSha256=$canonicalOnboardingSha256
  skillPackageBytes=$skillBytes
  mcpPackageBytes=$mcpBytes
  skillPackageSha256=$skillPackageSha256
  mcpPackageSha256=$mcpPackageSha256
}|ConvertTo-Json -Depth 4
