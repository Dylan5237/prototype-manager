# Issue #59 — Production verifier Bootstrap contract update

Status: FROZEN / READY FOR IMPLEMENTATION  
Control plane: #66  
Phase issue: #59  
Disposer: @Dylan5237  
Reviewer / Orchestrator: ChatGPT  
Implementation owner: local coding Agent

## 1. Mission

Update `ops/skills/fuxi-platform-release/scripts/verify-production-release.ps1` so production post-deploy verification matches the current host-bound Bootstrap contract.

This is a verifier/tooling correction only.

Do not change Bootstrap product behavior to satisfy the verifier.

## 2. Read before editing

Read these first:

1. `AGENTS.md`
2. `.agent-project-ops/PRINCIPLES.md`
3. Issue #59, including the latest Freeze/Dispatch comments
4. Command Center #66
5. `backend/routes/integrations.js`
6. `backend/services/standalone-bootstrap.js`
7. `backend/services/onboarding-hosts.js`
8. `mcp-server/src/bootstrap.js`
9. `ops/skills/fuxi-platform-release/scripts/verify-production-release.ps1`
10. `ops/skills/fuxi-platform-release/scripts/build-release.ps1`
11. Relevant existing tests under `backend/tests/`, `mcp-server/tests/`, and `ops/skills/fuxi-platform-release/tests/`

Follow repository governance. Chat is not project state.

## 3. Work isolation

Use one task / one worktree / one branch:

- Worktree: `.worktrees/59-agent-production-verifier-bootstrap-contract`
- Branch: `fix/59-production-verifier-bootstrap-contract`
- Push topic branch to GitHub `origin` only.
- Do not push to projection remotes.
- Do not commit directly to `main`.

## 4. Frozen implementation scope

Implement only the following:

1. Call the Bootstrap endpoint with an explicit supported host:
   - release smoke path uses `host=workbuddy`.

2. Validate the current Bootstrap response contract:
   - selected host is `workbuddy`;
   - mode is an install-capable mode;
   - `bootstrapSession` exists and is structurally valid;
   - `canonicalOnboarding` exists and is structurally valid;
   - do not rely on obsolete prompt literals such as `deliver_project`.

3. Follow the current short-lived Bootstrap session contract:
   - retrieve the current `fuxi-bootstrap/2` manifest through the Bootstrap session endpoint;
   - validate that the manifest is bound to the selected host;
   - validate the expected artifact metadata.

4. Download MCP and Skill artifacts using the current manifest contract.

5. Verify artifact integrity before ZIP-content checks:
   - file size matches manifest metadata;
   - SHA-256 matches manifest metadata;
   - then preserve existing ZIP-entry and forbidden-entry checks.

6. Preserve all existing production compatibility checks, including:
   - prototype metadata zero-drift checks;
   - project bindings/members/checkouts checks;
   - existing release/source/baseline/signature/health-related gates outside this stale Bootstrap contract;
   - package-entry validation.

7. Secret handling:
   - never print or persist Bootstrap session credential;
   - never print or persist install token;
   - never print or persist connect code;
   - never print or persist JWT, password, refresh token, or equivalent credentials;
   - verification output may report only non-secret structural facts.

8. Add regression coverage for the verifier contract:
   - future removal of explicit host selection must fail;
   - future regression to the legacy Bootstrap shape must fail;
   - future removal of manifest-integrity verification must fail;
   - future reintroduction of obsolete prompt-literal coupling must fail.

9. Wire the verifier-contract regression into the non-Lightweight production build verification path.
   - Do not broaden the lightweight 16077 loop unless an existing repository convention makes that strictly necessary.

## 5. Non-goals

Do not:

- change `/agent-bootstrap` product behavior;
- change Bootstrap session semantics;
- change onboarding-host selection rules;
- refactor unrelated release scripts;
- reopen or modify #43 repository reconciliation work;
- alter Task v2 behavior;
- alter MCP business tools;
- change the companion Skill repository unless inspection proves a contract change is actually required;
- deploy or redeploy 16088;
- run production write operations;
- use production credentials as test fixtures.

If the Skill repo requires no change, explicitly record:

`Skill repo: no change required — #59 is platform release-verifier tooling only.`

## 6. Verification required before PR

Run and record exact commands and results for:

1. the new verifier-contract regression test;
2. PowerShell parse/syntax validation for every touched `.ps1` file;
3. any existing targeted tests affected by the change;
4. any release build/check command needed to prove the new regression test is wired into the full production verification path;
5. `git diff main...HEAD` scope review.

Prove that:

- no unrelated files changed;
- no secret values appear in committed files or test output;
- Bootstrap product behavior did not change;
- the change is limited to verifier/tooling + regression coverage.

Do not claim live production verification unless it was actually run against the active production environment with the required authorized credentials.

## 7. Deliverable

Open exactly one implementation PR against GitHub `main`.

PR description must include:

- link to #59;
- frozen scope summary;
- files changed;
- verification commands and results;
- explicit statement on whether the Skill repo changed;
- explicit statement: `No 16088 deploy performed`;
- remaining evidence gate, if any.

Stop at:

`IMPLEMENTATION READY`

Do not self-merge.  
Do not claim `PHASE PASS`.  
PR merge is not Phase Accept.

## 8. Blocked behavior

If any frozen requirement cannot be implemented without changing Bootstrap/product behavior:

1. stop;
2. do not broaden scope;
3. comment `BLOCKED:` on Issue #59;
4. state the exact contract conflict, files involved, and the smallest decision required.

Do not ask the user broad implementation questions when the repository facts are sufficient.
