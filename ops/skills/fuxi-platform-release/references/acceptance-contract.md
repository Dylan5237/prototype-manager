# Production acceptance contract

Do not mark a release complete without evidence for every item.

## Before write

- Health endpoint succeeds and current PM2 PID/release is recorded.
- All production prototype IDs and key metadata are saved read-only.
- Project bindings and active checkouts are saved read-only.
- File-level backup includes `app.db`, `repos`, `uploads`, backend env, previous tree/release pointer, and checksums.
- Backup is non-empty and the SQLite copy passes an integrity/readability check available on the host.

## Release checks

- Manifest commits and archive SHA-256 match the approved candidate.
- Backend starts from the intended immutable release.
- Frontend asset points to the intended release.
- `/api/health` succeeds through localhost and Nginx.
- Authenticated `/api/integrations/agent-bootstrap` returns `200`.
- Skill and MCP ZIP downloads return `200`; packages contain expected entry files and exclude credentials, `.git`, `node_modules`, tests, and logs.
- Generated prompt requires native client installation, `check_connection`, and `deliver_project`, and does not contain long-lived credentials.

## New-only acceptance prototype

- Build a real SkyUI artifact with the locked private dependency.
- Create a uniquely named acceptance prototype through `deliver_project` mode `create`.
- Update only that new ID through mode `update` with expected version/entry guards.
- Read back entry, version, README, preview, and share-link visitor result.
- Require share redirect `302` and visitor preview `200`.

## Compatibility closeout

- Every pre-release prototype ID still exists.
- Name, description, entry, owner, version, and other agreed key fields have zero drift.
- Project count/bindings/checkouts have no unexplained drift.
- Only the named acceptance prototype is new.
- Record release ID, platform commit, Skill commit, backup ID, evidence, and rollback command in the journey document.
