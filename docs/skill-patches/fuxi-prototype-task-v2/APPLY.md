# Skill patch: fuxi-prototype Task v2 catalog

Apply in the Skill repo (`prototype-manager-skills`, entry `fuxi-prototype`), not from this cloud agent.

Current Skill tip noted in the freeze request: `df9a7d9` still catalogs `changeId` only.

This platform PR does **not** mean Skill cache, ZIP distribution, or production MCP onboarding have been updated.

## Exact edits for `fuxi-prototype/cache/tools.json`

1. **Add** these tools (names must match platform MCP):

| name | required args | authority fields in results |
|---|---|---|
| `list_project_nodes` | `projectId` | `nodeId` via node `id` |
| `list_project_tasks` | `projectId` | `taskId` |
| `get_project_task` | `projectId`, `taskId` | `taskId` |
| `create_project_task` | `projectId`, `nodeId`, `bindingId`, `title`, `requirement` | `taskId` |
| `accept_project_task` | `projectId`, `taskId` | `taskId`, optional `handoffCode` |
| `submit_task_candidate` | `projectId`, `taskId`, `zipPath` | `candidateId`, `taskId` |
| `list_task_candidates` | `projectId`, `taskId` | `candidateId[]` |
| `adopt_task_candidate` | `projectId`, `candidateId` | `candidateId`, `taskId` |
| `return_task_candidate` | `projectId`, `candidateId` | `candidateId`, `taskId` |

Optional on create: `responsibleUserId` (defaults to connected user), `participantUserIds`, `versionStrategyType`, `versionStrategyValue`.
Optional on submit: `versionType`, `note`.
Optional on return: `note`.

2. **Keep but mark deprecated / write-forbidden** (do not remove yet, so old sessions fail with a structured code):

- `create_change_handoff`
- `redeem_change_handoff`
- `submit_change_candidate`

Error code to document: `LEGACY_CHANGEID_FORBIDDEN`. Replacement: Task v2 tools above.

3. **Keep read-only compat**: `get_change_status` (`projectId` + `changeId`). Tell agents this is not the main ledger.

4. **Unbound path**: keep `create_prototype_change`, `redeem_prototype_change_handoff`, `get_prototype_change_status`, `submit_prototype_change`. Prefer argument/result field `directChangeId`. `changeId` may remain as alias only.

5. **Legacy, not required for project-bound main flow**: `checkout_prototype`, `checkin_prototype`, `force_release_checkout`.

## Skill markdown tips

Replace project-collaboration recipes that say `redeem_change_handoff` → `submit_change_candidate` with:

`create_project_task` → `accept_project_task` → download `sourceDownloadUrl` → `validate_project` / `pack_project` → `submit_task_candidate` → owner `adopt_task_candidate`.

Never instruct checkout for that path.

## After applying

- Bump Skill cache/hash as that repo requires (`CACHE_VALID` workflow).
- Bind Skill commit to this platform commit in the release record when (and only when) a named environment is actually shipped.
- Do not check Command Center “cutover complete”.
