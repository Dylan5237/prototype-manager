#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
hook="${root}/.githooks/pre-push"
tmp_root="$(mktemp -d)"
repo="${tmp_root}/repo"
zero="0000000000000000000000000000000000000000"
passed=0

cleanup() {
  rm -rf -- "${tmp_root}"
}
trap cleanup EXIT

fail() {
  echo "not ok - $*" >&2
  exit 1
}

write_registry() {
  local projection_branches_mode="${1:-configured}"
  local share_export="${2:-(none)}"

  {
    echo 'authority=origin'
    echo 'projection=zoesoftgitlab'
    echo 'projection_url=https://gitlab.example.test/fuxi/platform.git'
    if [[ "${projection_branches_mode}" == "configured" ]]; then
      echo 'projection_branches=main,develop'
    fi
    echo "share_export=${share_export}"
    echo 'share_export_url='
  } > "${repo}/.agent-project-ops/remotes"
}

invoke_hook() {
  local remote_name="${1}"
  local remote_url="${2}"
  local input="${3}"

  (
    cd "${repo}"
    printf '%s\n' "${input}" | bash "${hook}" "${remote_name}" "${remote_url}"
  )
}

assert_allowed() {
  local name="${1}"
  local remote_name="${2}"
  local remote_url="${3}"
  local input="${4}"
  local output=""

  if ! output="$(invoke_hook "${remote_name}" "${remote_url}" "${input}" 2>&1)"; then
    fail "${name}: expected allow, got: ${output}"
  fi
  passed=$((passed + 1))
  echo "ok ${passed} - ${name}"
}

assert_rejected() {
  local name="${1}"
  local expected="${2}"
  local remote_name="${3}"
  local remote_url="${4}"
  local input="${5}"
  local output=""

  if output="$(invoke_hook "${remote_name}" "${remote_url}" "${input}" 2>&1)"; then
    fail "${name}: expected rejection"
  fi
  grep -Fq -- "${expected}" <<< "${output}" || \
    fail "${name}: expected '${expected}', got: ${output}"
  passed=$((passed + 1))
  echo "ok ${passed} - ${name}"
}

assert_git_push_allowed() {
  local name="${1}"
  local remote_name="${2}"
  local refspec="${3}"
  local output=""

  if ! output="$(git -C "${repo}" push --dry-run "${remote_name}" "${refspec}" 2>&1)"; then
    fail "${name}: expected allow, got: ${output}"
  fi
  passed=$((passed + 1))
  echo "ok ${passed} - ${name}"
}

assert_git_push_rejected() {
  local name="${1}"
  local expected="${2}"
  local remote_name="${3}"
  local refspec="${4}"
  local output=""

  if output="$(git -C "${repo}" push --dry-run "${remote_name}" "${refspec}" 2>&1)"; then
    fail "${name}: expected rejection"
  fi
  grep -Fq -- "${expected}" <<< "${output}" || \
    fail "${name}: expected '${expected}', got: ${output}"
  passed=$((passed + 1))
  echo "ok ${passed} - ${name}"
}

git init -q -b main "${repo}"
git -C "${repo}" config user.name 'Hook Test'
git -C "${repo}" config user.email 'hook-test@example.test'
echo base > "${repo}/fixture.txt"
git -C "${repo}" add fixture.txt
git -C "${repo}" commit -q -m base
base="$(git -C "${repo}" rev-parse HEAD)"
echo authority >> "${repo}/fixture.txt"
git -C "${repo}" commit -qam authority
authority_tip="$(git -C "${repo}" rev-parse HEAD)"

git -C "${repo}" checkout -q -b diverged "${base}"
echo projection > "${repo}/diverged.txt"
git -C "${repo}" add diverged.txt
git -C "${repo}" commit -q -m diverged
diverged="$(git -C "${repo}" rev-parse HEAD)"
git -C "${repo}" checkout -q main

mkdir -p "${repo}/.agent-project-ops/scripts/lib"
cp "${root}/.agent-project-ops/scripts/lib/url-guard.sh" \
  "${repo}/.agent-project-ops/scripts/lib/url-guard.sh"
git -C "${repo}" update-ref refs/remotes/origin/main "${authority_tip}"
write_registry configured

projection_url='https://gitlab.example.test/fuxi/platform.git'
authority_url='https://github.com/example/platform.git'

assert_allowed 'projection main accepts current authority tip when remote is behind' \
  zoesoftgitlab "${projection_url}" \
  "refs/heads/main ${authority_tip} refs/heads/main ${base}"

assert_allowed 'projection develop accepts current authority tip when remote is behind' \
  zoesoftgitlab "${projection_url}" \
  "refs/heads/main ${authority_tip} refs/heads/develop ${base}"

