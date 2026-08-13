#!/usr/bin/env bash
set -Eeuo pipefail

# Deploy an immutable release to the isolated 16077 test environment.
# It shares the release-archive format with production but never touches
# /zoesoft/fuxi production data, PM2 app, or Nginx 16088 site.

ROOT=/zoesoft/fuxi-test
PROD_ROOT=/zoesoft/fuxi
ARCHIVE=
SHA256=
RELEASE_ID=
CONFIRM=
INIT_DATA=
FILTER_USER=wushengzhi
FILTER_SCRIPT=
PM2_APP=fuxi-backend-test
PM2_BIN=/root/.npm-global/bin/pm2
export PATH="/usr/local/n/versions/node/20.20.2/bin:/usr/local/bin:/root/.npm-global/bin:/usr/bin:/bin"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    --archive) ARCHIVE="$2"; shift 2 ;;
    --sha256) SHA256="$2"; shift 2 ;;
    --release-id) RELEASE_ID="$2"; shift 2 ;;
    --filter-user) FILTER_USER="$2"; shift 2 ;;
    --filter-script) FILTER_SCRIPT="$2"; shift 2 ;;
    --confirm) CONFIRM="$2"; shift 2 ;;
    --init-data) INIT_DATA="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
[[ "$CONFIRM" == DEPLOY_FUXI_TEST ]] || { echo 'Test deployment confirmation missing.' >&2; exit 2; }
[[ "$RELEASE_ID" =~ ^[0-9]{8}-[0-9]{6}-[0-9a-f]{8}$ ]] || { echo 'Invalid release ID.' >&2; exit 2; }
[[ -f "$ARCHIVE" && -n "$SHA256" ]] || { echo 'Archive or checksum missing.' >&2; exit 2; }
[[ "$ROOT" == /zoesoft/fuxi-test ]] || { echo 'Unexpected test root.' >&2; exit 2; }
[[ -x "$PM2_BIN" ]] || { echo 'Pinned PM2 executable is missing.' >&2; exit 2; }
[[ -d "$PROD_ROOT/shared/data" ]] || { echo 'Production snapshot source is missing.' >&2; exit 2; }

PROJECT="$ROOT/fuxi-platform"
RELEASE_ROOT="$ROOT/releases"
SHARED="$ROOT/shared"
BACKUP_ROOT="$ROOT/backups"
NEW_RELEASE="$RELEASE_ROOT/$RELEASE_ID"
LOCK="$ROOT/.release-lock"
BACKUP_ID="$(date +%Y%m%d-%H%M%S)-pre-test-$RELEASE_ID"
BACKUP="$BACKUP_ROOT/$BACKUP_ID"
STATE=preflight
STOPPED=false
SWITCHED=false
PREVIOUS_TARGET=
PREVIOUS_CURRENT="$(readlink -f "$ROOT/current" 2>/dev/null || true)"

cleanup_lock() { rmdir "$LOCK" 2>/dev/null || true; }
restore_previous() {
  set +e
  if [[ "$SWITCHED" == true ]]; then
    if [[ -n "$PREVIOUS_TARGET" && -d "$PREVIOUS_TARGET" ]]; then
      ln -sfn "$PREVIOUS_TARGET" "$ROOT/.fuxi-platform.rollback"
      mv -Tf "$ROOT/.fuxi-platform.rollback" "$PROJECT"
    else
      rm -f "$PROJECT"
    fi
    if [[ -n "$PREVIOUS_CURRENT" && -d "$PREVIOUS_CURRENT" ]]; then
      ln -sfn "$PREVIOUS_CURRENT" "$ROOT/.current.rollback"
      mv -Tf "$ROOT/.current.rollback" "$ROOT/current"
    else
      rm -f "$ROOT/current"
    fi
  fi
  if [[ "$STOPPED" == true ]]; then "$PM2_BIN" restart "$PM2_APP" --update-env >/dev/null 2>&1 || true; fi
  printf 'deployment_status=restored\nfailed_state=%s\nbackup_id=%s\n' "$STATE" "$BACKUP_ID" >&2
}
on_error() { local code=$?; restore_previous; cleanup_lock; exit "$code"; }
trap on_error ERR INT TERM
trap cleanup_lock EXIT

mkdir "$LOCK" 2>/dev/null || { echo 'Another test release operation is active.' >&2; exit 3; }
actual_sha="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
[[ "$actual_sha" == "$SHA256" ]] || { echo 'Archive checksum mismatch.' >&2; exit 3; }
[[ ! -e "$NEW_RELEASE" ]] || { echo 'Test release ID already exists.' >&2; exit 3; }
node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(!x.releaseId)process.exit(2)' "$ARCHIVE" 2>/dev/null || true

STATE=extract
mkdir -p "$RELEASE_ROOT" "$BACKUP_ROOT" "$SHARED"
mkdir "$NEW_RELEASE"
tar -xzf "$ARCHIVE" -C "$NEW_RELEASE"
[[ -f "$NEW_RELEASE/platform/backend/server.js" ]] || { echo 'Test release backend entry missing.' >&2; exit 3; }
[[ -f "$NEW_RELEASE/platform/frontend/dist/index.html" ]] || { echo 'Test release frontend dist missing.' >&2; exit 3; }
[[ -f "$NEW_RELEASE/platform/mcp-server/src/server.js" ]] || { echo 'Test release MCP entry missing.' >&2; exit 3; }
[[ -f "$NEW_RELEASE/skills/fuxi-skyui-prototype/SKILL.md" ]] || { echo 'Test release Skill entry missing.' >&2; exit 3; }

STATE=install
(cd "$NEW_RELEASE/platform/backend" && npm ci --omit=dev)
node --check "$NEW_RELEASE/platform/backend/server.js"

