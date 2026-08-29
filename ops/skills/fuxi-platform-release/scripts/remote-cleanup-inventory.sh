#!/usr/bin/env bash
set -euo pipefail

emit_root() {
  local environment="$1" root="$2"
  local project="$root/fuxi-platform"
  local current_target=''
  current_target="$(readlink -f "$root/current" 2>/dev/null || readlink -f "$project" 2>/dev/null || true)"

  printf 'root\t%s\t%s\t%s\t%s\n' \
    "$environment" "$root" "$current_target" "$(test -d "$root/.release-lock" && echo true || echo false)"

  if [[ -d "$root/releases" ]]; then
    while IFS= read -r release_dir; do
      [[ -n "$release_dir" ]] || continue
      local release_name release_target bytes modified is_current manifest
      release_name="$(basename "$release_dir")"
      release_target="$(readlink -f "$release_dir" 2>/dev/null || true)"
      bytes="$(du -sb "$release_dir" 2>/dev/null | awk '{print $1}' || echo 0)"
      modified="$(stat -c '%Y' "$release_dir" 2>/dev/null || echo 0)"
      is_current=false
      [[ -n "$current_target" && "$release_target" == "$current_target" ]] && is_current=true
      manifest="$(test -f "$release_dir/manifest.json" && echo true || echo false)"
      printf 'item\t%s\trelease\t%s\t%s\t%s\t%s\t%s\t-\t-\t-\t-\n' \
        "$environment" "$release_name" "$bytes" "$modified" "$is_current" "$manifest"
    done < <(find "$root/releases" -mindepth 1 -maxdepth 1 -type d -print | sort)
  fi

  if [[ -d "$root/backups" ]]; then
    while IFS= read -r backup_dir; do
      [[ -n "$backup_dir" ]] || continue
      local backup_name bytes modified candidate persistent previous regular_count symlink_count
      backup_name="$(basename "$backup_dir")"
      bytes="$(du -sb "$backup_dir" 2>/dev/null | awk '{print $1}' || echo 0)"
      modified="$(stat -c '%Y' "$backup_dir" 2>/dev/null || echo 0)"
      candidate="$(head -n 1 "$backup_dir/candidate-release" 2>/dev/null | tr -d '\r\n\t' || true)"
      [[ -n "$candidate" ]] || candidate='-'
      previous="$(head -n 1 "$backup_dir/previous-target" 2>/dev/null | tr -d '\r\n\t' || true)"
      [[ -n "$previous" ]] || previous='-'
      persistent="$(test -f "$backup_dir/persistent.tar.gz" && echo true || echo false)"
      regular_count='-'
      symlink_count='-'
      if [[ "$persistent" == true ]]; then
        regular_count="$(tar -tvzf "$backup_dir/persistent.tar.gz" 2>/dev/null | awk '$1 ~ /^-/ {count++} END {print count+0}')"
        symlink_count="$(tar -tvzf "$backup_dir/persistent.tar.gz" 2>/dev/null | awk '$1 ~ /^l/ {count++} END {print count+0}')"
      fi
      printf 'item\t%s\tbackup\t%s\t%s\t%s\tfalse\t%s\t%s\t%s\t%s\t%s\n' \
        "$environment" "$backup_name" "$bytes" "$modified" "$persistent" "$candidate" "$previous" "$regular_count" "$symlink_count"
    done < <(find "$root/backups" -mindepth 1 -maxdepth 1 -type d -print | sort)
  fi
}

emit_root production "${1:-/zoesoft/fuxi}"
emit_root test "${2:-/zoesoft/fuxi-test}"
