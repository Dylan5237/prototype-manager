# Skill tip independent evidence (corrected)

## Authority
- GitLab repo: `fuxi/fuxi-prototype-skills`
- Branch: `develop`
- Tip commit: `802837259368319a307041ad11a6d66bfff922ff`
- Subject: `merge: Skill+MCP Task v2 catalog (platform PR #12)`

## Canonical content identity (prefer this)
- Git blob OID: `839bb6293757177f6074297e16fe4948172ff76a`
- Path: `fuxi-prototype/cache/tools.json`
- Size: `25119` bytes (LF)
- SHA256 of blob bytes: `435b0dc74b7b5dce1bb8d156303ee881c061552dd4fb9d79b20b6142e6bf5295`

Verify: `git cat-file blob 839bb6293757177f6074297e16fe4948172ff76a | sha256sum` must equal the SHA256 above. Snapshot file in this folder is that exact blob.

## Corrections (retracted claims)
- `69A5D5BE…` — invalid (PowerShell UTF-8 BOM export)
- `aefd4dc0…` — invalid (CRLF pipe/autocrlf pollution, 26095 bytes)

## Task v2 tools in snapshot
`list_project_nodes`, `list_project_tasks`, `get_project_task`, `create_project_task`, `accept_project_task`, `submit_task_candidate`, `list_task_candidates`, `adopt_task_candidate`, `return_task_candidate`
