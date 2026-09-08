# Independent evidence: Skill + MCP Task v2 Freeze

Date: 2026-09-08 UTC  
Role: independent verifier (伏羲·验证)  
Scope: source and local isolated-test evidence only. No product code was changed, and the 「已切主」 gate was not evaluated.

## Verdict

**FAIL**.

The platform-side MCP and review-surface evidence is present, but Freeze E fails under the stated non-terminal-sibling rule: an existing `submitted` sibling with the same `(prototype_id, base_version_number)` remains `submitted` after another candidate is adopted. There are also two independent release blockers: #13 is still open, and Skill tip `8028372` could not be independently fetched.

## Locked coordinates

| Artifact | Locked value | Independently observed fact |
|---|---|---|
| Platform PR #12 | `e6a7a728f512139e9de3ace8c80c6a5d18b939ee` | Merged into `feat/project-management-module`; merge commit verified with `gh pr view 12`. |
| Frontend PR #13 | `a52d6f5582dd03cc08738f80db9c28498e6da11f` | Open head `cursor/pending-revision-review-3f2c`, directly descended from #12; verified with `gh pr view 13` and ancestry. |
| Skill GitLab develop | `8028372` | **Unverified**. The documented GitLab `git ls-remote` probe timed out after 15 seconds (exit 124); no local Skill checkout was available. |

The in-tree files [`docs/skill-patches/fuxi-prototype-task-v2/APPLY.md`](../skill-patches/fuxi-prototype-task-v2/APPLY.md) and [`tools.json`](../skill-patches/fuxi-prototype-task-v2/tools.json) are supporting material only and are not proof of the Skill tip.

## Gate table

