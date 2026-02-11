# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nyl-core is a personal assistant platform running on MicroK8s. It consists of:
- **nyl-api**: FastAPI backend with async PostgreSQL (services/nyl-api)
- **nyl-frontend**: Vite + React frontend (apps/nyl-frontend)
- **Kubernetes manifests**: Kustomize packages for each service (Cluster/)

## Common Commands

### Backend (nyl-api)
```bash
cd services/nyl-api
source .venv/bin/activate

# Run locally
make run

# Run tests
make test

# Smoke test a running server
make smoke
```

### Frontend (nyl-frontend)
```bash
cd apps/nyl-frontend
npm run dev    # Development server
npm run build  # Production build
```

### Deployment
```bash
# Deploy API (builds image, applies manifests, restarts)
services/nyl-api/scripts/deploy.sh

# Deploy frontend
apps/nyl-frontend/scripts/deploy.sh

# Apply individual K8s services
microk8s kubectl apply -k Cluster/NylApi
microk8s kubectl apply -k Cluster/NylFrontend
microk8s kubectl apply -k Cluster/Postgres
microk8s kubectl apply -k Cluster/Ollama

# Run database migrations (manual job)
microk8s kubectl apply -f Cluster/NylApi/migrate-job.yaml
```

### Local registry
Images are pushed to `localhost:32000` (MicroK8s registry).

## Architecture

### Backend API (services/nyl-api/app/)
- **main.py**: FastAPI routes - chat completions, journal entries, tasks, RAG endpoints
- **models.py**: SQLAlchemy ORM models (JournalEntry, ChatSession, ChatMessage, JournalTask, RagIngestJob)
- **schemas.py**: Pydantic request/response models
- **db.py**: CRUD operations using async SQLAlchemy
- **database.py**: Async database engine setup (asyncpg)
- **ollama.py**: Ollama LLM client for chat/embeddings
- **rag_chat.py / rag_ingest.py / rag_db.py**: RAG pipeline for journal search (pgvector)

Database migrations use Alembic (migrations/ directory).

### Frontend (apps/nyl-frontend/src/)
- **App.jsx**: Simple router (/ and /journal routes)
- **pages/LandingPage.jsx**: Chat interface with model picker
- **pages/JournalPage.jsx**: Daily journal with rich text editor (TipTap)
- **components/**: Calendar, chat components, navigation

### Kubernetes Manifests (Cluster/)
Each service is a standalone kustomize package with deployment, service, ingress, and PVC resources:
- NylApi, NylFrontend: Application deployments
- Postgres: Database with secret-managed credentials
- Ollama: LLM server with GPU
- GpuReady: DaemonSet that labels nodes when GPU is available

### Access
Local ingress hostnames (require /etc/hosts entries pointing to 192.168.1.176):
- `nyl.local` - Frontend
- `api.nyl.local` - API
- `ollama.local` - Ollama

## Testing

Backend tests use pytest with async support:
```bash
cd services/nyl-api
.venv/bin/pytest                    # All tests
.venv/bin/pytest tests/test_chat.py # Single file
.venv/bin/pytest -k "test_health"   # By name pattern
```

Tests mock external services (Ollama, database) using fixtures in tests/conftest.py.

## Coding Conventions

- YAML files: 2-space indentation
- Kubernetes resources: lowercase, hyphenated names (e.g., `nyl-api`)
- Python: async/await throughout, Pydantic for validation
- Frontend: functional React components, no state management library
