#!/usr/bin/env bash
# Deploys ONLY the web frontend of feat/hd-game-ui (all 8 games, new table layout) to the Keyo V7.1
# environment. Never touches Production V7.0 (/opt/keyo-game, compose project "keyo-game"), never
# restarts or recreates a container, never touches nginx, a database, Redis or player data.
# The V7.1 checkout's working tree is not modified (the build runs in a separate git worktree).
#
# Run inspect-v71.sh first and fill these in from its report:
#   V71_HOST=v71.domain            V7.1 public domain (must differ from Production)
#   V71_SRC=/path/to/checkout      git checkout used for V7.1 builds (outside /opt/keyo-game)
#   V71_DEMO=1|0                   1 = UI demo, no backend calls (always safe)
#                                  0 = real V7.1 backend; allowed ONLY when it reports dataMode "test"
#                                      and its database differs from Production's (checked below)
#   and ONE target:
#   V71_STATIC_DIR=/path           host directory nginx serves V7.1 from, or
#   V71_WEB_CONTAINER=name         V7.1 web container (Caddy, /srv) — files copied in, no restart
# Optional:
#   REF=feat/hd-game-ui  EXPECT_SHA=a63d23f  V71_SERVER_CONTAINER=name (needed when V71_DEMO=0)
#   PROD_HOST=play.keyogame.com  PROD_PROJECT=keyo-game  V71_DIAG=1 (viewport overlay)  V71_PWA_BLOCK=off
set -euo pipefail
REF="${REF:-feat/hd-game-ui}"
PROD_HOST="${PROD_HOST:-play.keyogame.com}"
PROD_PROJECT="${PROD_PROJECT:-keyo-game}"
V71_DIAG="${V71_DIAG:-1}"
V71_PWA_BLOCK="${V71_PWA_BLOCK:-off}"
log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { log "STOP: $*" >&2; exit 1; }
is_prod_path() { case "$(realpath -m "$1")" in /opt/keyo-game|/opt/keyo-game/*) return 0;; *) return 1;; esac; }
project_of() { docker inspect "$1" --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null; }
db_of() { docker inspect "$1" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's#^DATABASE_URL=[^:]*://[^@]*@\([^?]*\).*#\1#p'; }
prod_started() { for c in $(docker ps --filter "label=com.docker.compose.project=$PROD_PROJECT" --format '{{.Names}}'); do echo "$c $(docker inspect "$c" --format '{{.State.StartedAt}}')"; done | sort; }

# ---- 1. target checks (nothing is changed before all of them pass)
[[ -n "${V71_HOST:-}" ]] || die "set V71_HOST"
[[ "$V71_HOST" != "$PROD_HOST" ]] || die "V71_HOST is the Production domain"
[[ -n "${V71_SRC:-}" && -e "${V71_SRC}/.git" ]] || die "set V71_SRC to the V7.1 git checkout"
is_prod_path "$V71_SRC" && die "V71_SRC points into Production"
[[ "${V71_DEMO:-}" =~ ^[01]$ ]] || die "set V71_DEMO=1 (UI demo) or 0 (real V7.1 test backend)"
[[ -n "${V71_STATIC_DIR:-}" || -n "${V71_WEB_CONTAINER:-}" ]] || die "set V71_STATIC_DIR or V71_WEB_CONTAINER"
if [[ -n "${V71_STATIC_DIR:-}" ]]; then
  is_prod_path "$V71_STATIC_DIR" && die "V71_STATIC_DIR is inside Production"
  [[ -f "$V71_STATIC_DIR/index.html" ]] || die "$V71_STATIC_DIR has no index.html"
fi
if [[ -n "${V71_WEB_CONTAINER:-}" ]]; then
  p=$(project_of "$V71_WEB_CONTAINER") || die "no container $V71_WEB_CONTAINER"
  [[ "$p" != "$PROD_PROJECT" ]] || die "$V71_WEB_CONTAINER belongs to the Production compose project"
  docker exec "$V71_WEB_CONTAINER" test -f /srv/index.html || die "$V71_WEB_CONTAINER has no /srv/index.html"
fi
# The domain must currently serve the same shell as the target we are about to replace.
LIVE=$(curl -fsS "https://$V71_HOST/" | grep -oE 'assets/index-[^"]+\.js' | head -1) || die "https://$V71_HOST/ is not reachable"
if [[ -n "${V71_STATIC_DIR:-}" ]]; then grep -q "$LIVE" "$V71_STATIC_DIR/index.html" || die "$V71_HOST does not serve $V71_STATIC_DIR (live bundle $LIVE)"
else docker exec "$V71_WEB_CONTAINER" grep -q "$LIVE" /srv/index.html || die "$V71_HOST is not served by $V71_WEB_CONTAINER (live bundle $LIVE)"; fi

# Real backend only if it is provably a test backend on a non-Production database.
if [[ "$V71_DEMO" == 0 ]]; then
  H=$(curl -fsS -m 5 "https://$V71_HOST/api/health") || die "V7.1 has no reachable /api/health — use V71_DEMO=1"
  grep -q '"dataMode":"test"' <<<"$H" || die "V7.1 backend does not report dataMode test ($H) — use V71_DEMO=1"
  [[ -n "${V71_SERVER_CONTAINER:-}" ]] || die "set V71_SERVER_CONTAINER to compare databases"
  [[ "$(project_of "$V71_SERVER_CONTAINER")" != "$PROD_PROJECT" ]] || die "V71_SERVER_CONTAINER is a Production container"
  V71_DB=$(db_of "$V71_SERVER_CONTAINER"); [[ -n "$V71_DB" ]] || die "cannot read the V7.1 database host/name"
  for c in $(docker ps --filter "label=com.docker.compose.project=$PROD_PROJECT" --format '{{.Names}}'); do
    d=$(db_of "$c"); [[ -z "$d" || "$d" != "$V71_DB" ]] || die "V7.1 uses the Production database ($d)"
  done
  log "V7.1 backend: dataMode test, database $V71_DB (not Production's)"
fi

# ---- 2. build in a separate worktree, in a throw-away container with CPU/RAM limits
log "fetch $REF (working tree of $V71_SRC is not touched)"
git -C "$V71_SRC" fetch origin "$REF"
SHA=$(git -C "$V71_SRC" rev-parse FETCH_HEAD); SHORT=${SHA:0:12}
[[ -z "${EXPECT_SHA:-}" || "$SHA" == "$EXPECT_SHA"* ]] || die "origin/$REF is $SHORT, expected $EXPECT_SHA"
BUILD="$(dirname "$(realpath "$V71_SRC")")/build-v71-web-$SHORT"
[[ -d "$BUILD" ]] || git -C "$V71_SRC" worktree add --detach "$BUILD" "$SHA"
log "build $SHORT (VITE_DEMO=$V71_DEMO, VITE_PWA_BLOCK=$V71_PWA_BLOCK, VITE_VIEWPORT_DIAG=$V71_DIAG) — limited to 1.5 CPU / 2 GB"
ENVS=(-e CI=1 -e KEYO_COMMIT="$SHA" -e VITE_API_URL="" -e VITE_VIEWPORT_DIAG="$V71_DIAG" -e VITE_PWA_BLOCK="$V71_PWA_BLOCK")
[[ "$V71_DEMO" == 1 ]] && ENVS+=(-e VITE_DEMO=1)
nice -n 10 docker run --rm --cpus 1.5 --memory 2g -v "$BUILD":/w -w /w "${ENVS[@]}" node:22-alpine \
  sh -c 'corepack enable && pnpm install --frozen-lockfile --filter "@casino/web..." >/dev/null && pnpm --dir apps/web build >/dev/null && chown -R '"$(id -u):$(id -g)"' /w'
DIST="$BUILD/apps/web/dist"
grep -q "keyo-build\" content=\"$SHORT" "$DIST/index.html" || die "build stamp missing in $DIST/index.html"
NEW_JS=$(grep -oE 'assets/index-[^"]+\.js' "$DIST/index.html" | head -1)

# ---- 3. backup, then copy: assets first, other files, index.html last
BEFORE=$(prod_started)
TS=$(date -u +%Y%m%d-%H%M%S)
BAKROOT="$(dirname "$(realpath "$V71_SRC")")/v71-web-backups"; mkdir -p "$BAKROOT"
RB="$BAKROOT/rollback-$TS.sh"
if [[ -n "${V71_STATIC_DIR:-}" ]]; then
  D="${V71_STATIC_DIR%/}"; BAK="$BAKROOT/static-$TS"
  log "backup $D -> $BAK"; cp -a "$D" "$BAK"
  printf '#!/usr/bin/env bash\nset -e\n# Restores the V7.1 frontend as it was before %s (deploy of %s). Same directory, no restart.\nB="%s"; D="%s"\n[ -f "$B/index.html" ] || { echo "backup missing"; exit 1; }\nfind "$D" -mindepth 1 -delete\ncp -a "$B/." "$D/"\necho restored\n' "$TS" "$SHORT" "$BAK" "$D" > "$RB"
  mkdir -p "$D/assets" && cp -a "$DIST/assets/." "$D/assets/"
  for f in "$DIST"/*; do [[ "$(basename "$f")" =~ ^(assets|index.html)$ ]] || cp -a "$f" "$D/"; done
  cp -a "$DIST/index.html" "$D/index.html"
else
  BAK="$BAKROOT/srv-$TS"
  log "backup $V71_WEB_CONTAINER:/srv -> $BAK"; docker cp "$V71_WEB_CONTAINER":/srv "$BAK"
  printf '#!/usr/bin/env bash\nset -e\n# Restores the V7.1 frontend as it was before %s (deploy of %s). No restart.\ndocker cp "%s/." %s:/srv/\necho restored\n' "$TS" "$SHORT" "$BAK" "$V71_WEB_CONTAINER" > "$RB"
  docker cp "$DIST/assets/." "$V71_WEB_CONTAINER":/srv/assets/
  for f in "$DIST"/*; do [[ "$(basename "$f")" =~ ^(assets|index.html)$ ]] || docker cp "$f" "$V71_WEB_CONTAINER":/srv/; done
  docker cp "$DIST/index.html" "$V71_WEB_CONTAINER":/srv/index.html
fi
chmod +x "$RB"

# ---- 4. verify over HTTPS, and that Production was not touched
sleep 1
LIVE_STAMP=$(curl -fsS "https://$V71_HOST/" | grep -oE '<meta name="keyo-build"[^>]*>' || true)
[[ "$LIVE_STAMP" == *"$SHORT"* ]] && log "live: $LIVE_STAMP" || log "WARNING: https://$V71_HOST/ does not show $SHORT yet (cache?) — got: $LIVE_STAMP"
for u in "/" "/$NEW_JS" "/manifest.webmanifest" "/assets/official/keyo-game-logo.png"; do
  printf '  %-60s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "https://$V71_HOST$u")"
done
[[ -n "${V71_WEB_CONTAINER:-}" ]] && log "container health: $(docker inspect "$V71_WEB_CONTAINER" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no healthcheck{{end}} started {{.State.StartedAt}}')"
[[ "$(prod_started)" == "$BEFORE" ]] && log "Production containers unchanged (same start times)" || log "WARNING: Production start times differ — check!"
log "deployed $SHA to https://$V71_HOST"
echo "Rollback: bash $RB"
