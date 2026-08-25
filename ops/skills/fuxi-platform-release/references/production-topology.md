# Production topology

Read this file before probing, deploying, or rolling back production.

## Reference live baseline (2026-08-13; re-probe before use)

| Item | Value |
|---|---|
| Host | `192.168.2.145` |
| Frontend URL | `http://192.168.2.145:16088` |
| SSH user | `root`; password must come from `FUXI_SSH_PASSWORD` |
| Pinned ED25519 fingerprint | `ssh-ed25519 255 d0:c5:d3:c9:5f:a9:3c:b9:17:3b:6f:5c:e7:1d:61:d1` |
| Legacy project path | `/zoesoft/fuxi/fuxi-platform` |
| Release root | `/zoesoft/fuxi/releases` |
| Shared data root | `/zoesoft/fuxi/shared` |
| Backup root | `/zoesoft/fuxi/backups` |
| PM2 app | `fuxi-backend` |
| PM2 executable | `/root/.npm-global/bin/pm2`; non-login SSH does not include it in `PATH` |
| Backend | Node.js `20.20.2`, port `3001` |
| Frontend | Nginx port `16088`, root below legacy project path |
| Nginx config | `/etc/nginx/sites-available/fuxi` |
| Git branch for new release | `main` |
| Legacy update script | `/zoesoft/fuxi/update-intranet.sh`; inspect only, do not use for immutable releases |

## Test environment (16077)

| Item | Value |
|---|---|
| Test root | `/zoesoft/fuxi-test` |
| Test URL | `http://192.168.2.145:16077` |
| Backend port | `3002` |
| PM2 app | `fuxi-backend-test` |
| Nginx site | `/etc/nginx/sites-available/fuxi-test` (enabled at `sites-enabled/fuxi-test`) |
| Data | `/zoesoft/fuxi-test/shared/` — independent from production `shared/` |
| Seed source | production `shared/data/app.db` + production `shared/repos/` |
| Filter user | `wushengzhi`; only that user's prototypes and bound rows/repos are copied |

The test root mirrors the production layout (`releases/`, `current`, `fuxi-platform`, `shared/`, `backups/`). It must never link to `/zoesoft/fuxi/shared` or reuse the production PM2 app or Nginx `16088` site.

## Persistent paths

Production data currently lives below the legacy project tree:

- `backend/data/app.db`
- `backend/repos/`
- `backend/uploads/`
- `backend/.env`

The first immutable release migrates these to `/zoesoft/fuxi/shared/` only after a verified backup. New release trees link to shared paths. The compatibility symlink `/zoesoft/fuxi/fuxi-platform` keeps the existing PM2 entry and Nginx root valid.

## Known hazards

- The legacy production Git worktree has modified backend/frontend lockfiles created by server-side `npm install`. Never discard them before snapshotting and diffing.
- The legacy updater performs no data backup or rollback and mutates lockfiles. Do not run it.
- Production previously contained the obsolete `.agents/skills/fuxi-packager`; do not carry it into new releases.
- PM2 inherited unrelated AI-service environment keys. Never read or print their values; the release must use the minimal shared backend env file.
- The platform repository and `prototype-manager-skills` are independent source repositories. A release manifest pins both commits.
- The server runs `k3s-agent`; CNI/Kubernetes NAT rules DNAT `80/443` to Traefik (`10.42.0.218:8000` / `10.42.1.2:80`). Fuxi must keep serving on `16088`; never switch the Fuxi Nginx back to `80/443`.
