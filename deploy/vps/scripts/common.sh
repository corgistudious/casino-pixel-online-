#!/usr/bin/env bash
# Shared settings for the Keyo Game VPS scripts. Every docker command is scoped to the
# "keyo-game" compose project, so containers of other apps on the VPS are never touched.
set -euo pipefail

KEYO_ROOT="${KEYO_ROOT:-/opt/keyo-game}"
KEYO_VPS_DIR="$KEYO_ROOT/deploy/vps"
KEYO_ENV_FILE="$KEYO_VPS_DIR/.env"
# shellcheck disable=SC2034  # used by the scripts that source this file
KEYO_BACKUP_DIR="$KEYO_ROOT/backups"
# shellcheck disable=SC2034
KEYO_LOG_DIR="$KEYO_ROOT/logs"

compose() {
  docker compose --project-name keyo-game --project-directory "$KEYO_VPS_DIR" \
    --file "$KEYO_VPS_DIR/docker-compose.yml" --env-file "$KEYO_ENV_FILE" "$@"
}

env_value() {
  # Reads one KEY=value from the .env file without sourcing it (values may contain shell characters).
  grep -E "^$1=" "$KEYO_ENV_FILE" | tail -n1 | cut -d= -f2-
}

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

require_env_file() {
  [[ -f "$KEYO_ENV_FILE" ]] || die "missing $KEYO_ENV_FILE (copy .env.example and fill it in)"
  local mode
  mode=$(stat -c %a "$KEYO_ENV_FILE")
  [[ "$mode" == "600" || "$mode" == "400" ]] || die "$KEYO_ENV_FILE must be chmod 600 (is $mode)"
}
