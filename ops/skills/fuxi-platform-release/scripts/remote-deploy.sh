#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=/zoesoft/fuxi
ARCHIVE=
SHA256=
RELEASE_ID=
BASELINE=
CONFIRM=
PM2_APP=fuxi-backend
PM2_BIN=/root/.npm-global/bin/pm2
export PATH="/usr/local/n/versions/node/20.20.2/bin:/usr/local/bin:/root/.npm-global/bin:/usr/bin:/bin"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    --archive) ARCHIVE="$2"; shift 2 ;;
    --sha256) SHA256="$2"; shift 2 ;;
    --release-id) RELEASE_ID="$2"; shift 2 ;;
    --baseline) BASELINE="$2"; shift 2 ;;
    --confirm) CONFIRM="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
[[ "$CONFIRM" == DEPLOY_FUXI_PRODUCTION ]] || { echo 'Production confirmation missing.' >&2; exit 2; }
[[ "$RELEASE_ID" =~ ^[0-9]{8}-[0-9]{6}-[0-9a-f]{8}$ ]] || { echo 'Invalid release ID.' >&2; exit 2; }
[[ -f "$ARCHIVE" && -f "$BASELINE" && -n "$SHA256" ]] || { echo 'Archive, baseline, or checksum missing.' >&2; exit 2; }
[[ "$ROOT" == /zoesoft/fuxi ]] || { echo 'Unexpected production root.' >&2; exit 2; }
[[ -x "$PM2_BIN" ]] || { echo 'Pinned PM2 executable is missing.' >&2; exit 2; }

PROJECT="$ROOT/fuxi-platform"
RELEASE_ROOT="$ROOT/releases"
SHARED="$ROOT/shared"
BACKUP_ROOT="$ROOT/backups"
NEW_RELEASE="$RELEASE_ROOT/$RELEASE_ID"
LOCK="$ROOT/.release-lock"
BACKUP_ID="$(date +%Y%m%d-%H%M%S)-pre-$RELEASE_ID"
BACKUP="$BACKUP_ROOT/$BACKUP_ID"
STATE=preflight
STOPPED=false
SWITCHED=false
FIRST_MIGRATION=false
PREVIOUS_TARGET=
PREVIOUS_CURRENT="$(readlink -f "$ROOT/current" 2>/dev/null || true)"
SHARED_CREATED=false

cleanup_lock() { rmdir "$LOCK" 2>/dev/null || true; }
restore_data() {
  [[ -f "$BACKUP/persistent.tar.gz" ]] || return 0
  local restore="$BACKUP/restore-tmp"
  rm -rf "$restore"
  mkdir -p "$restore"
  tar -xzf "$BACKUP/persistent.tar.gz" -C "$restore"
  rm -rf "$SHARED/data" "$SHARED/repos" "$SHARED/uploads"
  mv "$restore/data" "$SHARED/data"
  mv "$restore/repos" "$SHARED/repos"
  mv "$restore/uploads" "$SHARED/uploads"
  if [[ -f "$BACKUP/backend.env" ]]; then cp -a "$BACKUP/backend.env" "$SHARED/backend.env"; fi
  rm -rf "$restore"
}
restore_previous() {
  set +e
  if [[ "$SWITCHED" == true ]]; then
    if [[ "$FIRST_MIGRATION" == true && -d "$BACKUP/legacy-tree" ]]; then
      rm -f "$PROJECT"
      mv "$BACKUP/legacy-tree" "$PROJECT"
    elif [[ -n "$PREVIOUS_TARGET" && -d "$PREVIOUS_TARGET" ]]; then
      ln -sfn "$PREVIOUS_TARGET" "$ROOT/.fuxi-platform.rollback"
      mv -Tf "$ROOT/.fuxi-platform.rollback" "$PROJECT"
      restore_data
    fi
    if [[ -n "$PREVIOUS_CURRENT" && -d "$PREVIOUS_CURRENT" ]]; then
      ln -sfn "$PREVIOUS_CURRENT" "$ROOT/.current.rollback"
      mv -Tf "$ROOT/.current.rollback" "$ROOT/current"
    else
      rm -f "$ROOT/current"
    fi
  fi
  if [[ "$SHARED_CREATED" == true ]]; then rm -rf "$SHARED"; fi
  if [[ "$STOPPED" == true ]]; then "$PM2_BIN" restart "$PM2_APP" --update-env >/dev/null 2>&1 || true; fi
  printf 'deployment_status=restored\nfailed_state=%s\nbackup_id=%s\n' "$STATE" "$BACKUP_ID" >&2
}
on_error() { local code=$?; restore_previous; cleanup_lock; exit "$code"; }
trap on_error ERR INT TERM
trap cleanup_lock EXIT

