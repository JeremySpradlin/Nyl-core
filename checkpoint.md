# Checkpoint

## What we set up
- Ollama on MicroK8s in default namespace with GPU, PVC, Ingress `ollama.local`.
- Nyl API backend (FastAPI) in `services/nyl-api` with streaming chat, models endpoint, and K8s manifests in `Cluster/NylApi`.
- Nyl frontend (Vite + React) in `apps/nyl-frontend` with streaming chat UI, model picker, and deployment manifests in `Cluster/NylFrontend`.
- Postgres in `Cluster/Postgres` with PVC and a Secret-managed password.

## Files added/updated
- `Cluster/Ollama/*` (default namespace): `deployment.yaml`, `service.yaml`, `ingress.yaml`, `pvc.yaml`, `kustomization.yaml`, `README.md`.
- `Cluster/NylApi/*`: `deployment.yaml`, `service.yaml`, `ingress.yaml`, `kustomization.yaml`.
- `Cluster/NylFrontend/*`: `deployment.yaml`, `service.yaml`, `ingress.yaml`, `kustomization.yaml`.
- `services/nyl-api/*`: FastAPI app, tests, Dockerfile, Makefile, scripts, and pytest config.
- `apps/nyl-frontend/*`: Vite app, Dockerfile, scripts, and UI assets.
- `.gitignore`, `checkpoint.md` (this file).

## Key runtime actions performed
- Created host dataset dir and ownership:
  - `mkdir -p /home/erbun/data`
  - `chown 1000:1000 /home/erbun/data`
- Enabled GPU time-slicing (3 slices):
  - ConfigMap `time-slicing-config` in `gpu-operator-resources`
  - Patched ClusterPolicy to use it
  - Restarted `nvidia-device-plugin-daemonset`
  - Verified node reports `nvidia.com/gpu: 3`
- Enabled MicroK8s registry (`localhost:32000`).

## Access/hosts entries
- `/etc/hosts`:
  - `192.168.1.176  ollama.local`
  - `192.168.1.176  api.nyl.local`
  - `192.168.1.176  nyl.local`

## Current expectations
- API and frontend deploy via scripts:
  - `services/nyl-api/scripts/deploy.sh`
  - `apps/nyl-frontend/scripts/deploy.sh`

## Notes/todos
- Apply manifests as needed:
  - `microk8s kubectl apply -k Cluster/Ollama`
  - `microk8s kubectl apply -k Cluster/NylApi`
  - `microk8s kubectl apply -k Cluster/NylFrontend`
  - `microk8s kubectl apply -k Cluster/Postgres`
- Streaming via ingress uses NGINX annotations in `Cluster/NylApi/ingress.yaml`.
- If chat streaming fails, check `nyl-api` logs for `httpx.ReadTimeout` and redeploy API after updates.

Last session summary:
- Added SQLAlchemy async refactor for nyl-api with Alembic migrations, including new `database.py`, `models.py`, updated CRUD in `services/nyl-api/app/db.py`, and session-based deps in `services/nyl-api/app/main.py`.
- Added Alembic config/migrations to the API image, and a migration Job manifest `Cluster/NylApi/migrate-job.yaml` (manual apply only). Initial migration drops `journal_entries` if it exists, then recreates it.
- Frontend journal editor improvements: modal behavior, flex layout, and a formatting toolbar (bold/italic/headings/lists/quote/link/code). Added `@tiptap/extension-link`.
- Added GPU readiness gating: new `Cluster/GpuReady/` DaemonSet labels nodes `gpu.nyl.io/ready=true` after `nvidia-smi` succeeds; GPU workloads now require that label.

Pending:
- After reboot, apply GPU-ready resources and redeploy GPU workloads:
  - `microk8s kubectl apply -k Cluster/GpuReady`
  - `microk8s kubectl apply -k Cluster/Ollama`
- Confirm node gets label `gpu.nyl.io/ready=true` and GPU pods schedule without `UnexpectedAdmissionError`.

Notes:
- Migration Job is manual (not in `Cluster/NylApi/kustomization.yaml`). Run with `microk8s kubectl apply -f Cluster/NylApi/migrate-job.yaml` after API image updates.
- If Alembic migration fails due to existing table, initial migration now drops `journal_entries` before creating it.
