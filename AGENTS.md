# AGENTS.md

## Project overview
Nyl-core is a personal assistant platform running on MicroK8s. It includes:
- **Backend API**: FastAPI + async PostgreSQL (services/nyl-api)
- **Frontend**: Vite + React (apps/nyl-frontend)
- **Kubernetes manifests**: Kustomize packages per service (Cluster/)

## Repository structure
- `services/nyl-api/`: FastAPI app, SQLAlchemy models, Alembic migrations, RAG pipeline
- `apps/nyl-frontend/`: Vite React frontend
- `Cluster/`: Kustomize packages for services
  - `NylApi`, `NylFrontend`, `Postgres`, `Ollama`, `GpuReady`
- `docs/`: design plans and refactor notes

## Essential commands
### Backend (nyl-api)
```bash
cd services/nyl-api
source .venv/bin/activate

make run   # local dev server (uvicorn)
make test  # pytest
make smoke # basic health/models/chat smoke checks
```

### Frontend (nyl-frontend)
```bash
cd apps/nyl-frontend
npm run dev
npm run build
npm run preview
```

### Deployment (MicroK8s)
```bash
# API and frontend deploy scripts
services/nyl-api/scripts/deploy.sh
apps/nyl-frontend/scripts/deploy.sh

# Apply manifests per service
microk8s kubectl apply -k Cluster/NylApi
microk8s kubectl apply -k Cluster/NylFrontend
microk8s kubectl apply -k Cluster/Postgres
microk8s kubectl apply -k Cluster/Ollama
```

```bash
# Run database migrations
microk8s kubectl apply -f Cluster/NylApi/migrate-job.yaml
```

## Code organization
### Backend (services/nyl-api/app/)
- `main.py`: FastAPI routes (chat, journal, RAG)
- `models.py`: SQLAlchemy ORM models
- `schemas.py`: Pydantic request/response models
- `db.py`: async CRUD layer
- `database.py`: async engine/session setup
- `ollama.py`: Ollama LLM client
- `rag_chat.py`, `rag_ingest.py`, `rag_db.py`: RAG pipeline (pgvector)

### Frontend (apps/nyl-frontend/src/)
- `App.jsx`: simple route switch between landing and journal pages
- `pages/LandingPage.jsx`: chat UI + model picker
- `pages/JournalPage.jsx`: journal editor (TipTap)
- `components/`: shared UI widgets

## Testing
- Backend uses pytest (see `make test` or `.venv/bin/pytest`).
- No frontend test scripts are defined in `package.json`.

## Conventions
- YAML manifests use 2-space indentation.
- Kubernetes resource names are lowercase, hyphenated (e.g., `nyl-api`).
- Frontend uses functional React components and Vite tooling.
- Backend is async-first (FastAPI + async SQLAlchemy).

## Environment & deployment notes
- Local ingress hostnames (map in `/etc/hosts`):
  - `nyl.local` (frontend)
  - `api.nyl.local` (API)
  - `ollama.local` (Ollama)
- Local registry: images pushed to `localhost:32000` (MicroK8s).

## Gotchas
- `make smoke` uses curl calls for a running API at `localhost:8000`.
- Review PVC hostPath values in `Cluster/*/pvc.yaml` before deployment.