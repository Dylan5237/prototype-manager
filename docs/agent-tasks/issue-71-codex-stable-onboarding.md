# Issue #71 — Codex stable onboarding implementation task

Status: FROZEN / READY FOR IMPLEMENTATION  
Control plane: #66  
Phase issue: #71  
Disposer: @Dylan5237  
Reviewer / Orchestrator: ChatGPT  
Implementation owner: local coding Agent

## 1. Mission

Make Codex a stable, deterministic first-class onboarding Host for Fuxi.

Target user path:

`伏羲选择 Codex -> canonical onboarding prompt -> bootstrap install -> Codex MCP + Skill installed to official user locations -> reload/restart Codex -> check_connection verified + fuxi-prototype Skill discoverable`

Primary acceptance environment for this Phase: Windows 11 + current Codex local client family.

Do not reuse Cursor/WorkBuddy paths, do not guess directories, and do not redesign unrelated onboarding UX.

## 2. Read before editing

Read these first:

1. `AGENTS.md`
2. `.agent-project-ops/PRINCIPLES.md`
3. Issue #71, including latest comments
4. Command Center #66
5. `backend/services/onboarding-hosts.js`
6. `backend/routes/integrations.js`
7. `backend/services/standalone-bootstrap.js`
8. `mcp-server/src/bootstrap.js`
9. existing bootstrap/backend integration tests
10. relevant frontend onboarding code only if required to enable Codex install mode

Also verify the current official Codex contract before coding. Treat official OpenAI Codex documentation as the authority for Codex-owned paths and formats.

Current frozen external contract:
- user MCP config: `~/.codex/config.toml`
- MCP server config model: `[mcp_servers.<server-name>]`
- user Skill root: `$HOME/.agents/skills`
- Codex local clients share the Codex MCP config model

If current official documentation contradicts any frozen external fact, STOP and comment `BLOCKED:` on #71 with the exact conflict. Do not guess.

## 3. Work isolation

Use:

- Worktree: `.worktrees/codex-stable-onboarding`
- Branch: `feat/codex-stable-onboarding`
- One implementation PR against GitHub `main`
- Push topic branch to `origin` only
- No direct push to `main`

## 4. Frozen implementation scope

### A. Host model

Promote Codex to a deterministic install Host:

- `id=codex`
- `mode=install`
- `client=codex`

Provide Codex-specific prompt guidance.

Do not add auto Host detection.

### B. Codex MCP target

Add `codex` client support in Bootstrap.

Canonical user target:

`~/.codex/config.toml`

Requirements:

1. Use TOML, not JSON.
2. Preserve unrelated existing Codex settings.
3. Preserve unrelated existing MCP servers.
4. Only own/update the Fuxi MCP server entry.
5. Repeated onboarding is idempotent.
6. Malformed/unsupported existing config fails closed with a specific structured error.
7. Backup/rollback behavior remains valid.
8. Do not silently replace the whole config file with a generated minimal config.

Do not add arbitrary path overrides to the user prompt.

### C. Codex Skill target

Canonical user target:

`$HOME/.agents/skills/fuxi-prototype`

Requirements:

- install/update the distributed `fuxi-prototype` Skill there;
- keep existing installer integrity verification;
- do not reuse `.cursor/skills` or `.workbuddy/skills`;
- preserve idempotent install semantics.

### D. Existing Host compatibility

WorkBuddy and Cursor behavior must remain unchanged.

Do not refactor those Host profiles except where a minimal shared abstraction is necessary for Codex support.

If a shared refactor is necessary, keep it narrow and prove no behavioral regression.

## 5. Required automated coverage

Add/extend tests for at least:

1. Codex host is exposed as install-capable and bound to client `codex`.
2. Codex MCP target resolves deterministically to the user `config.toml`.
3. Codex Skill target resolves deterministically to `$HOME/.agents/skills/fuxi-prototype`.
4. Empty/new Codex config.
5. Existing unrelated top-level Codex settings are preserved.
6. Existing unrelated MCP servers are preserved.
7. Existing Fuxi MCP entry is updated without duplication.
8. Repeated install is idempotent.
9. Malformed TOML fails closed.
10. Failure rollback restores prior Codex config.
11. Windows path behavior.
12. WorkBuddy bootstrap regression remains green.
13. Cursor bootstrap regression remains green.
14. backend onboarding/bootstrap integration supports `host=codex`.

Do not claim Host E2E from mocks/unit tests.

## 6. Host E2E acceptance gate

Implementation PR may stop at `IMPLEMENTATION READY` after automated verification.

Phase PASS additionally requires a real controlled Windows Codex run proving:

1. Select Codex in Fuxi.
2. Generate the canonical Codex onboarding prompt.
3. Execute the single canonical onboarding entry without manually editing paths.
4. Bootstrap reaches COMPLETE.
5. Existing unrelated Codex config remains intact.
6. Fuxi MCP is present in Codex configuration.
7. `fuxi-prototype` exists in the official user Skill root.
8. Reload/restart Codex if required.
9. In the reloaded/new Codex session, Fuxi MCP is visible.
10. `check_connection({})` returns `ok=true` and `authentication=verified`.
11. `fuxi-prototype` is discoverable/invocable.

If UI/restart action cannot be performed by the local Agent, stop with:

`USER_ACTION_REQUIRED`

Ask only for the exact required user action. Do not assign screenshot or visual-review work to the local Agent.

## 7. Non-goals

Do not:

- resume #59 production verifier live evidence;
- advance #40 / evaluation denominator work;
- implement #32 onboarding dialog polish except the minimum required for Codex install mode;
- rewrite Help content (#34);
- fix Cursor Windows EPERM (#33) unless a shared change is strictly required and explicitly approved;
- redesign MCP auth;
- add auto-detection;
- deploy 16088;
- modify production data;
- broaden into generic support for every AI Host.

## 8. Verification before PR

Run and record exact commands/results for:

- targeted Codex bootstrap tests;
- existing full Bootstrap test suite;
- backend onboarding/integration tests affected by Codex;
- MCP integration/check gates required by existing repository conventions;
- frontend tests/build only if frontend files changed;
- syntax/static checks for touched files;
- `git diff --check`;
- diff against current GitHub `main`.

Prove:

- no unrelated scope;
- no credential/token/connect-code values in committed files or test logs;
- WorkBuddy/Cursor regressions remain green;
- Codex config preservation/idempotency/fail-closed behavior is covered.

## 9. Deliverable

Open one implementation PR against GitHub `main`.

PR must include:

- link to #71;
- frozen scope summary;
- files changed;
- exact verification commands/results;
- explicit Codex config/Skill target contract;
- regression evidence for WorkBuddy/Cursor;
- explicit statement: `No production deploy performed`;
- Host E2E status: completed or pending `USER_ACTION_REQUIRED`.

Stop at:

`IMPLEMENTATION READY`

Do not self-merge.  
Do not claim `PHASE PASS`.  
PR merge != Phase Accept.

## 10. Blocked behavior

If stable Codex support requires a contract change outside #71:

1. stop;
2. do not broaden scope;
3. comment `BLOCKED:` on #71;
4. provide exact evidence and the smallest decision needed.

Do not invent compatibility behavior merely to make tests pass.
