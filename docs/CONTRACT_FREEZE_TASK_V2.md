# Contract Freeze: Skill + MCP → Task v2

> 状态：平台实现待评审（open PR）。**不是**生产切流完成、也不是 16088/16077 已切换的事实声明。
> 关联：https://github.com/Dylan5237/prototype-manager/issues/11

## Frozen rules

1. Unbound prototypes: only writable path `prototype_direct_changes`; authority id `directChangeId`.
2. Project-bound: sole main ledger Task v2 (`taskId` + `candidateId` / `candidate_submissions`). Product model: one formal version vs a single pending revision.
3. `prototype_changes` + bare `changeId` MCP write tools: compat period **READ-ONLY / WRITE-FORBIDDEN** + deprecate.
4. `checkout_prototype` / `checkin_prototype` / `force_release_checkout`: legacy; must not be required for the project-bound main flow.
5. At most one pending (`ready`) candidate per `taskId`. A successful new ready submit **replaces** (stales) the previous ready candidate on that task. On adopt, stale sibling ready candidates for the same prototype + base version in the same transaction.
6. Do not claim cutover complete in production docs or Command Center checkboxes.

## Platform behavior on this branch

- Backend Task v2 submit: replace-on-ready.
- Backend Task v2 adopt: existing sibling-stale query retained.
- Backend `/changes` mutating APIs throw `LEGACY_CHANGEID_FORBIDDEN` (409) and point to Task v2 routes/tools.
- `GET /api/projects/:id/changes` remains readable for leftover rows.

## Skill repo

The `fuxi-prototype` Skill (tip historically `df9a7d9`, `changeId`-only) is not applied from this environment. Exact catalog edits live in `docs/skill-patches/fuxi-prototype-task-v2/`.