mkdir "$LOCK" 2>/dev/null || { echo 'Another release operation is active.' >&2; exit 3; }
actual_sha="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
[[ "$actual_sha" == "$SHA256" ]] || { echo 'Archive checksum mismatch.' >&2; exit 3; }
[[ -e "$PROJECT" ]] || { echo 'Current production project is missing.' >&2; exit 3; }
[[ ! -e "$NEW_RELEASE" ]] || { echo 'Release ID already exists.' >&2; exit 3; }
node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(!x.capturedAt||!Array.isArray(x.prototypes)||x.prototypes.length===0)process.exit(2);if(Date.now()-Date.parse(x.capturedAt)>3600000)process.exit(3)' "$BASELINE" || { echo 'Production baseline is invalid or older than one hour.' >&2; exit 3; }
active_root="$(readlink -f "$PROJECT")"
[[ -f "$active_root/backend/data/app.db" ]] || { echo 'Production database missing.' >&2; exit 3; }
[[ -d "$active_root/backend/repos" && -d "$active_root/backend/uploads" ]] || { echo 'Persistent directory missing.' >&2; exit 3; }

persistent_bytes="$(du -sb "$active_root/backend/data" "$active_root/backend/repos" "$active_root/backend/uploads" | awk '{s+=$1} END{print s}')"
archive_bytes="$(stat -c '%s' "$ARCHIVE")"
free_bytes="$(df -PB1 "$ROOT" | awk 'NR==2 {print $4}')"
required_bytes=$((persistent_bytes + archive_bytes * 3 + 536870912))
(( free_bytes > required_bytes )) || { echo "Insufficient disk space: free=$free_bytes required=$required_bytes" >&2; exit 3; }

STATE=extract
mkdir -p "$RELEASE_ROOT" "$BACKUP_ROOT"
mkdir "$NEW_RELEASE"
tar -xzf "$ARCHIVE" -C "$NEW_RELEASE"
[[ -f "$NEW_RELEASE/platform/backend/server.js" ]] || { echo 'Release backend entry missing.' >&2; exit 3; }
[[ -f "$NEW_RELEASE/platform/frontend/dist/index.html" ]] || { echo 'Release frontend dist missing.' >&2; exit 3; }
[[ -f "$NEW_RELEASE/platform/mcp-server/src/server.js" ]] || { echo 'Release MCP entry missing.' >&2; exit 3; }
[[ -f "$NEW_RELEASE/skills/fuxi-skyui-prototype/SKILL.md" ]] || { echo 'Release Skill entry missing.' >&2; exit 3; }
[[ "$(node -p "require('$NEW_RELEASE/manifest.json').releaseId")" == "$RELEASE_ID" ]] || { echo 'Manifest release ID mismatch.' >&2; exit 3; }

STATE=install
(cd "$NEW_RELEASE/platform/backend" && npm ci --omit=dev)
node --check "$NEW_RELEASE/platform/backend/server.js"

STATE=backup
mkdir "$BACKUP"
cp -a "$BASELINE" "$BACKUP/production-baseline.json"
printf '%s\n' "$active_root" > "$BACKUP/previous-target"
printf '%s\n' "$RELEASE_ID" > "$BACKUP/candidate-release"
git -C "$active_root" status --porcelain > "$BACKUP/legacy-git-status.txt" 2>/dev/null || true
git -C "$active_root" diff -- backend/package-lock.json frontend/package-lock.json > "$BACKUP/legacy-lockfiles.diff" 2>/dev/null || true
"$PM2_BIN" stop "$PM2_APP"
STOPPED=true
tar -czf "$BACKUP/persistent.tar.gz" -C "$active_root/backend" data repos uploads
tar -tzf "$BACKUP/persistent.tar.gz" >/dev/null
sha256sum "$BACKUP/persistent.tar.gz" > "$BACKUP/persistent.tar.gz.sha256"
if [[ -f "$active_root/backend/.env" ]]; then cp -L "$active_root/backend/.env" "$BACKUP/backend.env"; fi