| Gate | Result | Evidence |
|---|---|---|
| A/B: project-bound authority | **PASS for MCP/backend contract** | Task responses normalize `taskId` and candidate responses normalize `candidateId` + `taskId` in [`mcp-server/src/server.js`](../../mcp-server/src/server.js#L948-L968). Task v2 tools require task-scoped identifiers in [`server.js`](../../mcp-server/src/server.js#L151-L276). |
| A/B: unbound authority | **PASS** | Unbound MCP status/submit resolve `directChangeId`, with `changeId` retained only as an explicit compatibility alias, and return `authorityField: 'directChangeId'` in [`server.js`](../../mcp-server/src/server.js#L940-L945) and [`server.js`](../../mcp-server/src/server.js#L1468-L1568). |
| A/B/C: bare `changeId` project writes | **PASS for fail-closed enforcement** | All legacy service write methods call `throwLegacyChangeIdForbidden` in [`backend/services/lightweight-collaboration.js`](../../backend/services/lightweight-collaboration.js#L30-L40) and [`lightweight-collaboration.js`](../../backend/services/lightweight-collaboration.js#L235-L238). |
| C: legacy MCP write ban | **PASS** | The three named tools are in the write-forbidden set and dispatch to `LEGACY_CHANGEID_FORBIDDEN` in [`mcp-server/src/server.js`](../../mcp-server/src/server.js#L911-L938) and [`server.js`](../../mcp-server/src/server.js#L1572-L1574). An independent stdio probe called all three with empty arguments; each returned `ok: false` and the exact error code without authenticating. |
| C: checkout/checkin | **PASS as legacy classification** | `checkout_prototype`, `checkin_prototype`, and `force_release_checkout` are explicitly marked legacy and “not required” for the Task v2 flow in [`mcp-server/src/server.js`](../../mcp-server/src/server.js#L405-L422) and [`server.js`](../../mcp-server/src/server.js#L488-L493). |
| Task v2 MCP tool set | **PASS** | All nine required names are declared in [`mcp-server/src/server.js`](../../mcp-server/src/server.js#L151-L276); isolated MCP integration listed and exercised the Task v2 flow in [`mcp-server/tests/integration.js`](../../mcp-server/tests/integration.js#L206-L218) and [`integration.js`](../../mcp-server/tests/integration.js#L640-L690). |
| E: one ready per `taskId` / replacement | **PASS for normal ready submissions** | A successful ready submission stales prior `submitted`/`ready` rows for that task in one transaction in [`backend/services/candidate-review.js`](../../backend/services/candidate-review.js#L258-L288). Backend regression test covers replacement and leaves one ready row in [`backend/tests/candidate-review.test.js`](../../backend/tests/candidate-review.test.js#L167-L179). |
| E: adopt invalidates same `(prototype_id, base)` non-terminal siblings | **FAIL** | The adopt query stales only `status = 'ready'` in [`backend/services/candidate-review.js`](../../backend/services/candidate-review.js#L489-L503), while `submitted` is a valid non-terminal status in [`backend/database/collaboration-schema.js`](../../backend/database/collaboration-schema.js#L449-L466) and is counted as pending elsewhere in [`candidate-review.js`](../../backend/services/candidate-review.js#L139-L143). Independent adversarial setup: same prototype and base, sibling status `submitted`; after adoption, sibling status remained `submitted` rather than `stale`. The adopt operation itself is transaction-wrapped by `BEGIN IMMEDIATE` in [`backend/database/db.js`](../../backend/database/db.js#L734-L753). |
| Frontend #13: formal vs single pending revision | **PASS for the review surface** | The UI exposes `formal` and one `revision` mode in [`frontend/src/views/ProjectPreview.vue`](../../frontend/src/views/ProjectPreview.vue#L44-L48); the review component renders one formal panel, one `pendingRevision`, and history separately in [`frontend/src/components/project/TaskCandidateHistory.vue`](../../frontend/src/components/project/TaskCandidateHistory.vue#L15-L90). The partition helper chooses the latest ready row and moves the rest to history in [`frontend/src/utils/candidate-review.js`](../../frontend/src/utils/candidate-review.js#L50-L66), with coverage in [`frontend/tests/candidate-review.test.js`](../../frontend/tests/candidate-review.test.js#L90-L107). |
| Frontend #13: no bare `changeId` review authority | **PASS for adopt/return review actions; integration caveat below** | Review actions call the Task v2 candidate endpoints with `candidate.id` in [`frontend/src/views/ProjectPreview.vue`](../../frontend/src/views/ProjectPreview.vue#L368-L383) and [`frontend/src/views/ProjectView.vue`](../../frontend/src/views/ProjectView.vue#L750-L797); no legacy `changeId` is used for those decisions. |
| Bound/unbound mutual exclusion | **PASS in exercised service paths** | Bound prototypes are rejected by direct-change `PROTOTYPE_BOUND_TO_PROJECT` in [`backend/services/prototype-direct-changes.js`](../../backend/services/prototype-direct-changes.js#L171-L183); Task creation requires an active project binding in [`backend/services/project-tasks.js`](../../backend/services/project-tasks.js#L134-L142). Independent probe returned `PROTOTYPE_BOUND_TO_PROJECT` for a bound direct write and `TASK_BINDING_INVALID` for an unbound Task write. |
| Skill catalog alignment | **BLOCKED / unverified** | No independent fetch of the locked Skill tip succeeded. The in-tree patch is not treated as proof. |
| Merge gate | **BLOCKED** | PR #13 remains `OPEN`; therefore this evidence cannot be a final PASS for the locked frontend tip. |

## Adversarial notes

1. The green tests do not cover the failing E branch. Backend `npm test` passed 76/76, but the existing test only creates ready siblings; it does not seed a valid `submitted` sibling before adoption.
2. The frontend review IA is aligned, but the surrounding “生成 AI 任务” path still imports and calls legacy project-change writes: [`frontend/src/views/ProjectPreview.vue`](../../frontend/src/views/ProjectPreview.vue#L163-L165) and [`ProjectPreview.vue`](../../frontend/src/views/ProjectPreview.vue#L353-L364), plus the same path in [`frontend/src/views/ProjectView.vue`](../../frontend/src/views/ProjectView.vue#L363-L370) and [`ProjectView.vue`](../../frontend/src/views/ProjectView.vue#L688-L723). Those calls reach `/changes` routes, whose service now deliberately returns `LEGACY_CHANGEID_FORBIDDEN`. This is a functional UI integration gap, not evidence that the forbidden write should be reopened.
3. The legacy MCP probe tested all three required names, including `redeem_change_handoff`, which the existing integration test does not exercise.
4. The direct/unbound path exposes `directChangeId`; the compatibility `changeId` alias is not treated as the authoritative field.

## Verification record

| Check | Result |
|---|---|
| `backend/npm test` | PASS — 76 tests |
| `frontend/npm test` | PASS — 11 tests |
| `frontend/npm run build` | PASS |
| `mcp-server/npm run check` | PASS |
| `mcp-server/npm run test:integration` | PASS — isolated backend, Task v2 flow, legacy write checks, package checks |
| Independent forbidden-tool stdio probe | PASS — all 3 returned `LEGACY_CHANGEID_FORBIDDEN` |
| Independent submitted-sibling adopt probe | **FAIL** — `submitted` remained `submitted` |
| Independent bound/unbound probe | PASS — both sides rejected with the expected contract errors |
| `git diff --check` | PASS |

## Residual risks and unverified scope

- No runtime or live-browser verification was performed against 16077.
- No deployment, GitLab `develop` synchronization, release artifact, Nginx, or production/16088 verification was performed.
- The local MCP integration is isolated and does not prove the distributed Skill catalog or a deployed Skill/MCP ZIP contains tip `8028372`.
- PR #13 is open, so its UI code has not passed a merged-tip verification boundary.
- The `submitted` candidate state is currently not produced by the synchronous happy path, but it remains schema-valid and is treated as pending by service helpers; migration, recovery, or a future asynchronous validator can expose the adoption gap.

## Next Action for Command Center #11

Keep the verdict at **FAIL** and do not check 「已切主」. Require:

1. Correct and independently test adoption invalidation for every non-terminal sibling status covered by the contract, including `submitted`, while preserving the same transaction boundary.
2. Reconcile the project UI’s task-creation path with Task v2, or explicitly document and gate the legacy UI path; do not weaken the backend write ban.
3. Merge PR #13, then independently fetch and verify Skill develop tip `8028372` from the Skill repository.
4. Only after those facts are re-verified should the Command Center reconsider the verdict and proceed to the separate 16077/runtime/deployment evidence stage.
