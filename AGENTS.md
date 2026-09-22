# 伏羲平台 / prototype-manager — project operations binding

This repository is governed by the pinned `agent-project-ops` snapshot under `.agent-project-ops/`.

- Methodology: `https://github.com/Dylan5237/agent-project-ops`
- PIN: `f9ed33c7fd089480e8459da21805e9a635848c89` (`main`, fetched 2026-09-22T06:21:31Z)
- Disposer: `@Dylan5237`
- Write authority remote: `origin`
- Projection remote: `zoesoftgitlab` (projection of authority; not colleague share-export)
- Colleague GitLab / filtered share: share-export via `.agent-project-ops/scripts/share-export.sh` — never `git push --mirror` from this clone. This repo's GitLab remote is **not** that path (`share_export=(none)`).

## Always load first

Read `.agent-project-ops/PRINCIPLES.md`. Invariants win over convenience. Load the relevant skill wrapper under `.agents/skills/`; it points to the full pinned skill body.

Core rules:

1. Chat is not project state. Durable decisions/status belong on GitHub Issues/PRs/git objects.
2. Agent proposes; the named disposer freezes/Accepts/exceptions. PR merge is not Phase PASS.
3. `origin` (GitHub) is the only write authority. Projection remotes are not a second write path. Colleague GitLab is share-export (filtered business tree), not a projection — and this clone does not register a share-export remote.
4. Unknown remotes fail closed. `.agent-project-ops/remotes` is the clone-portable registry.
5. Topic branches push to `origin` only. Never use a projection as a fallback when `origin` is unavailable. Never push this bound clone to a colleague-share GitLab.
6. One task, one worktree under `.worktrees/`; keep the primary checkout clean for sync/control work.
7. Do not copy business/domain SOP back into the methodology snapshot or upstream methodology repository.

## Git contract (Fuxi disposer — authority vs projection vs deploy identity)

This section **replaces** any older wording that treated GitLab as 生产源码 / 部署事实源 and GitHub as 仅镜像. That inverted contract is forbidden.

| Surface | Remote / URL | Role |
| --- | --- | --- |
| **Write authority / Dev SoT tip** | `origin` → GitHub `Dylan5237/prototype-manager` | **Only write authority.** Issues, PRs, and merges land here. Agent landing and durable decisions only recognize this tip. Default branch `main` after PR merge is the Dev SoT tip. |
| **Projection tip** | `zoesoftgitlab` → `http://192.168.2.145:11980/fuxi/fuxi-platform.git` (GitLab `fuxi/fuxi-platform`) | **Projection of authority**, not write SoT. GitLab `main` may include disposer-allowed **projection merge commits**, so its SHA **may differ** from GitHub `main` **by design**. Do not force-align GitLab `main` SHA onto GitHub `main`. |
| **Deploy / manifest identity** | whatever `deploy-test-from-gitlab.ps1` / `deploy-production-from-gitlab.ps1` actually clones (today: GitLab `develop` → 16077, GitLab `main` → 16088) | Release/deploy may consume a GitLab branch or release-manifest tip. That is **deploy identity**, **not** write authority. Never call a deploy SHA “the source of truth.” |

Hard rules:

- Topic branches (`feat/` `fix/` `docs/` `chore/` `evidence/` `cursor/` …) push to **`origin` only**. Never push features to `zoesoftgitlab` as a workaround when GitHub is inconvenient.
- `develop` on GitLab may fast-forward-track GitHub `main`. Do **not** treat GitLab `develop` (or any GitLab branch) as source of truth.
- Unknown remotes → fail closed until `@Dylan5237` classifies them in `.agent-project-ops/remotes` and on the control-plane Issue.
- Direct push to `main` on authority is forbidden; open a PR on GitHub.
- No silent force push. Force on a default branch requires explicit disposer authorization on the Issue (who / when / from-SHA / to-SHA / why).
- A Cloud or local checkout is a draft until the commit lands on GitHub `origin` via PR.

