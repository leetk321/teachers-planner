#!/bin/sh
set -eu

VERSION="${1:-}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.synology.yml}"
ENV_FILE="${ENV_FILE:-.env}"

if [ -z "$VERSION" ]; then
  echo "Usage: sh scripts/deploy-release.sh <version>" >&2
  exit 2
fi
if ! cmp -s compose.yaml docker-compose.synology.yml; then
  echo "Release refused: compose.yaml and docker-compose.synology.yml have drifted" >&2
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  cp .env.synology.example "$ENV_FILE"
fi

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
  else
    echo "Docker Compose was not found" >&2
    exit 1
  fi
}

set_env_value() {
  key="$1"
  value="$2"
  temp_file="${ENV_FILE}.tmp.$$"
  awk -v key="$key" -v value="$value" '
    BEGIN { found = 0 }
    $0 ~ ("^" key "=") { print key "=" value; found = 1; next }
    { print }
    END { if (!found) print key "=" value }
  ' "$ENV_FILE" > "$temp_file"
  mv "$temp_file" "$ENV_FILE"
}

CURRENT_VERSION="$(awk -F= '/^TEACHER_NOTEBOOK_VERSION=/{print $2; exit}' "$ENV_FILE")"
mkdir -p .deploy
export TEACHER_NOTEBOOK_VERSION="$VERSION"

wait_healthy() {
  service="$1"
  attempts="${2:-60}"
  count=0
  while [ "$count" -lt "$attempts" ]; do
    container_id="$(compose ps -q "$service")"
    if [ -n "$container_id" ]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
      if [ "$status" = "healthy" ]; then return 0; fi
      if [ "$status" = "unhealthy" ] || [ "$status" = "exited" ]; then
        echo "${service} entered ${status} state" >&2
        return 1
      fi
    fi
    count=$((count + 1))
    sleep 2
  done
  echo "Timed out waiting for ${service} health" >&2
  return 1
}

compose build --pull api web
compose run --rm --no-deps api node scripts/verify-data-volume.mjs
compose run --rm --no-deps api node scripts/backup-sqlite.mjs --label "pre-${VERSION}"
compose run --rm --no-deps api node scripts/verify-sqlite-backup.mjs
compose up -d --no-build
wait_healthy api
wait_healthy web
compose ps

if [ -n "$CURRENT_VERSION" ] && [ "$CURRENT_VERSION" != "$VERSION" ]; then
  printf '%s\n' "$CURRENT_VERSION" > .deploy/previous-version
fi
set_env_value TEACHER_NOTEBOOK_VERSION "$VERSION"
printf '%s\n' "$VERSION" > .deploy/current-version

echo "Release ${VERSION} deployed. Confirm both containers are healthy before pruning older images."
