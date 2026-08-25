<#
.SYNOPSIS
Verifies old-data zero drift and production Skill/MCP bootstrap after deployment.
#>
[CmdletBinding()]
param(
  [string]$ApiUrl = 'http://192.168.2.145:3001',
  [Parameter(Mandatory)][string]$BaselinePath
)
$ErrorActionPreference = 'Stop'
$username = $env:FUXI_USERNAME
$password = $env:FUXI_PASSWORD
if ([string]::IsNullOrWhiteSpace($username) -or [string]::IsNullOrWhiteSpace($password)) { throw 'FUXI_USERNAME and FUXI_PASSWORD are required in the current process.' }
$baseline = Get-Content -Raw -Encoding utf8 (Resolve-Path $BaselinePath) | ConvertFrom-Json
$login = Invoke-RestMethod -Method Post -Uri "$ApiUrl/api/auth/login" -ContentType 'application/json' -Body (@{username=$username;password=$password}|ConvertTo-Json) -TimeoutSec 15
$headers = @{Authorization="Bearer $($login.data.token)"}
$currentResponse = Invoke-RestMethod -Uri "$ApiUrl/api/prototypes?scope=all&pageSize=1000" -Headers $headers -TimeoutSec 60
$current = @($currentResponse.data)
$currentProjectsResponse = Invoke-RestMethod -Uri "$ApiUrl/api/projects" -Headers $headers -TimeoutSec 30
$currentProjects = foreach($project in @($currentProjectsResponse.data)) {
  (Invoke-RestMethod -Uri "$ApiUrl/api/projects/$($project.id)" -Headers $headers -TimeoutSec 30).data
}
$currentById = @{}; foreach($item in $current){$currentById[$item.id]=$item}
$fields = @('name','description','github_url','entry_file','category_id','created_by','created_at','updated_at','sync_status','sync_error','deleted_at','category_name','creator_name','version','version_label')
$missing = @(); $mismatches = @()
foreach($old in @($baseline.prototypes)) {
  if(-not $currentById.ContainsKey($old.id)){$missing += $old.id;continue}
  $now=$currentById[$old.id]
  foreach($field in $fields){if("$($old.$field)" -cne "$($now.$field)"){$mismatches += "$($old.id):$field"}}
}
if($missing.Count -or $mismatches.Count){throw "Production compatibility failed: missing=$($missing.Count), mismatches=$($mismatches.Count)"}
function Get-ProjectSignature($project) {
  [ordered]@{
    id=$project.id; name=$project.name; description=$project.description; menu_config=$project.menu_config; created_by=$project.created_by; deleted_at=$project.deleted_at
    prototypes=@($project.prototypes|Sort-Object prototype_id|ForEach-Object {[ordered]@{prototype_id=$_.prototype_id;menu_path=$_.menu_path;entry_file=$_.entry_file;version_number=$_.version_number;checkout_user=$_.checkout.user_id}})
    members=@($project.members|Sort-Object user_id|ForEach-Object {[ordered]@{user_id=$_.user_id;role=$_.role}})
  } | ConvertTo-Json -Depth 8 -Compress
}
$baselineProjectSignatures=@($baseline.projects|ForEach-Object {Get-ProjectSignature $_}|Sort-Object)
$currentProjectSignatures=@($currentProjects|ForEach-Object {Get-ProjectSignature $_}|Sort-Object)
if(($baselineProjectSignatures -join "`n") -cne ($currentProjectSignatures -join "`n")){throw 'Project bindings, members, or checkouts drifted after release.'}
$bootstrap = Invoke-RestMethod -Uri "$ApiUrl/api/integrations/agent-bootstrap" -Headers $headers -TimeoutSec 30
if(-not $bootstrap.data.prompt.Contains('check_connection') -or -not $bootstrap.data.prompt.Contains('deliver_project')){throw 'Bootstrap prompt contract failed.'}
$packageHeaders=@{Authorization="Bearer $($bootstrap.data.token)"}
$tempRoot=Join-Path ([IO.Path]::GetTempPath()) "fuxi-release-verify-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $tempRoot|Out-Null
try {
  $skillZip=Join-Path $tempRoot 'skill.zip'; $mcpZip=Join-Path $tempRoot 'mcp.zip'
  Invoke-WebRequest -Uri $bootstrap.data.skillUrl -Headers $packageHeaders -UseBasicParsing -OutFile $skillZip -TimeoutSec 60
  Invoke-WebRequest -Uri $bootstrap.data.mcpUrl -Headers $packageHeaders -UseBasicParsing -OutFile $mcpZip -TimeoutSec 60
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  function Get-ZipEntries([string]$path){$zip=[IO.Compression.ZipFile]::OpenRead($path);try{@($zip.Entries|ForEach-Object FullName)}finally{$zip.Dispose()}}
  $skillEntries=Get-ZipEntries $skillZip; $mcpEntries=Get-ZipEntries $mcpZip
  if('fuxi-prototype/SKILL.md' -notin $skillEntries){throw 'Skill package entry is missing.'}
  if('fuxi-platform-mcp/src/server.js' -notin $mcpEntries -or 'fuxi-platform-mcp/package.json' -notin $mcpEntries){throw 'MCP package entries are missing.'}
  $forbidden=@($skillEntries+$mcpEntries|Where-Object {$_ -match '(^|/)(\.git|node_modules|tests)(/|$)|\.credentials\.json$|\.npmrc$|\.log$'})
  if($forbidden.Count){throw "Distribution package contains forbidden entries: $($forbidden -join ', ')"}
  $skillBytes=(Get-Item $skillZip).Length; $mcpBytes=(Get-Item $mcpZip).Length
} finally {if(Test-Path $tempRoot){Remove-Item -LiteralPath $tempRoot -Recurse -Force}}
$added=@($current|Where-Object {$_.id -notin @($baseline.prototypes|ForEach-Object id)}|ForEach-Object id)
[pscustomobject]@{ok=$true;baselineCount=@($baseline.prototypes).Count;currentCount=$current.Count;oldIdsPreserved=$true;metadataMismatchCount=0;projectState='matched';addedIds=$added;bootstrap='verified';skillPackageBytes=$skillBytes;mcpPackageBytes=$mcpBytes}|ConvertTo-Json -Depth 4
