#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
IMAGE_TAG=${IMAGE_TAG:-localhost:32000/nyl-frontend:latest}
PLATFORM=${PLATFORM:-linux/amd64}
API_BASE_URL=${API_BASE_URL:-http://api.nyl.local}

if docker buildx version >/dev/null 2>&1; then
  docker buildx build --platform "$PLATFORM" \
    -t "$IMAGE_TAG" --push \
    --build-arg VITE_API_BASE_URL="$API_BASE_URL" \
    "$APP_DIR"
else
  DOCKER_BUILDKIT=1 docker build \
    -t "$IMAGE_TAG" \
    --build-arg VITE_API_BASE_URL="$API_BASE_URL" \
    "$APP_DIR"
  docker push "$IMAGE_TAG"
fi