assert_rejected 'projection develop rejects an older authority commit' \
  'is not current authority tip' zoesoftgitlab "${projection_url}" \
  "refs/heads/main ${base} refs/heads/develop ${zero}"

assert_rejected 'projection develop rejects a non-authority candidate' \
  'is not current authority tip' zoesoftgitlab "${projection_url}" \
  "refs/heads/diverged ${diverged} refs/heads/develop ${zero}"

assert_rejected 'projection develop rejects a diverged remote tip' \
  'non-fast-forward projection update is forbidden' zoesoftgitlab "${projection_url}" \
  "refs/heads/main ${authority_tip} refs/heads/develop ${diverged}"

assert_rejected 'projection rejects a topic branch' \
  'is not explicitly allowed' zoesoftgitlab "${projection_url}" \
  "refs/heads/main ${authority_tip} refs/heads/fix/topic ${zero}"

assert_rejected 'projection rejects branch deletion' \
  'projection ref deletion is forbidden' zoesoftgitlab "${projection_url}" \
  "(delete) ${zero} refs/heads/develop ${base}"

assert_rejected 'projection rejects an undeclared branch' \
  'is not explicitly allowed' zoesoftgitlab "${projection_url}" \
  "refs/heads/main ${authority_tip} refs/heads/release ${zero}"

assert_allowed 'authority still allows topic branches' \
  origin "${authority_url}" \
  "refs/heads/fix/topic ${authority_tip} refs/heads/fix/topic ${zero}"

assert_rejected 'authority still rejects direct main updates' \
  "direct push to main on authority 'origin' is forbidden" origin "${authority_url}" \
  "refs/heads/main ${authority_tip} refs/heads/main ${base}"

write_registry absent
assert_allowed 'missing allowlist preserves default projection branch behavior' \
  zoesoftgitlab "${projection_url}" \
  "refs/heads/main ${authority_tip} refs/heads/main ${base}"

assert_rejected 'missing allowlist does not permit develop' \
  'is not explicitly allowed' zoesoftgitlab "${projection_url}" \
  "refs/heads/main ${authority_tip} refs/heads/develop ${base}"

write_registry configured
assert_rejected 'unknown remote remains fail closed' \
  "remote 'unknown' is unregistered" unknown 'https://unknown.example.test/platform.git' \
  "refs/heads/main ${authority_tip} refs/heads/main ${base}"

write_registry configured zoesoftgitlab
assert_rejected 'share-export overlap remains fail closed' \
  "cannot be both projection and share_export" zoesoftgitlab "${projection_url}" \
  "refs/heads/main ${authority_tip} refs/heads/main ${base}"

write_registry configured
assert_rejected 'credential-bearing remote URLs remain fail closed' \
  'remote URL is unsafe or may embed credentials/query tokens' origin \
  'https://user:secret@github.example.test/platform.git' \
  "refs/heads/fix/topic ${authority_tip} refs/heads/fix/topic ${zero}"

# Exercise Git's real pre-push invocation path as well as direct hook stdin.
# Bare remotes are local test fixtures and --dry-run guarantees no ref update.
origin_bare="${tmp_root}/origin.git"
projection_bare="${tmp_root}/projection.git"
git clone -q --bare "${repo}" "${origin_bare}"
git clone -q --bare "${repo}" "${projection_bare}"
git --git-dir="${origin_bare}" update-ref refs/heads/main "${base}"
git --git-dir="${projection_bare}" update-ref refs/heads/develop "${base}"
git -C "${repo}" remote add origin "${origin_bare}"
git -C "${repo}" remote add zoesoftgitlab "${projection_bare}"
git -C "${repo}" config core.hooksPath "${root}/.githooks"
write_registry configured

assert_git_push_allowed 'git pre-push path allows authority tip to projection develop' \
  zoesoftgitlab 'refs/heads/main:refs/heads/develop'

assert_git_push_rejected 'git pre-push path rejects projection topic branch' \
  'is not explicitly allowed' zoesoftgitlab 'refs/heads/main:refs/heads/fix/topic'

assert_git_push_rejected 'git pre-push path rejects projection deletion' \
  'projection ref deletion is forbidden' zoesoftgitlab ':refs/heads/develop'

assert_git_push_allowed 'git pre-push path preserves authority topic push' \
  origin 'refs/heads/main:refs/heads/fix/topic'

assert_git_push_rejected 'git pre-push path rejects authority main update' \
  "direct push to main on authority 'origin' is forbidden" origin \
  'refs/heads/main:refs/heads/main'

echo "1..${passed}"
