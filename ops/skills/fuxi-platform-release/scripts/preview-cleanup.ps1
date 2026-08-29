<#
.SYNOPSIS
Builds a read-only cleanup inventory for local, test, and production Fuxi artifacts.

.DESCRIPTION
Lists artifacts and acceptance prototypes without deleting, moving, switching, or
modifying any local or remote target. Credentials must be injected by the shared
linux-server-ops wrapper and are never written to the report.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$OutputPath,
  [string]$MarkdownOutputPath,
  [string]$PlatformRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path,
  [string]$Server = '192.168.2.145',
  [string]$User = 'root',
  [string]$HostKey = 'ssh-ed25519 255 d0:c5:d3:c9:5f:a9:3c:b9:17:3b:6f:5c:e7:1d:61:d1',
  [string]$ApiUrl = 'http://192.168.2.145:3001'
)

$ErrorActionPreference = 'Stop'
$sshPassword = $env:FUXI_SSH_PASSWORD
$username = $env:FUXI_USERNAME
$platformPassword = $env:FUXI_PASSWORD
if ([string]::IsNullOrWhiteSpace($sshPassword)) { throw 'FUXI_SSH_PASSWORD is required in the current process.' }
if ([string]::IsNullOrWhiteSpace($username) -or [string]::IsNullOrWhiteSpace($platformPassword)) {
  throw 'FUXI_USERNAME and FUXI_PASSWORD are required in the current process.'
}

function Get-DirectoryBytes([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return 0L }
  $measure = Get-ChildItem -LiteralPath $Path -File -Force -Recurse -ErrorAction SilentlyContinue |
    Measure-Object -Property Length -Sum
  return [int64]($measure.Sum ?? 0)
}

function Get-LocalChildren([string]$Path, [string]$Kind) {
  if (-not (Test-Path -LiteralPath $Path)) { return @() }
  return @(Get-ChildItem -LiteralPath $Path -Force | ForEach-Object {
    [ordered]@{
      kind = $Kind
      path = $_.FullName
      bytes = if ($_.PSIsContainer) { Get-DirectoryBytes $_.FullName } else { [int64]$_.Length }
      modifiedAt = $_.LastWriteTimeUtc.ToString('o')
      recommendation = 'manual-review'
    }
  })
}

function Quote-Native([string]$Value) { '"' + $Value.Replace('"','\"') + '"' }

$plink = (Get-Command plink.exe -ErrorAction Stop).Source
$remoteScript = Join-Path $PSScriptRoot 'remote-cleanup-inventory.sh'
$remoteSource = (Get-Content -LiteralPath $remoteScript -Raw -Encoding UTF8).Replace("`r`n", "`n")
$info = [Diagnostics.ProcessStartInfo]::new()
$info.FileName = $plink
$info.Arguments = @(
  '-batch', '-ssh', '-hostkey', (Quote-Native $HostKey),
  '-l', (Quote-Native $User), '-pw', (Quote-Native $sshPassword),
  (Quote-Native $Server), (Quote-Native 'bash -s')
) -join ' '
$info.UseShellExecute = $false
$info.RedirectStandardInput = $true
$info.RedirectStandardOutput = $true
$info.RedirectStandardError = $true
$process = [Diagnostics.Process]::new()
$process.StartInfo = $info
if (-not $process.Start()) { throw 'Failed to start plink for cleanup inventory.' }
$stdoutTask = $process.StandardOutput.ReadToEndAsync()
$stderrTask = $process.StandardError.ReadToEndAsync()
$process.StandardInput.Write($remoteSource)
$process.StandardInput.Close()
$process.WaitForExit()
$remoteText = $stdoutTask.Result.TrimEnd()
$remoteError = $stderrTask.Result.Trim()
if ($process.ExitCode -ne 0) {
  throw "Read-only cleanup inventory failed with exit code $($process.ExitCode): $remoteError"
}

