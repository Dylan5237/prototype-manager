# Issue #77 — projection develop guard contract

Status: FROZEN / READY FOR IMPLEMENTATION
Control plane: #66
Blocked parent acceptance: #71
Disposer: @Dylan5237

## Mission

Resolve the governed deadlock between the projection guard and the 16077 deploy identity without changing the release source branch or creating a second write authority.

GitHub `origin/main` remains the only write authority.
GitLab `zoesoftgitlab` remains projection-only.

## Required project contract

Declare project projection branches explicitly:

`projection_branches=main,develop`

Only those branches may receive projection updates.

## Required guard behavior

For a push to the registered projection remote:

1. Target ref must be an explicitly allowed projection branch.
2. Candidate local SHA must equal the current fetched `refs/remotes/origin/main` tip.
3. If the projection target exists, its current SHA must be an ancestor of the candidate; non-FF/diverged updates fail closed.
4. Projection ref deletion is forbidden.
5. Topic/feature/evidence branches remain forbidden.
6. No force push or bypass behavior.

For authority `origin`, preserve all current behavior, especially direct `main` push denial and topic-branch allowance.

Unknown remotes/share-export/unsafe URLs must retain current fail-closed behavior.

## Expected files

- `.githooks/pre-push`
- `.agent-project-ops/remotes`
- focused executable regression test(s) for the actual hook

Do not modify `.agent-project-ops/PRINCIPLES.md`.
Do not modify `deploy-test-from-gitlab.ps1`.
Do not modify product code.

## Required tests

Exercise the actual hook with isolated temporary git repositories/remotes. Cover:

- projection `main`: current authority tip + remote behind -> allow;
- projection `develop`: current authority tip + remote behind -> allow;
- projection `develop`: older authority commit -> reject;
- projection `develop`: non-authority candidate -> reject;
- projection `develop`: diverged/non-FF remote -> reject;
- projection topic branch -> reject;
- projection deletion -> reject;
- undeclared projection branch -> reject;
- authority topic branch remains allowed;
- authority direct `main` remains rejected.

Also run `bash -n .githooks/pre-push` and `git diff --check`.

## Work isolation

Use one worktree / one branch / one PR:

- worktree: `.worktrees/77-projection-develop-guard`
- branch: `fix/77-projection-develop-guard`
- PR base: GitHub `main`

Push the implementation branch to `origin` only.

## No operational projection in this task

Do not push to `zoesoftgitlab` and do not deploy 16077 while implementing #77.

After the implementation PR merges, stop and report the fresh topology:
- current `origin/main` SHA;
- current GitLab `develop` SHA;
- whether GitLab `develop` is ancestor/equal to authority;
- exact projection command that would be used.

The projection write requires separate disposer authorization after those SHAs are recorded.

## Deliverable

Open one narrow implementation PR. Record exact tests and changed files. Stop at `IMPLEMENTATION READY`.

Do not self-merge. Do not project. Do not deploy. Do not announce #71 Phase PASS.