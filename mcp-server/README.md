# Fuxi Platform MCP Server

This MCP server exposes Fuxi prototype-management operations to agents through structured tools.

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
uses the existing device session to claim a scheduled update, downloads the fixed MCP/Skill ZIP artifacts, verifies
their SHA-256 digests, runs local Smoke checks, replaces the native Skill directory, and only then starts the MCP
server. Update logs are written to stderr so MCP JSON-RPC stdout remains clean. If no update is available, it starts
the current installation unchanged.

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
- `create_change_handoff`: create a one-time task handoff for a project-bound prototype.
- `create_prototype_change`: create a one-time task handoff for an independent prototype change.
- `redeem_prototype_change_handoff`: redeem an independent-prototype task handoff and receive the source download contract.
- `get_prototype_change_status`: read an independent-prototype change status.
- `submit_prototype_change`: upload an independent-prototype candidate ZIP.
- `redeem_change_handoff`: redeem a project task handoff and receive the source download contract.
- `get_change_status`: read a project change status.
- `submit_change_candidate`: upload a project candidate ZIP for owner/admin review.
- `bind_prototype_to_project`: bind a prototype into a project menu.
- `checkout_prototype`: check out a bound project prototype for exclusive editing.
- `checkin_prototype`: check in a project prototype checked out by the current user.
- `create_snapshot`: create a named project snapshot of menu configuration and bound versions.
- `restore_snapshot`: restore a project snapshot (requires `confirm: true`).
- `delete_prototype`: move a prototype to the recycle bin (requires `confirm: true`).
- `rollback_version`: roll a prototype back to a previous version (requires `confirm: true`).
- `force_release_checkout`: force-release a checked-out prototype; owner/admin only (requires `confirm: true`).
- `validate_project`: validate a local project directory without modifying it.
- `validate_zip`: inspect an existing ZIP without extracting it.
- `pack_project`: build a Fuxi-compatible ZIP from a built project.
- `deliver_project`: safely create/update/project-bound-update one prototype with idempotency, optimistic version checks, checkout protection, and mandatory readback.
- `upload_project`: validate then upload a ZIP to an explicit prototype, then read back the result.

Destructive tools always require `confirm: true`; otherwise they return `CONFIRMATION_REQUIRED`.

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
authentication, all 30 MCP tools, local validation and packaging, idempotent create/update/project-bound delivery,
optimistic version and checkout protection, partial-failure reporting, README and browser preview behavior, project
collaboration, destructive-operation confirmation gates, and structured failures. It removes the temporary workspace
afterward and does not modify the platform's current database or prototype repository.
