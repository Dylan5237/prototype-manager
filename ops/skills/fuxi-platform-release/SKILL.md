---
name: fuxi-platform-release
description: Safely inspect, package, deploy, verify, or roll back Fuxi Platform releases on the intranet production host. Use for 伏羲平台发布、生产更新、部署探查、发布包构建、192.168.2.145 上线、PM2/Nginx 切换、生产备份、发布失败回滚，或核对阶段发布门禁。 Default to read-only inspection; never deploy or roll back without explicit user confirmation in the current conversation.
---

# Fuxi Platform Release

Operate the maintainer-only release workflow for Fuxi Platform. Preserve every existing prototype and keep platform code, user-facing Skill source, credentials, and persistent data in separate ownership domains.

## Non-negotiable gates

- Default to inspection. Treat package creation, upload, deploy, rollback, PM2 changes, symlink changes, and backup cleanup as separate actions.
- Require explicit user confirmation immediately before production upload/deploy or rollback. A prior general approval does not satisfy this gate.
- Never print or persist SSH, platform, JWT, registry, or AI-service secret values. Read secrets from process environment only.
- Pin the SSH host key. Stop on a changed fingerprint.
- Never run the legacy in-place `update-intranet.sh` for a new release.
- Never discard production Git changes with `git checkout -- .`, reset, or clean. Snapshot and classify them first.
- Stop before production writes unless a fresh file-level backup and a read-only prototype baseline both exist.
- Write only a new release directory and the release being switched. Never use an existing production prototype as an acceptance target.
- Do not mark success until production bootstrap, Skill/MCP packages, `check_connection`, `deliver_project`, preview, share link, and old-prototype zero-drift checks pass.

## Workflow

1. Read [production-topology.md](references/production-topology.md) before any production operation.
2. For inspection, run `scripts/probe-production.ps1`. It must remain read-only.
3. For a candidate release, ensure both repositories are clean and all intended changes are committed. Run `scripts/build-release.ps1`.
4. Immediately before deployment, run `scripts/capture-production-baseline.ps1` with authenticated platform credentials. Baselines older than one hour are rejected.
5. Review the manifest, checksums, commits, baseline, and verification evidence with the user.
6. After explicit deployment approval, run `scripts/deploy-release.ps1`. It uploads the immutable archive and baseline, then invokes the bundled guarded server deploy script.
7. Run `scripts/verify-production-release.ps1`, then complete the new-only checks from [acceptance-contract.md](references/acceptance-contract.md). Keep the release pending if any evidence is missing.
8. If deployment or acceptance fails, run `scripts/rollback-release.ps1` only after explicit rollback approval. Restore data when the new backend may have written or migrated it.

## Script contract

All PowerShell scripts expose help with `Get-Help <script> -Detailed` and fail closed.

- `build-release.ps1`: run local verification, build frontend, archive committed platform and Skill sources, and emit SHA-256 manifest.
- `probe-production.ps1`: execute bundled read-only Bash probe over pinned PuTTY SSH.
- `capture-production-baseline.ps1`: save authenticated prototype metadata and project bindings without production writes.
- `deploy-release.ps1`: require `-ConfirmProductionDeploy DEPLOY_FUXI_PRODUCTION`, upload archive/scripts, and execute backup/install/switch/health checks.
- `verify-production-release.ps1`: prove old metadata zero drift and verify production bootstrap/package endpoints.
- `rollback-release.ps1`: require `-ConfirmProductionRollback ROLLBACK_FUXI_PRODUCTION`, select an existing server backup/release, and invoke guarded rollback.

Set credentials only in the current process:

```powershell
$env:FUXI_SSH_PASSWORD = '<temporary SSH password>'
$env:FUXI_USERNAME = '<platform acceptance user>'
$env:FUXI_PASSWORD = '<platform acceptance password>'
```

Clear them after the operation. Never place these values in command history, scripts, `.env` committed files, manifests, or reports.

## Failure handling

- Report the exact failed gate and whether production was untouched, backed up only, switched, or automatically restored.
- Preserve the failed release and backup until root cause is understood.
- Do not retry a state-changing step blindly. Re-run read-only probe and compare current release/data state first.
- Treat a production API `404` for `/api/integrations/agent-bootstrap` as “new platform code not deployed,” not as a successful stage-12 result.
