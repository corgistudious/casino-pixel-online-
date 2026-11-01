#!/usr/bin/env bash
# Deploys ONLY the web frontend of a given commit to the Keyo TEST environment.
# Never touches Production (/opt/keyo-game, compose project "keyo-game"), never restarts a
# container, never touches the database, Redis or player data. The test checkout's working tree
# is not modified (the build runs in a separate git worktree).
#
# Required:
#   TEST_DEMO=0|1        build mode, must match how Test is built today (VITE_DEMO)
#   and ONE target:
#   TEST_STATIC_DIR=/path       host directory the Test site is served from, or
#   TEST_WEB_CONTAINER=name     Test web container (Caddy) serving /srv — files are copied in, no restart
# Optional:
#   TEST_SRC=/opt/keyo-game-pr29-1-work/source   REF=fix/ios-pwa-landscape-startup   TEST_DIAG=1
set -euo pipefail
TEST_SRC="${TEST_SRC:-/opt/keyo-game-pr29-1-work/source}"
REF="${REF:-fix/ios-pwa-landscape-startup}"
TEST_DIAG="${TEST_DIAG:-1}"
log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { log "STOP: $*" >&2; exit 1; }
is_prod_path() { case "$(realpath -m "$1")" in /opt/keyo-game|/opt/keyo-game/*) return 0;; *) return 1;; esac; }

[[ "${TEST_DEMO:-}" =~ ^[01]$ ]] || die "set TEST_DEMO=0 or 1 (same as the current Test build)"
is_prod_path "$TEST_SRC" && die "TEST_SRC points into Production"
[[ -n "${TEST_STATIC_DIR:-}" || -n "${TEST_WEB_CONTAINER:-}" ]] || die "set TEST_STATIC_DIR or TEST_WEB_CONTAINER"
if [[ -n "${TEST_STATIC_DIR:-}" ]]; then
  is_prod_path "$TEST_STATIC_DIR" && die "TEST_STATIC_DIR is inside Production"
  [[ -d "$TEST_STATIC_DIR" ]] || die "$TEST_STATIC_DIR does not exist"
fi
if [[ -n "${TEST_WEB_CONTAINER:-}" ]]; then
  proj=$(docker inspect "$TEST_WEB_CONTAINER" --format '{{index .Config.Labels "com.docker.compose.project"}}') || die "no container $TEST_WEB_CONTAINER"
  [[ "$proj" == "keyo-game" ]] && die "$TEST_WEB_CONTAINER belongs to the Production compose project"
  docker exec "$TEST_WEB_CONTAINER" test -f /srv/index.html || die "$TEST_WEB_CONTAINER has no /srv/index.html"
fi

log "fetch $REF (working tree of $TEST_SRC is not touched)"
git -C "$TEST_SRC" fetch origin "$REF"
SHA=$(git -C "$TEST_SRC" rev-parse FETCH_HEAD); SHORT=${SHA:0:12}
BUILD="$(dirname "$TEST_SRC")/build-web-$SHORT"
[[ -d "$BUILD" ]] || git -C "$TEST_SRC" worktree add --detach "$BUILD" "$SHA"
log "build $SHORT in $BUILD (VITE_DEMO=$TEST_DEMO, VITE_VIEWPORT_DIAG=$TEST_DIAG)"
ENVS=(-e CI=1 -e KEYO_COMMIT="$SHA" -e VITE_API_URL="" -e VITE_VIEWPORT_DIAG="$TEST_DIAG")
[[ "$TEST_DEMO" == 1 ]] && ENVS+=(-e VITE_DEMO=1)
docker run --rm -v "$BUILD":/w -w /w "${ENVS[@]}" \
  node:22-alpine sh -c 'corepack enable && pnpm install --frozen-lockfile --filter "@casino/web..." >/dev/null && pnpm --dir apps/web build >/dev/null && chown -R '"$(id -u):$(id -g)"' /w'
DIST="$BUILD/apps/web/dist"
grep -q "keyo-build\" content=\"$SHORT" "$DIST/index.html" || die "build stamp missing in $DIST/index.html"
TS=$(date -u +%Y%m%d-%H%M%S)

if [[ -n "${TEST_STATIC_DIR:-}" ]]; then
  BAK="${TEST_STATIC_DIR%/}.bak-$TS"
  log "backup $TEST_STATIC_DIR -> $BAK"; cp -a "$TEST_STATIC_DIR" "$BAK"
  # Assets first, index.html last (players switch only when the new shell is in place); old hashed
  # assets are left in place (harmless, and they are in the backup anyway).
  D="${TEST_STATIC_DIR%/}"
  mkdir -p "$D/assets" && cp -a "$DIST/assets/." "$D/assets/"
  for f in "$DIST"/*; do [[ "$(basename "$f")" =~ ^(assets|index.html)$ ]] || cp -a "$f" "$D/"; done
  cp -a "$DIST/index.html" "$D/index.html"
  echo "Rollback: rm -rf $D && mv $BAK $D"
else
  BAK="$(dirname "$TEST_SRC")/web-srv-backup-$TS"
  log "backup $TEST_WEB_CONTAINER:/srv -> $BAK"; docker cp "$TEST_WEB_CONTAINER":/srv "$BAK"
  # Same order: assets, other files, index.html last.
  docker cp "$DIST/assets/." "$TEST_WEB_CONTAINER":/srv/assets/
  for f in "$DIST"/*; do [[ "$(basename "$f")" =~ ^(assets|index.html)$ ]] || docker cp "$f" "$TEST_WEB_CONTAINER":/srv/; done
  docker cp "$DIST/index.html" "$TEST_WEB_CONTAINER":/srv/index.html
  echo "Rollback: docker cp $BAK/. $TEST_WEB_CONTAINER:/srv/   (recreating the container also restores its image's files)"
fi
log "deployed $SHA — verify: curl -s https://test.play.keyogame.com/ | grep -o '<meta name=\"keyo-build\"[^>]*>'"
