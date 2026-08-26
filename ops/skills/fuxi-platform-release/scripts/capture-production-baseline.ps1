<#
.SYNOPSIS
Captures an authenticated read-only Fuxi production baseline.
#>
[CmdletBinding()]
param(
  [string]$ApiUrl = 'http://192.168.2.145:3001',
  [Parameter(Mandatory)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$username = $env:FUXI_USERNAME
$password = $env:FUXI_PASSWORD
if ([string]::IsNullOrWhiteSpace($username) -or [string]::IsNullOrWhiteSpace($password)) { throw 'FUXI_USERNAME and FUXI_PASSWORD are required in the current process.' }
$login = Invoke-RestMethod -Method Post -Uri "$ApiUrl/api/auth/login" -ContentType 'application/json' -Body (@{username=$username;password=$password}|ConvertTo-Json) -TimeoutSec 15
$headers = @{Authorization="Bearer $($login.data.token)"}
$prototypeResponse = Invoke-RestMethod -Uri "$ApiUrl/api/prototypes?scope=all&pageSize=1000" -Headers $headers -TimeoutSec 60
$projectResponse = Invoke-RestMethod -Uri "$ApiUrl/api/projects" -Headers $headers -TimeoutSec 30
$projectDetails = foreach($project in @($projectResponse.data)) {
  (Invoke-RestMethod -Uri "$ApiUrl/api/projects/$($project.id)" -Headers $headers -TimeoutSec 30).data
}
$baseline = [ordered]@{
  schemaVersion = 1
  capturedAt = [DateTimeOffset]::UtcNow.ToString('o')
  apiUrl = $ApiUrl
  prototypeTotal = [int]$prototypeResponse.total
  prototypes = @($prototypeResponse.data)
  projects = @($projectDetails)
}
if ($baseline.prototypeTotal -ne $baseline.prototypes.Count) { throw 'Prototype pagination is incomplete; baseline not written.' }
$parent = Split-Path -Parent $OutputPath
if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
[IO.File]::WriteAllText((Join-Path (Get-Location) $OutputPath), ($baseline|ConvertTo-Json -Depth 12), [Text.UTF8Encoding]::new($false))
[pscustomobject]@{capturedAt=$baseline.capturedAt;prototypeTotal=$baseline.prototypeTotal;projectTotal=$baseline.projects.Count;output=(Resolve-Path $OutputPath).Path}|ConvertTo-Json