$remoteRoots = @()
$remoteItems = @()
foreach ($line in @($remoteText -split "`r?`n")) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $parts = @([regex]::Split($line, "`t"))
  if ($parts[0] -eq 'root' -and $parts.Count -eq 5) {
    $remoteRoots += [ordered]@{
      environment = $parts[1]
      root = $parts[2]
      currentTarget = $parts[3]
      releaseLockExists = $parts[4] -eq 'true'
    }
    continue
  }
  if ($parts[0] -eq 'item' -and $parts.Count -eq 12) {
    $regularFileCount = if ($parts[10] -eq '-') { $null } else { [int]$parts[10] }
    $symlinkCount = if ($parts[11] -eq '-') { $null } else { [int]$parts[11] }
    $persistentPayloadValid = if ($parts[2] -eq 'backup') {
      $regularFileCount -gt 0 -and $symlinkCount -eq 0
    } else {
      $null
    }
    $remoteItems += [ordered]@{
      environment = $parts[1]
      kind = $parts[2]
      name = $parts[3]
      bytes = [int64]$parts[4]
      modifiedAt = [DateTimeOffset]::FromUnixTimeSeconds([int64]$parts[5]).ToString('o')
      isCurrent = $parts[6] -eq 'true'
      manifestOrPersistentExists = $parts[7] -eq 'true'
      candidateRelease = if ($parts[8] -eq '-') { '' } else { $parts[8] }
      previousTarget = if ($parts[9] -eq '-') { '' } else { $parts[9] }
      persistentRegularFileCount = $regularFileCount
      persistentSymlinkCount = $symlinkCount
      persistentPayloadValid = $persistentPayloadValid
      recommendation = if ($parts[6] -eq 'true') {
        'retain-current'
      } elseif ($parts[2] -eq 'backup' -and -not $persistentPayloadValid) {
        'retain-invalid-for-audit-until-replacement-exists'
      } else {
        'manual-review'
      }
    }
    continue
  }
  throw "Unexpected cleanup inventory line: $line"
}

