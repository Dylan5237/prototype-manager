#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-/zoesoft/fuxi}"
PROJECT="$ROOT/fuxi-platform"

emit() { printf '%s=%s\n' "$1" "$2"; }
size_bytes() { du -sbL "$1" 2>/dev/null | awk '{print $1}' || printf '0'; }

emit probe_mode read-only
emit host "$(hostname)"
emit timestamp "$(date -Iseconds)"
emit project_path "$PROJECT"
emit project_exists "$(test -e "$PROJECT" && echo true || echo false)"
emit project_target "$(readlink -f "$PROJECT" 2>/dev/null || true)"
if git -C "$PROJECT" rev-parse HEAD >/dev/null 2>&1; then
  emit git_managed true
  emit git_commit "$(git -C "$PROJECT" rev-parse HEAD)"
  emit git_branch "$(git -C "$PROJECT" branch --show-current)"
  emit git_dirty_count "$(git -C "$PROJECT" status --porcelain | wc -l | tr -d ' ')"
else
  emit git_managed false
  emit git_commit ''
  emit git_branch ''
  emit git_dirty_count ''
fi
emit pm2_pid "$(pgrep -f "node $PROJECT/backend/server.js" | head -1 || true)"
emit health_status "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/health 2>/dev/null || echo 000)"
emit bootstrap_route_status "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/integrations/agent-bootstrap 2>/dev/null || echo 000)"
emit data_bytes "$(size_bytes "$PROJECT/backend/data")"
emit repos_bytes "$(size_bytes "$PROJECT/backend/repos")"
emit uploads_bytes "$(size_bytes "$PROJECT/backend/uploads")"
emit free_bytes "$(df -PB1 "$ROOT" | awk 'NR==2 {print $4}')"
emit app_db_bytes "$(stat -c '%s' "$PROJECT/backend/data/app.db" 2>/dev/null || echo 0)"
emit release_root_exists "$(test -d "$ROOT/releases" && echo true || echo false)"
emit shared_root_exists "$(test -d "$ROOT/shared" && echo true || echo false)"
emit backup_root_exists "$(test -d "$ROOT/backups" && echo true || echo false)"
emit mcp_server_exists "$(test -f "$PROJECT/mcp-server/src/server.js" && echo true || echo false)"
emit skill_dir_configured "$(tr '\0' '\n' < /proc/$(pgrep -f "node $PROJECT/backend/server.js" | head -1)/environ 2>/dev/null | grep -q '^FUXI_SKILL_DIR=' && echo true || echo false)"