STATE=shared-data
mkdir -p "$SHARED"
if [[ ! -e "$SHARED/data" && ! -e "$SHARED/repos" && ! -e "$SHARED/uploads" ]]; then
  SHARED_CREATED=true
elif [[ ! -d "$SHARED/data" || ! -d "$SHARED/repos" || ! -d "$SHARED/uploads" || ! -f "$SHARED/backend.env" ]]; then
  echo 'Shared data root is partial; inspect and recover before deployment.' >&2
  false
fi
if [[ ! -d "$SHARED/data" ]]; then cp -a "$active_root/backend/data" "$SHARED/data"; fi
if [[ ! -d "$SHARED/repos" ]]; then cp -a "$active_root/backend/repos" "$SHARED/repos"; fi
if [[ ! -d "$SHARED/uploads" ]]; then cp -a "$active_root/backend/uploads" "$SHARED/uploads"; fi
if [[ ! -f "$SHARED/backend.env" ]]; then
  if [[ -f "$active_root/backend/.env" ]]; then cp -a "$active_root/backend/.env" "$SHARED/backend.env"; else touch "$SHARED/backend.env"; fi
fi
for name in data repos uploads; do
  rm -rf "$NEW_RELEASE/platform/backend/$name"
  ln -s "$SHARED/$name" "$NEW_RELEASE/platform/backend/$name"
done
rm -f "$NEW_RELEASE/platform/backend/.env"
ln -s "$SHARED/backend.env" "$NEW_RELEASE/platform/backend/.env"
set_env() {
  local key="$1" value="$2" temp="$SHARED/.backend.env.tmp"
  grep -v "^${key}=" "$SHARED/backend.env" > "$temp" || true
  printf '%s=%s\n' "$key" "$value" >> "$temp"
  chmod --reference="$SHARED/backend.env" "$temp" 2>/dev/null || chmod 600 "$temp"
  mv "$temp" "$SHARED/backend.env"
}
set_env FUXI_SKILL_DIR "$NEW_RELEASE/skills/fuxi-skyui-prototype"
set_env FUXI_MCP_DIR "$NEW_RELEASE/platform/mcp-server"

STATE=switch
PREVIOUS_TARGET="$active_root"
if [[ ! -L "$PROJECT" ]]; then
  FIRST_MIGRATION=true
  mv "$PROJECT" "$BACKUP/legacy-tree"
  ln -s "$NEW_RELEASE/platform" "$PROJECT"
else
  ln -s "$NEW_RELEASE/platform" "$ROOT/.fuxi-platform.next"
  mv -Tf "$ROOT/.fuxi-platform.next" "$PROJECT"
fi
SWITCHED=true
ln -sfn "$NEW_RELEASE" "$ROOT/.current.next"
mv -Tf "$ROOT/.current.next" "$ROOT/current"

STATE=start
set -a
# shellcheck disable=SC1090
source "$SHARED/backend.env"
set +a
"$PM2_BIN" restart "$PM2_APP" --update-env
STOPPED=false

STATE=health
health=000
for _ in $(seq 1 30); do
  health="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/health 2>/dev/null || echo 000)"
  [[ "$health" == 200 ]] && break
  sleep 1
done
[[ "$health" == 200 ]] || { echo "Backend health failed: $health" >&2; false; }
bootstrap="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/integrations/agent-bootstrap 2>/dev/null || echo 000)"
[[ "$bootstrap" == 401 ]] || { echo "Bootstrap route gate failed: $bootstrap" >&2; false; }
nginx_status="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:16088/ 2>/dev/null || echo 000)"
[[ "$nginx_status" == 200 || "$nginx_status" == 304 ]] || { echo "Nginx gate failed: $nginx_status" >&2; false; }

STATE=complete
trap - ERR INT TERM
rm -f "$ARCHIVE"
rm -f "$BASELINE"
printf 'deployment_status=complete\nrelease_id=%s\nbackup_id=%s\nhealth_status=%s\nbootstrap_route_status=%s\nnginx_status=%s\n' "$RELEASE_ID" "$BACKUP_ID" "$health" "$bootstrap" "$nginx_status"
