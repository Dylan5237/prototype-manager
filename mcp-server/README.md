# Fuxi Platform MCP Server

This MCP server exposes Fuxi prototype-management operations to agents through structured tools.

The package also contains `src/bootstrap.js`, a deterministic first-install CLI. It is not an MCP tool
and does not create a separate Fuxi client. The AI host downloads the MCP ZIP once to obtain `bootstrap.js`,
then runs one `install` command; the installer validates the local MCP ZIP, downloads and validates the Skill
ZIP, backs up and updates the host configuration, installs `fuxi-prototype`, performs the first MCP
`check_connection` self-test, and emits one JSON result. The host reload is reported separately as
`reloadRequired`. Repeated installs short-circuit after verifying the completed local installation.

## Configuration

Set these environment variables in the MCP host:

| Variable | Required | Description |
|---|---|---|
| `FUXI_API_URL` | No | Fuxi backend URL, defaults to `http://localhost:3001` |
| `FUXI_CONNECT_CODE` | No | One-time code from the platform "接入平台MCP" dialog. Used only on first connect to exchange a device session. |
| `FUXI_CREDENTIALS_FILE` | No | Path to the local credential file, defaults to `~/.fuxi/mcp-credentials.json`. |
| `FUXI_TOKEN` | No | Legacy short-lived access token from `GET /api/auth/mcp-token`. Takes priority over username/password login but does not auto-refresh. |
| `FUXI_USERNAME` | No | Login username when no connect code, refresh token, or `FUXI_TOKEN` is present. |
| `FUXI_PASSWORD` | No | Login password for the username/password fallback. |
| `FUXI_INSTALL_ROOT` | No | Stable launcher local runtime root; defaults to `~/.fuxi/agent-runtime`. |
| `FUXI_SKILL_TARGET` | No | Native Skill directory to replace after a verified update; defaults to Cursor's `~/.cursor/skills/fuxi-prototype`. |

On first connect, pass `FUXI_CONNECT_CODE` from the platform MCP dialog. The server exchanges it for an access token
and a rotating refresh token, then writes the refresh token to `FUXI_CREDENTIALS_FILE`. Later starts restore the
session from that file and refresh the access token automatically on `401`, so a connected device stays connected
without re-entering the code. The refresh token rotates on every refresh and the session is revocable from the
platform's MCP session list.

For deferred updates, configure the AI client to start `src/launcher.js` instead of `src/server.js`. The launcher
uses the existing device session to claim a scheduled update, downloads the fixed MCP/Skill ZIP artifacts in
parallel, verifies their SHA-256 digests, runs local Smoke checks, replaces the native Skill directory, and only
then starts the MCP server. Startup passes the already refreshed short-lived access token to the child server;
refresh token rotation is protected by a process lock and in-process single-flight. Update logs are written to
stderr so MCP JSON-RPC stdout remains clean. If no update is available, it starts the current installation unchanged.

### Single-instance launcher and refresh single-flight

