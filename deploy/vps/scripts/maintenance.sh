#!/usr/bin/env bash
# Runs a Keyo maintenance command in the one-off maintenance container.
#
#   maintenance.sh status
#   maintenance.sh create-test-accounts --operator NAME --count 20
#   maintenance.sh reset-test-data                                   # dry run (default)
#   maintenance.sh reset-test-data   --execute --operator NAME --confirm "RESET keyo_game 37"
#   maintenance.sh launch-production                                 # dry run (default)
#   maintenance.sh launch-production --execute --operator NAME --confirm "LAUNCH keyo_game"
#   maintenance.sh start                                             # start server + web again
#
# For --execute the game server is stopped first (no player activity during the change), a host
# backup is taken in addition to the command's own verified backup, and the stack is restarted.
# shellcheck source=common.sh
source "$(dirname "$0")/common.sh"
require_env_file
mkdir -p "$KEYO_BACKUP_DIR" "$KEYO_LOG_DIR"
chmod 700 "$KEYO_BACKUP_DIR"
# The maintenance container runs as the calling user, so backups it writes stay owned by that user.
KEYO_UID=$(id -u)
KEYO_GID=$(id -g)
KEYO_OPERATOR=$(id -un)
export KEYO_UID KEYO_GID KEYO_OPERATOR

logfile="$KEYO_LOG_DIR/maintenance.log"
execute=false
for arg in "$@"; do [[ "$arg" == "--execute" ]] && execute=true; done

run() { compose --profile tools run --rm -T maintenance "$@" 2>&1 | tee -a "$logfile"; return "${PIPESTATUS[0]}"; }

log "maintenance $* (by $(id -un))" | tee -a "$logfile"
if [[ "$execute" == true && "${1:-}" =~ ^(reset-test-data|launch-production)$ ]]; then
  "$KEYO_VPS_DIR/scripts/backup.sh" | tee -a "$logfile"
  log "stopping web and server" | tee -a "$logfile"
  compose stop web server
  set +e; run "$@"; code=$?; set -e
  if [[ "$1" == "launch-production" && "$code" == 0 && "$(env_value KEYO_DATA_MODE)" != "production" ]]; then
    # The server refuses to start in test mode against a production database, by design.
    log "launch done. Set KEYO_DATA_MODE=production in $KEYO_ENV_FILE, then run: $KEYO_VPS_DIR/scripts/maintenance.sh start" | tee -a "$logfile"
    exit 0
  fi
  log "starting server and web" | tee -a "$logfile"
  compose up -d server web
  exit "$code"
fi
if [[ "${1:-}" == "start" ]]; then
  compose up -d server web
  exit 0
fi
run "$@"
