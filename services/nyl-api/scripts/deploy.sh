#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
IMAGE_TAG=${IMAGE_TAG:-localhost:32000/nyl-api:latest}
PLATFORM=${PLATFORM:-linux/amd64}
KUSTOMIZE_PATH=${KUSTOMIZE_PATH:-Cluster/NylApi}

"$REPO_ROOT/services/nyl-api/scripts/build-image.sh"

microk8s kubectl apply -k "$REPO_ROOT/$KUSTOMIZE_PATH"
microk8s kubectl rollout restart deployment/nyl-api
