#!/usr/bin/env bash
set -euo pipefail

temp_base="${TMPDIR:-/tmp}"
fixture="$(mktemp -d "$temp_base/fuxi-backup-contract.XXXXXX")"
case "$fixture" in
  "$temp_base"/fuxi-backup-contract.*) ;;
  *) echo 'Unexpected fixture path.' >&2; exit 2 ;;
esac
cleanup() { rm -rf -- "$fixture"; }
trap cleanup EXIT

mkdir -p "$fixture/shared/data" "$fixture/shared/repos/p1" "$fixture/shared/uploads" "$fixture/release/backend"
printf 'database-fixture\n' > "$fixture/shared/data/app.db"
printf '<!doctype html>\n' > "$fixture/shared/repos/p1/index.html"
printf 'upload-fixture\n' > "$fixture/shared/uploads/example.txt"
ln -s "$fixture/shared/data" "$fixture/release/backend/data"
ln -s "$fixture/shared/repos" "$fixture/release/backend/repos"
ln -s "$fixture/shared/uploads" "$fixture/release/backend/uploads"

persistent_bytes="$(du -sbL \
  "$fixture/release/backend/data" \
  "$fixture/release/backend/repos" \
  "$fixture/release/backend/uploads" | awk '{sum += $1} END {print sum}')"
[[ "$persistent_bytes" -gt 0 ]]

archive="$fixture/persistent.tar.gz"
tar -czhf "$archive" -C "$fixture/release/backend" data repos uploads
tar -tzf "$archive" | grep -qx 'data/app.db'
tar -tzf "$archive" | grep -qx 'repos/p1/index.html'
tar -tzf "$archive" | grep -qx 'uploads/example.txt'

regular_count="$(tar -tvzf "$archive" | awk '$1 ~ /^-/ {count++} END {print count+0}')"
symlink_count="$(tar -tvzf "$archive" | awk '$1 ~ /^l/ {count++} END {print count+0}')"
[[ "$regular_count" -eq 3 ]]
[[ "$symlink_count" -eq 0 ]]

printf '{"status":"PASS","persistentBytes":%s,"regularFiles":%s,"symlinks":%s}\n' \
  "$persistent_bytes" "$regular_count" "$symlink_count"
