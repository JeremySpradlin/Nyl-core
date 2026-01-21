#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
IMAGE_TAG=${IMAGE_TAG:-localhost:32000/nyl-frontend:latest}
PLATFORM=${PLATFORM:-linux/amd64}
API_BASE_URL=${API_BASE_URL:-http://api.nyl.local}
KUSTOMIZE_PATH=${KUSTOMIZE_PATH:-Cluster/NylFrontend}

"$REPO_ROOT/apps/nyl-frontend/scripts/build-image.sh"

microk8s kubectl apply -k "$REPO_ROOT/$KUSTOMIZE_PATH"
microk8s kubectl rollout restart deployment/nyl-frontend