Command Center (fleet index): [#66](https://github.com/Dylan5237/prototype-manager/issues/66). This binding adoption: [#64](https://github.com/Dylan5237/prototype-manager/issues/64). Historical reconciliation: [#43](https://github.com/Dylan5237/prototype-manager/issues/43).

## Before your first push in this clone

`git clone` does **not** inherit `core.hooksPath`.

Run:

```bash
git config --get core.hooksPath
```

It must print `.githooks`. If it is empty or different, run:

```bash
bash .agent-project-ops/scripts/install-hooks.sh
```

Then check `git remote -v` against `.agent-project-ops/remotes`. If an extra remote is unregistered, stop. If the registry names `zoesoftgitlab` and that remote is not configured locally, restore/confirm it from the recorded project control plane before any **projection** operation. Absence of the remote in this sandbox is not permission to invent a second write URL.

A missing client hook is **not** permission to push `main`. The hook is bypassable; server-side repository policy remains the stronger control.

## Starting work

- No Command Center / first project setup: `.agent-project-ops/playbooks/start-project.md`
- New task: use `.agent-project-ops/scripts/new-worktree.sh` and the worktree playbook.
- Multiple remotes / projection / SHA divergence: load `git-authority-and-projection` before any non-`origin` push.
- Colleague GitLab / business-files-only share: load `share-export`; do **not** reclassify `zoesoftgitlab` as share-export.
- Cannot verify an invariant or remote state: fail closed and record `BLOCKED:` on the active Issue.

## Fuxi product operations

Useful product-ops facts for Agents working this repo. They do **not** override the Git contract above.

### How to run

- Backend: `cd backend && npm install && npm start` (port 3001, SQLite)
- Frontend: `cd frontend && npm install && npm run dev` (port 3000)
- MCP: `cd mcp-server && node src/server.js` (stdio; needs `FUXI_API_URL` + `FUXI_TOKEN` or the connect-code flow)
- Frontend production build: `cd frontend && npm run build` (Vite; current package script does not run `vue-tsc`)

Do not write credentials, passwords, or long-lived tokens into the repo or docs.

### Stack and layout

Vue 3.3 + Vite 5 + Element Plus 2.4 (frontend); Node.js + Express 4 + sql.js 1.14 (backend); Node.js stdio MCP (`mcp-server`).

- `backend/` — API routes, services, SQLite; data in `backend/data/app.db` and `backend/repos/`
- `frontend/` — Vue SPA; pages in `src/views/`; API wrappers in `src/api/`
- `mcp-server/` — Agent-facing MCP tools; source in `src/server.js`
- `ops/skills/fuxi-platform-release/` — maintainer release skill (read-only precheck, immutable release, backup, rollback)
- `docs/` — durable product facts (`TECHNICAL_DESIGN.md`, `MCP_SKILLS_EVOLUTION_JOURNEY.md`, `BACKLOG.md`)
- `.backup/` and `.release/` — local backup/release artifacts; gitignored
- Backlog / deferred debt: `docs/BACKLOG.md` only. Do not expand that list in this file.

### Bilateral analysis with the companion Skill repo

Companion Skill repo path (if still present on the disposer workstation): `D:\_projects\skills\prototype-manager-skills`. Skill entry: `fuxi-prototype`.

Any requirement must be analyzed against **both** this platform repo and the companion Skill repo. Check API/tool contracts, entry directories, distribution zip, version/hash, runtime profile, and acceptance path. Default to a cross-repo assessment when the change touches platform APIs, MCP tools, Skill entry, ZIP distribution, runtime profile, or install flow.

If both sides change: commit and verify separately; bind platform commit and Skill commit in the release record. If only one side changes: record why the other side needs no change.

Skill-repo AGENTS / remote contract is **out of scope** for this file. Skill 16077/16088 scripts that still fresh-clone GitLab consume a **deploy/manifest tip**, not a write SoT.

### Conventional Commits

Fuxi habit on this repo:

- `type(scope): 中文标题`
- Body: 现象 / 根因 → 改法
- Footer: `Co-Authored-By: Codex <noreply@openai.com>` when that trailer is part of the task's commit convention
- One independent task → one commit. Before commit, run the tests/build/MCP/docs checks that the change scope requires.

### Deploy identity (not write authority)

- 16077 test deploys (authorized 2026-09-02 for subsequent test deploys without per-run confirmation) still run `deploy-test-from-gitlab.ps1` (or `quick-deploy-test.ps1`): fresh-clone platform + Skill from GitLab `develop`, then immutable archive / SHA-256 / remote backup / Nginx health. That clone is **deploy identity**. Do not pack an arbitrary worktree. This authorization does **not** include 16088 production publish, remote push, delete, or rollback.
- 16088 production publish uses the full build / MCP / production-baseline gates and today still fresh-clones GitLab `main` as the production **deploy/manifest tip**. Same rule: deploy identity ≠ write authority.
- Claiming a test or production release is shippable requires the consumed GitLab tip to be a projection of the intended GitHub authority tip (fast-forward, or a disposer-recorded projection merge). Projection failure stops the release; it does not justify pushing features to GitLab.
