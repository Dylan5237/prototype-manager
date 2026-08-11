#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=/zoesoft/fuxi
BACKUP_ID=
RESTORE_DATA=false
CONFIRM=
PM2_APP=fuxi-backend
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    --backup-id) BACKUP_ID="$2"; shift 2 ;;
    --restore-data) RESTORE_DATA=true; shift ;;
    --confirm) CONFIRM="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
[[ "$CONFIRM" == ROLLBACK_FUXI_PRODUCTION ]] || { echo 'Production rollback confirmation missing.' >&2; exit 2; }
[[ "$BACKUP_ID" =~ ^[0-9]{8}-[0-9]{6}-pre-[0-9]{8}-[0-9]{6}-[0-9a-f]{8}$ ]] || { echo 'Invalid backup ID.' >&2; exit 2; }
[[ "$ROOT" == /zoesoft/fuxi ]] || { echo 'Unexpected production root.' >&2; exit 2; }

PROJECT="$ROOT/fuxi-platform"
SHARED="$ROOT/shared"
BACKUP="$ROOT/backups/$BACKUP_ID"
LOCK="$ROOT/.release-lock"
STOPPED=false
[[ -d "$BACKUP" && -f "$BACKUP/previous-target" ]] || { echo 'Backup does not exist or is incomplete.' >&2; exit 3; }
mkdir "$LOCK" 2>/dev/null || { echo 'Another release operation is active.' >&2; exit 3; }
on_error() {
  local code=$?
  if [[ "$STOPPED" == true ]]; then pm2 restart "$PM2_APP" --update-env >/dev/null 2>&1 || true; fi
  printf 'rollback_status=failed\nbackup_id=%s\n' "$BACKUP_ID" >&2
  exit "$code"
}
trap on_error ERR INT TERM
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

previous="$(cat "$BACKUP/previous-target")"
[[ "$previous" == "$ROOT"/* ]] || { echo 'Backup previous target is outside Fuxi root.' >&2; exit 3; }
pm2 stop "$PM2_APP"
STOPPED=true

if [[ -d "$BACKUP/legacy-tree" ]]; then
  [[ -L "$PROJECT" ]] || { echo 'Expected compatibility symlink before first-release rollback.' >&2; exit 3; }
  rm -f "$PROJECT"
  mv "$BACKUP/legacy-tree" "$PROJECT"
  rm -f "$ROOT/current"
else
  [[ -d "$previous" ]] || { echo 'Previous release target is missing.' >&2; exit 3; }
  ln -s "$previous" "$ROOT/.fuxi-platform.rollback"
  mv -Tf "$ROOT/.fuxi-platform.rollback" "$PROJECT"
  release_root="$(dirname "$previous")"
  ln -sfn "$release_root" "$ROOT/.current.rollback"
  mv -Tf "$ROOT/.current.rollback" "$ROOT/current"
  if [[ "$RESTORE_DATA" == true ]]; then
    [[ -f "$BACKUP/persistent.tar.gz" ]] || { echo 'Persistent backup archive missing.' >&2; exit 3; }
    work="$BACKUP/rollback-restore"
    rm -rf "$work"
    mkdir "$work"
    tar -xzf "$BACKUP/persistent.tar.gz" -C "$work"
    rm -rf "$SHARED/data" "$SHARED/repos" "$SHARED/uploads"
    mv "$work/data" "$SHARED/data"
    mv "$work/repos" "$SHARED/repos"
    mv "$work/uploads" "$SHARED/uploads"
    if [[ -f "$BACKUP/backend.env" ]]; then cp -a "$BACKUP/backend.env" "$SHARED/backend.env"; fi
    rm -rf "$work"
  fi
fi

pm2 restart "$PM2_APP" --update-env
STOPPED=false
health=000
for _ in $(seq 1 30); do
  health="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/health 2>/dev/null || echo 000)"
  [[ "$health" == 200 ]] && break
  sleep 1
done
[[ "$health" == 200 ]] || { echo "Rollback health failed: $health" >&2; exit 4; }
trap - ERR INT TERM
printf 'rollback_status=complete\nbackup_id=%s\nrestored_target=%s\ndata_restored=%s\nhealth_status=%s\n' "$BACKUP_ID" "$previous" "$RESTORE_DATA" "$health"