$login = Invoke-RestMethod -Method Post -Uri "$ApiUrl/api/auth/login" -ContentType 'application/json' `
  -Body (@{ username = $username; password = $platformPassword } | ConvertTo-Json) -TimeoutSec 15
$headers = @{ Authorization = "Bearer $($login.data.token)" }
$prototypeResponse = Invoke-RestMethod -Uri "$ApiUrl/api/prototypes?scope=all&pageSize=1000" -Headers $headers -TimeoutSec 60
$acceptancePrototypes = @($prototypeResponse.data | Where-Object {
  [string]$_.name -match '(?i)\[acceptance\]|acceptance|验收'
} | ForEach-Object {
  [ordered]@{
    id = $_.id
    name = $_.name
    version = $_.version
    updatedAt = $_.updated_at
    recommendation = 'manual-review'
  }
})

$untracked = @(& git -C $PlatformRoot ls-files --others --exclude-standard | Where-Object { $_ })
if ($LASTEXITCODE -ne 0) { throw 'Unable to list untracked platform files.' }
$worktrees = @(& git -C $PlatformRoot worktree list --porcelain)
if ($LASTEXITCODE -ne 0) { throw 'Unable to list platform worktrees.' }
$tempRoot = [IO.Path]::GetTempPath()
$tempArtifacts = @(Get-ChildItem -LiteralPath $tempRoot -Directory -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like 'fuxi-release-*' } |
  ForEach-Object {
    [ordered]@{
      kind = 'temporary-release-directory'
      path = $_.FullName
      bytes = Get-DirectoryBytes $_.FullName
      modifiedAt = $_.LastWriteTimeUtc.ToString('o')
      recommendation = 'manual-review'
    }
  })

$report = [ordered]@{
  schema = 'fuxi-cleanup-preview/1'
  generatedAt = [DateTimeOffset]::UtcNow.ToString('o')
  readOnly = $true
  platformRoot = $PlatformRoot
  local = [ordered]@{
    releaseArtifacts = @(Get-LocalChildren (Join-Path $PlatformRoot '.release') 'local-release-artifact')
    backups = @(Get-LocalChildren (Join-Path $PlatformRoot '.backup') 'local-backup')
    temporaryArtifacts = $tempArtifacts
    untrackedFiles = $untracked
    worktrees = $worktrees
  }
  remote = [ordered]@{
    roots = $remoteRoots
    items = $remoteItems
  }
  acceptancePrototypes = $acceptancePrototypes
  deletionPerformed = $false
}

$resolvedOutput = if ([IO.Path]::IsPathRooted($OutputPath)) { $OutputPath } else { Join-Path (Get-Location) $OutputPath }
$parent = Split-Path -Parent $resolvedOutput
if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
[IO.File]::WriteAllText($resolvedOutput, ($report | ConvertTo-Json -Depth 12) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))

$resolvedMarkdown = $null
if ($MarkdownOutputPath) {
  $resolvedMarkdown = if ([IO.Path]::IsPathRooted($MarkdownOutputPath)) { $MarkdownOutputPath } else { Join-Path (Get-Location) $MarkdownOutputPath }
  $markdownParent = Split-Path -Parent $resolvedMarkdown
  if ($markdownParent) { New-Item -ItemType Directory -Force -Path $markdownParent | Out-Null }
  function Escape-Markdown([object]$Value) { ([string]$Value).Replace('|', '\|').Replace("`r", ' ').Replace("`n", ' ') }
  function Format-Megabytes([int64]$Bytes) { '{0:N2}' -f ($Bytes / 1MB) }

  $localGroups = @($report.local.releaseArtifacts | Group-Object {
    $path = [string]$_.path
    if ($path -match '\.manifest\.json$') { 'manifest' }
    elseif ($path -match '\.tar\.gz$') { 'archive' }
    elseif ($path -match '\.json$') { 'json-report' }
    else { 'other' }
  } | ForEach-Object {
    [ordered]@{
      category = $_.Name
      count = $_.Count
      bytes = [int64](($_.Group | Measure-Object bytes -Sum).Sum ?? 0)
    }
  })

  $markdown = [Collections.Generic.List[string]]::new()
  $markdown.Add('# 阶段 20 发布现场清理预览')
  $markdown.Add('')
  $markdown.Add(('- 生成时间：{0}' -f $report.generatedAt))
  $markdown.Add('- 模式：只读；未执行删除、移动、部署、切换或回滚。')
  $markdown.Add(('- 完整机器明细：`{0}`' -f $resolvedOutput))
  $markdown.Add('')
  $markdown.Add('## 结论')
  $markdown.Add('')
  $markdown.Add(('- 本地 `.release`：{0} 项；本地 `.backup`：{1} 项。' -f @($report.local.releaseArtifacts).Count, @($report.local.backups).Count))
  $markdown.Add(('- 服务器 release：{0} 个；生产 backup：{1} 个。' -f @($report.remote.items | Where-Object kind -eq 'release').Count, @($report.remote.items | Where-Object kind -eq 'backup').Count))
  $markdown.Add(('- 验收原型：{0} 个。' -f @($report.acceptancePrototypes).Count))
  $markdown.Add(('- 无效数据备份：{0} 个；这些归档只有 symlink 或没有真实文件，在有效替代备份产生前保留审计，但不得作为可恢复备份。' -f @($report.remote.items | Where-Object { $_.kind -eq 'backup' -and -not $_.persistentPayloadValid }).Count))
  $markdown.Add('- 当前没有任何对象被批准删除。')
  $markdown.Add('')
  $markdown.Add('## 当前 release 指针')
  $markdown.Add('')
  $markdown.Add('| 环境 | 根目录 | current target | release lock |')
  $markdown.Add('|---|---|---|---|')
  foreach ($root in $report.remote.roots) {
    $markdown.Add(('| {0} | `{1}` | `{2}` | {3} |' -f (Escape-Markdown $root.environment), (Escape-Markdown $root.root), (Escape-Markdown $root.currentTarget), $root.releaseLockExists))
  }
  $markdown.Add('')
  $markdown.Add('## 远端 release')
  $markdown.Add('')
  $markdown.Add('| 环境 | release | MB | 修改时间 | current | 建议 |')
  $markdown.Add('|---|---|---:|---|---|---|')
  foreach ($item in @($report.remote.items | Where-Object kind -eq 'release' | Sort-Object environment, modifiedAt -Descending)) {
    $markdown.Add(('| {0} | `{1}` | {2} | {3} | {4} | {5} |' -f (Escape-Markdown $item.environment), (Escape-Markdown $item.name), (Format-Megabytes $item.bytes), (Escape-Markdown $item.modifiedAt), $item.isCurrent, (Escape-Markdown $item.recommendation)))
  }
  $markdown.Add('')
  $markdown.Add('## 生产 backup')
  $markdown.Add('')
  $markdown.Add('| backup | MB | candidate | previous target | 普通文件 | symlink | 数据可恢复 | 建议 |')
  $markdown.Add('|---|---:|---|---|---:|---:|---|---|')
  foreach ($item in @($report.remote.items | Where-Object kind -eq 'backup' | Sort-Object modifiedAt -Descending)) {
    $markdown.Add(('| `{0}` | {1} | `{2}` | `{3}` | {4} | {5} | {6} | {7} |' -f (Escape-Markdown $item.name), (Format-Megabytes $item.bytes), (Escape-Markdown $item.candidateRelease), (Escape-Markdown $item.previousTarget), $item.persistentRegularFileCount, $item.persistentSymlinkCount, $item.persistentPayloadValid, (Escape-Markdown $item.recommendation)))
  }
  $markdown.Add('')
  $markdown.Add('## 验收原型')
  $markdown.Add('')
  $markdown.Add('| ID | 名称 | 版本 | 更新时间 | 建议 |')
  $markdown.Add('|---|---|---:|---|---|')
  foreach ($prototype in $report.acceptancePrototypes) {
    $markdown.Add(('| `{0}` | {1} | {2} | {3} | manual-review |' -f (Escape-Markdown $prototype.id), (Escape-Markdown $prototype.name), (Escape-Markdown $prototype.version), (Escape-Markdown $prototype.updatedAt)))
  }
  $markdown.Add('')
  $markdown.Add('## 本地产物汇总')
  $markdown.Add('')
  $markdown.Add('| 类别 | 数量 | MB |')
  $markdown.Add('|---|---:|---:|')
  foreach ($group in $localGroups) {
    $markdown.Add(('| {0} | {1} | {2} |' -f (Escape-Markdown $group.category), $group.count, (Format-Megabytes $group.bytes)))
  }
  $markdown.Add('')
  $markdown.Add('本地 `.backup`、未跟踪文件、worktree 和逐文件明细保存在机器 JSON 中；未确认前不处理。')
  $markdown.Add('')
  $markdown.Add('## 人工决策门')
  $markdown.Add('')
  $markdown.Add('1. 先通过修正后的发布脚本生成一份真实包含数据文件的新备份，再讨论旧无效备份。')
  $markdown.Add('2. 明确测试 release、生产 release、本地 archive 和生产 backup 的保留数量/期限。')
  $markdown.Add('3. 对三个验收原型逐一决定保留审计或删除；删除前确认没有分享链接或业务引用。')
  $markdown.Add('4. 删除动作必须在完整汇报后再次明确确认，本预览不构成授权。')
  [IO.File]::WriteAllLines($resolvedMarkdown, $markdown, [Text.UTF8Encoding]::new($false))
}

[ordered]@{
  status = 'SUCCEEDED'
  readOnly = $true
  localReleaseCount = @($report.local.releaseArtifacts).Count
  localBackupCount = @($report.local.backups).Count
  localTemporaryCount = @($report.local.temporaryArtifacts).Count
  remoteReleaseCount = @($report.remote.items | Where-Object kind -eq 'release').Count
  remoteBackupCount = @($report.remote.items | Where-Object kind -eq 'backup').Count
  invalidRemoteBackupCount = @($report.remote.items | Where-Object { $_.kind -eq 'backup' -and -not $_.persistentPayloadValid }).Count
  acceptancePrototypeCount = @($report.acceptancePrototypes).Count
  deletionPerformed = $false
  output = $resolvedOutput
  markdownOutput = $resolvedMarkdown
} | ConvertTo-Json