WorkBuddy/Cursor can spawn many `node` processes against the same `~/.fuxi` credentials. Concurrent refresh of a
rotating refresh token is what turned a healthy session into `INVALID_REFRESH_TOKEN` (#48). This package now
enforces one live MCP instance per identity and one refresh at a time.

**Identity** is `sha256(resolved credentials file + resolved install root + normalized apiUrl)`. Lock files live
next to the credentials file: `mcp-instance-<id>.lock` (owner pid) and `mcp-instance-<id>.json` (launcher/server
pids, paths, `apiUrl`).

**Start strategy**

1. `launcher.js` acquires the instance lock before update/auth work. `server.js` does the same unless the launcher
   already holds it (`FUXI_MCP_INSTANCE_LOCK_HELD=1`) or tests/smoke set `FUXI_MCP_ALLOW_MULTI=1`.
2. A second start for the same identity exits 0 with stderr `MCP_ALREADY_RUNNING pid=… lock=…`. MCP is stdio-only,
   so a later process cannot attach to the first process's JSON-RPC pipe; exiting cleanly avoids a second refresh
   loop. Hosts that spawn duplicates should keep the first instance.
3. If the lock pid is dead, the new process takes over: leftover `serverPid` from the state file is SIGTERM'd
   (then SIGKILL after 1s), the stale lock is removed, and this process becomes the instance.

**Refresh single-flight**

- `${credentialsFile}.refresh.lock` is a cross-process mutex. Waiters block, then re-read the credentials file.
- Unexpired `accessToken` / `accessExpiresAt` (5s skew) skips `/api/auth/mcp/refresh`.
- 401 after a sibling rotation: re-read; reuse a valid access token, or retry once with the new refresh token.
- Dead session (`INVALID_REFRESH_TOKEN` / `SESSION_REVOKED` / `SESSION_EXPIRED`): write a tombstone
  (`reconnectRequired: true`, no refresh token). `FUXI_CONNECT_CODE` can mint a new session; otherwise
  `check_connection` returns `reconnectHint` and does not keep retrying the dead token.

**Atomic credential writes**

Credentials are written to a unique temp file then renamed onto the target (Windows `EPERM`/`EACCES`/`EEXIST`
falls back to copy+replace). Payload keeps the #49 fields: `accessToken`, `accessExpiresAt`, and the dead-token
tombstone.

Escape hatches: `FUXI_MCP_ALLOW_MULTI=1` (tests and update smoke), `FUXI_MCP_INSTANCE_LOCK_HELD=1` (child of
launcher). Skill `fuxi-prototype` does not implement refresh or the launcher, so it does not need a matching change.

## Tools

- `check_connection`: health-check the configured Fuxi backend.
- `list_prototypes`: list accessible prototypes.
- `create_prototype`: create a prototype record.
- `get_prototype`: read prototype detail and files.
- `get_readme`: read extracted README content.
- `get_preview_url`: create or reuse a browser-ready share URL for a prototype.
- `upload_zip`: upload an existing ZIP file as a new prototype version.
- `list_projects`: list accessible collaboration projects.
- `get_project`: read project details, bindings, members, and checkout status.
- `list_project_nodes`: list work/group nodes (`nodeId`) for Task v2.
- `list_project_tasks`: list Task v2 tasks. Authority field: `taskId`.
- `get_project_task`: read one Task v2 task. Authority field: `taskId`.
- `create_project_task`: create the project-bound main-ledger task (`nodeId`, `bindingId`, `title`, `requirement`, optional `responsibleUserId`, version strategy).
- `accept_project_task`: accept the assignment; returns `taskId` and handoff if issued. Checkout is not required.
- `submit_task_candidate`: upload a ZIP for `taskId`. Success returns `candidateId`. A new ready candidate replaces any previous ready candidate on the same task.
- `list_task_candidates`: list `candidate_submissions` for a task.
- `adopt_task_candidate`: owner/admin adopt of `candidateId`; stales sibling ready candidates for the same prototype base.
- `return_task_candidate`: owner/admin return of `candidateId`.
- `create_change_handoff`: **WRITE-FORBIDDEN** (`LEGACY_CHANGEID_FORBIDDEN`). Use `create_project_task`.
- `create_prototype_change`: create an unbound standalone change. Authority field: `directChangeId` (`changeId` is a compat alias).
- `redeem_prototype_change_handoff`: redeem a standalone change handoff.
- `get_prototype_change_status`: read a standalone change by `directChangeId`.
- `submit_prototype_change`: upload a standalone ZIP by `directChangeId`.
- `redeem_change_handoff`: **WRITE-FORBIDDEN** (`LEGACY_CHANGEID_FORBIDDEN`).
- `get_change_status`: **compat READ-ONLY** of `prototype_changes` / `changeId`. Not the project-bound main ledger.
- `submit_change_candidate`: **WRITE-FORBIDDEN** (`LEGACY_CHANGEID_FORBIDDEN`). Use `submit_task_candidate`.
- `bind_prototype_to_project`: bind a prototype into a project menu.
- `checkout_prototype`: **legacy** exclusive checkout. Not required for Task v2.
- `checkin_prototype`: **legacy** check-in. Not required for Task v2.
- `create_snapshot`: create a named project snapshot of menu configuration and bound versions.
- `restore_snapshot`: restore a project snapshot (requires `confirm: true`).
- `delete_prototype`: move a prototype to the recycle bin (requires `confirm: true`).
- `rollback_version`: roll a prototype back to a previous version (requires `confirm: true`).
- `force_release_checkout`: **legacy** force-release; owner/admin only (requires `confirm: true`). Not required for Task v2.
- `validate_project`: validate a local project directory without modifying it.
- `validate_zip`: inspect an existing ZIP without extracting it.
- `pack_project`: build a Fuxi-compatible ZIP from a built project.
- `deliver_project`: safely create/update/project-bound-update one prototype with idempotency, optimistic version checks, checkout protection, and mandatory readback.
- `upload_project`: validate then upload a ZIP to an explicit prototype, then read back the result.

Destructive tools always require `confirm: true`; otherwise they return `CONFIRMATION_REQUIRED`.

## Authority fields and deprecation

This table is the Skill+MCP Task v2 contract on this branch. It is **not** a claim that production cutover is complete.

| Path | Writable ledger | Authority fields | Notes |
|---|---|---|---|
| Unbound prototype | `prototype_direct_changes` | `directChangeId` | `changeId` may appear as a compat alias with the same value. |
| Project-bound | Task v2 `project_tasks` + `candidate_submissions` | `taskId`, `candidateId` | Product model: one formal version vs at most one pending `ready` candidate per `taskId`. New ready submit replaces the previous ready candidate. Adopt stales sibling ready candidates for the same prototype + base version. |
| Legacy `prototype_changes` | **read-only** | `changeId` | Writes return `LEGACY_CHANGEID_FORBIDDEN`. |
| `checkout_prototype` / `checkin_prototype` / `force_release_checkout` | legacy lock | n/a | Must not be required for the project-bound Task v2 main flow. |

Write-forbidden MCP tools (still listed so old Skill caches fail loudly): `create_change_handoff`, `redeem_change_handoff`, `submit_change_candidate`.

## Unified Result Fields

Single-entity tools return a `fields` object alongside the platform payload:

```json
{
  "prototypeId": "abc123",
  "entryFile": "index.html",
  "previewUrl": "http://...",
  "readmeStatus": "present",
  "versionNumber": 1,
  "projectId": null
}
```

List tools (`list_prototypes`, `list_projects`) keep the native array shape for compatibility.

Tool failures return `isError: true` with a stable `error.code`, including authentication, permission, missing-file, invalid-request, connection, and platform-request failures.

## Verification

```bash
npm run check
npm run test:integration
```

The integration test runs a copied backend in a temporary isolated directory. It verifies one-time connect-code
exchange, device-session registration, refresh-token rotation, session revocation, short-lived and expired-token
authentication, all 39 MCP tools (including Task v2 and still-listed legacy changeId tools), local validation and packaging, idempotent create/update/project-bound delivery,
optimistic version and checkout protection, partial-failure reporting, README and browser preview behavior, project
collaboration, destructive-operation confirmation gates, and structured failures. It removes the temporary workspace
afterward and does not modify the platform's current database or prototype repository.
