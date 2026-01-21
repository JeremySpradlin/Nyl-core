#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SERVICE_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
IMAGE_TAG=${IMAGE_TAG:-localhost:32000/nyl-api:latest}
PLATFORM=${PLATFORM:-linux/amd64}

if docker buildx version >/dev/null 2>&1; then
  docker buildx build --platform "$PLATFORM" -t "$IMAGE_TAG" --push "$SERVICE_DIR"
else
  DOCKER_BUILDKIT=1 docker build -t "$IMAGE_TAG" "$SERVICE_DIR"
  docker push "$IMAGE_TAG"
fi
