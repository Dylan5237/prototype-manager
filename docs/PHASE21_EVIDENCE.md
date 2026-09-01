# 阶段 21 本地与远程仓库治理证据

> 执行日期：2026-09-01
>
> 状态：`completed`（只读审计、远端刷新、分支/文件处置预览完成；未执行删除、合并、推送或部署）
>
> 范围：`FuxiPlatform` 与配套 `prototype-manager-skills` 两个独立仓库

## 1. 执行边界

- 已执行 `git fetch --all --tags`，未使用 `--prune`，不删除本地远端引用。
- 已执行 `git ls-remote --heads --tags` 核对服务器实际 refs。
- 仅调整 Skill 仓库本地 `main` 的 upstream，使其跟踪 `zoesoftgitlab/main`；未修改提交和远端。
- 未执行分支删除、worktree 删除、文件移动、GitLab/GitHub push、MR 合并或 16077/16088 部署。

## 2. 服务器实际 refs

### FuxiPlatform

| 远端 | heads | tags |
|---|---|---|
| GitHub `origin` | `master` @ `3809a00`；`feature/project-collaboration` @ `aaa0d5b` | 无 |
| GitLab `zoesoftgitlab` | `main` @ `c1edcab`；`feature/project-collaboration` @ `ed14aaf` | `v1.0.1-beta`（peeled commit `8e80503`） |

### prototype-manager-skills

| 远端 | heads | tags |
|---|---|---|
| GitLab `zoesoftgitlab` | `main` @ `20d9d69` | 无 |

## 3. 本地分支与跟踪关系

### FuxiPlatform

| 分支/ref | 当前 commit | 跟踪/差异 | 处置结论 |
|---|---|---|---|
| `main` | `e1b7e54` | 跟踪 `zoesoftgitlab/main`；本地领先 11、落后 0 | 当前主线；保留，推送待单独确认 |
| `master` | `d8ad2b6` | 跟踪 `origin/master`；本地落后 93 | GitHub 历史线；保留只读，是否移除待决定 |
| `feature/project-collaboration` | `aaa0d5b` | 跟踪 GitLab 同名分支；远端多 2 个提交（`bfc5581`、`ed14aaf`） | 历史协作线；保留，禁止直接合并/删除 |
| `codex/admin-usage-dashboard-20260825` | `6359908` | `main` 的历史祖先，无 upstream | 发布证据历史；保留至引用审计完成，后续可列归档候选 |
| `codex/phase20-backlog-baseline` | `1bbe522` | `main` 的历史祖先，无 upstream | 阶段 20 证据历史；保留至交接完成，后续可列归档候选 |
| `codex/prod-release-v1.0.1-beta-20260828` | `8e80503` | 跟踪 GitLab `main`，落后 1 | release 证据线；与 tag `v1.0.1-beta` 绑定，保留 |
| `codex/test-deploy-cf4970b08f524744b86c82bfb23f05c3` | `8e80503` | 无 upstream | 测试发布证据线；保留至发布记录归档，后续可列归档候选 |
| `v1.0.1-beta` | `8e80503` | 已被 `main` 和两端历史线包含 | 不可变发布证据；保留 |

本地 `main` 的 11 个未推送提交为阶段 20、阶段 21 文档/治理和发布脚本相关提交；本阶段不推送、不重写历史。

### prototype-manager-skills

| 分支/ref | 当前 commit | 跟踪/差异 | 处置结论 |
|---|---|---|---|
| `main` | `20d9d69` | 跟踪 `zoesoftgitlab/main`；领先 0、落后 0 | 当前生产分发主线；保留 |
| `master` | `20d9d69` | 与 `main` 同一提交，无 upstream | 本地兼容别名；是否删除待决定 |

## 4. worktree 与工作区残留

- FuxiPlatform 主 worktree 位于 `D:\_projects\platform\FuxiPlatform`，当前分支 `main`；唯一未跟踪文件为 `linux-server-ops-behavior-report.md`，内容来源和用途可解释，但归档位置仍待人工决定。
- 存在一个 detached Codex worktree：`C:\Users\howyo\.codex\worktrees\bca9\FuxiPlatform` @ `8baaa11`，当前无未提交改动；是否清理不在本阶段自动执行范围。
- Skill 主 worktree 无未跟踪文件或未提交改动。
- 平台 `.release/`、`.backup/`、`backend/data/app.db`、`backend/repos/`、`backend/uploads/`、`frontend/dist/` 均被 `.gitignore` 管理；本次盘点确认其中包含历史 release、备份、测试数据库、上传包和构建产物，未移动或删除。
- 平台 `tmp/` 为空；Skill 的 `dist/`、`node_modules/` 和缓存目录均为忽略的构建/验证产物。

## 5. 文档与规则对齐

- FuxiPlatform 的主线规则已与实际一致：生产来源为 `zoesoftgitlab/main`，GitHub `origin` 不作为生产同步来源。
- 配套 Skill 的 `AGENTS.md` 已将“本地分支 `master`”改为“本地主线 `main`（跟踪 `zoesoftgitlab/main`）”。
- `docs/MCP_SKILLS_EVOLUTION_JOURNEY.md` 和团队协同原型计划中的旧分支描述均带有历史日期/历史计划语义，保留为历史证据，不改写成当前事实。
- 当前阶段事实入口为本文件、[NEXT_ITERATION_PLAN.md](NEXT_ITERATION_PLAN.md)、[BACKLOG.md](BACKLOG.md) 和平台 `AGENTS.md`；生产运行态仍以发布探针和 live verification 为准。

## 6. 阶段 21 验收结论

- [x] 两仓远端引用已刷新，并使用 `ls-remote` 核对服务器实际 heads/tags。
- [x] FuxiPlatform 本地 `main` 跟踪 `zoesoftgitlab/main`；Skill 本地 `main` 已设置跟踪 `zoesoftgitlab/main`。
- [x] 本地/远端分支和 tag 已逐项给出处置结论；历史线未被自动合并或删除。
- [x] 未执行 GitHub 到 GitLab 的自动同步、强制推送或历史重写。
- [x] 未执行任何删除；后续删除仍需针对清单的单独确认。
- [x] 未跟踪报告、detached worktree 和忽略目录均已解释并列出待决边界。
- [x] 现役 README、AGENTS、技术设计和迭代计划已更新为当前主线/下一入口；历史文档保持历史语义。

## 7. 待用户决定

1. 是否将本地 `main` 的 11 个提交推送到 `zoesoftgitlab/main`。
2. GitHub `origin` 及其 `master`/feature 分支是否继续保留为历史只读。
3. 历史 `codex/*`、`feature/project-collaboration`、detached worktree 和 Skill `master` 是否归档或删除。
4. `linux-server-ops-behavior-report.md` 的最终归档位置。

以上决定不由本阶段证据自动授权；在确认前，现场全部保留。