if [[ "$INIT_DATA" == true ]]; then
  [[ -f "$FILTER_SCRIPT" ]] || { echo 'Data filter script is missing.' >&2; exit 3; }
  STATE=init-data
  # Initialize isolated test data from the production snapshot, keeping only the
  # filter user's prototypes while copying all system-level data.
  if [[ -e "$SHARED/data/app.db" ]]; then
    echo 'Test data already initialized; refusing to overwrite.' >&2
    exit 3
  fi
  FILTERED_IDS="$(mktemp)"
  node "$FILTER_SCRIPT" \
    "$PROD_ROOT/shared/data/app.db" "$SHARED/data/app.db" "$FILTER_USER" \
    "$NEW_RELEASE/platform/backend/node_modules/sql.js/dist/sql-wasm.js" > "$FILTERED_IDS"
  mkdir -p "$SHARED/repos" "$SHARED/uploads"
  while IFS= read -r prototype_id; do
    [[ -z "$prototype_id" ]] && continue
    if [[ -d "$PROD_ROOT/shared/repos/$prototype_id" ]]; then
      cp -a "$PROD_ROOT/shared/repos/$prototype_id" "$SHARED/repos/$prototype_id"
    fi
  done < <(awk '!x[$0]++' "$FILTERED_IDS" | sed '/^[[:space:]]*$/d')
  rm -f "$FILTERED_IDS"
fi

STATE=link
# Link the isolated test release to its own shared data, mirroring production layout.
for name in data repos uploads; do
  rm -rf "$NEW_RELEASE/platform/backend/$name"
  ln -s "$SHARED/$name" "$NEW_RELEASE/platform/backend/$name"
done
rm -f "$NEW_RELEASE/platform/backend/.env"
ln -s "$SHARED/backend.env" "$NEW_RELEASE/platform/backend/.env"
if [[ ! -f "$SHARED/backend.env" ]]; then
  printf 'PORT=3002\nJWT_SECRET=%s\nFUXI_SKILL_DIR=%s\nFUXI_MCP_DIR=%s\n' \
    "$(openssl rand -hex 32)" \
    "$NEW_RELEASE/skills/fuxi-skyui-prototype" \
    "$NEW_RELEASE/platform/mcp-server" > "$SHARED/backend.env"
  chmod 600 "$SHARED/backend.env"
fi
set_env() {
  local key="$1" value="$2" temp="$SHARED/.backend.env.tmp"
  grep -v "^${key}=" "$SHARED/backend.env" > "$temp" || true
  printf '%s=%s\n' "$key" "$value" >> "$temp"
  chmod 600 "$temp"
  mv "$temp" "$SHARED/backend.env"
}
set_env FUXI_SKILL_DIR "$NEW_RELEASE/skills/fuxi-skyui-prototype"
set_env FUXI_MCP_DIR "$NEW_RELEASE/platform/mcp-server"

STATE=switch
PREVIOUS_TARGET="$(readlink -f "$PROJECT" 2>/dev/null || true)"
if [[ -n "$PREVIOUS_TARGET" && -d "$PREVIOUS_TARGET" ]]; then
  ln -s "$NEW_RELEASE/platform" "$ROOT/.fuxi-platform.next"
  mv -Tf "$ROOT/.fuxi-platform.next" "$PROJECT"
else
  ln -s "$NEW_RELEASE/platform" "$PROJECT"
fi
SWITCHED=true
ln -sfn "$NEW_RELEASE" "$ROOT/.current.next"
mv -Tf "$ROOT/.current.next" "$ROOT/current"

STATE=nginx
NGINX_SITE=/etc/nginx/sites-available/fuxi-test
if [[ ! -f "$NGINX_SITE" ]]; then
  cat > "$NGINX_SITE" <<'EOF'
server {
    listen 16077;
    server_name _;

    location / {
        root /zoesoft/fuxi-test/fuxi-platform/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /preview/ {
        proxy_pass http://localhost:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    client_max_body_size 100M;
}
EOF
  ln -sfn "$NGINX_SITE" /etc/nginx/sites-enabled/fuxi-test
fi
nginx -t
nginx -s reload

STATE=start
set -a
# shellcheck disable=SC1090
source "$SHARED/backend.env"
set +a
if "$PM2_BIN" describe "$PM2_APP" >/dev/null 2>&1; then
  "$PM2_BIN" restart "$PM2_APP" --update-env
else
  "$PM2_BIN" start "$PROJECT/backend/server.js" --name "$PM2_APP"
fi
"$PM2_BIN" save
STOPPED=false

STATE=health
health=000
for _ in $(seq 1 30); do
  health="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/api/health 2>/dev/null || echo 000)"
  [[ "$health" == 200 ]] && break
  sleep 1
done
[[ "$health" == 200 ]] || { echo "Test backend health failed: $health" >&2; false; }
bootstrap="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/api/integrations/agent-bootstrap 2>/dev/null || echo 000)"
[[ "$bootstrap" == 401 ]] || { echo "Test bootstrap route gate failed: $bootstrap" >&2; false; }
nginx_status="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:16077/ 2>/dev/null || echo 000)"
[[ "$nginx_status" == 200 || "$nginx_status" == 304 ]] || { echo "Test Nginx gate failed: $nginx_status" >&2; false; }

STATE=complete
trap - ERR INT TERM
rm -f "$ARCHIVE"
printf 'deployment_status=complete\nrelease_id=%s\nbackup_id=%s\nhealth_status=%s\nbootstrap_route_status=%s\nnginx_status=%s\n' \
  "$RELEASE_ID" "$BACKUP_ID" "$health" "$bootstrap" "$nginx_status"
