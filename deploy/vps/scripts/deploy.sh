#!/usr/bin/env bash
# Manual, owner-approved deployment of one exact git ref (tag or commit) to /opt/keyo-game.
# Nothing calls this automatically: there is no CI deploy, cron or webhook.
#
#   sudo -u keyo /opt/keyo-game/deploy/vps/scripts/deploy.sh <tag-or-commit>
#
# Steps: preflight → confirm → backup (if running) → checkout ref → build → migrate on start → health check.
# shellcheck source=common.sh
source "$(dirname "$0")/common.sh"
ref="${1:-}"
[[ -n "$ref" ]] || die "usage: deploy.sh <approved tag or commit>"
require_env_file

"$KEYO_VPS_DIR/scripts/preflight.sh" || die "preflight failed"

git -C "$KEYO_ROOT" fetch --tags origin
commit=$(git -C "$KEYO_ROOT" rev-parse --verify "$ref^{commit}") || die "unknown ref $ref"
mode=$(env_value KEYO_DATA_MODE)
echo
echo "About to deploy Keyo Game"
echo "  ref:        $ref ($commit)"
echo "  data mode:  $mode"
echo "  directory:  $KEYO_ROOT (compose project keyo-game only)"
read -r -p "Type DEPLOY ${commit:0:12} to continue: " answer
[[ "$answer" == "DEPLOY ${commit:0:12}" ]] || die "not confirmed; nothing changed"

if compose ps --status running --services 2>/dev/null | grep -qx postgres; then
  "$KEYO_VPS_DIR/scripts/backup.sh"
fi

git -C "$KEYO_ROOT" checkout --detach "$commit"
export KEYO_IMAGE_TAG="${commit:0:12}"
log "building images $KEYO_IMAGE_TAG"
compose build server web maintenance
log "starting stack (the server applies database migrations on start)"
compose up -d --remove-orphans postgres redis server web

for _ in $(seq 1 30); do
  if "$KEYO_VPS_DIR/scripts/healthcheck.sh" >/dev/null 2>&1; then
    "$KEYO_VPS_DIR/scripts/healthcheck.sh"
    log "deployed $ref ($commit)"
    exit 0
  fi
  sleep 5
done
compose logs --tail 80 server
die "stack did not become healthy; previous images are still available for rollback (see docs/DEPLOYMENT_VPS.md)"
