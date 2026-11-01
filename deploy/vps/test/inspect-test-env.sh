#!/usr/bin/env bash
# READ-ONLY inspection of the Keyo Test environment on the shared VPS. Changes nothing: no
# docker start/stop/up/down, no file writes, no database or Redis access.
# Usage: bash inspect-test-env.sh [TEST_SRC] [TEST_HOST]  > test-env-report.txt
set -uo pipefail
TEST_SRC="${1:-/opt/keyo-game-pr29-1-work/source}"
TEST_HOST="${2:-test.play.keyogame.com}"
hr() { printf '\n===== %s =====\n' "$*"; }

hr "host"; hostname; uptime; free -m; df -h / /opt 2>/dev/null; nproc
hr "docker containers (name | image | compose project | service | ports | status)"
docker ps -a --format '{{.Names}}|{{.Image}}|{{.Label "com.docker.compose.project"}}|{{.Label "com.docker.compose.service"}}|{{.Ports}}|{{.Status}}' | column -t -s '|'
hr "compose projects"; docker compose ls -a 2>/dev/null
hr "host reverse proxy entries for $TEST_HOST (nginx / caddy / traefik labels)"
grep -RIn --include='*' -e "$TEST_HOST" /etc/nginx /etc/caddy /etc/apache2 2>/dev/null | head -40
for c in $(docker ps --format '{{.Names}}'); do docker inspect "$c" --format '{{range $k,$v := .Config.Labels}}{{$k}}={{$v}}{{"\n"}}{{end}}' 2>/dev/null | grep -i "$TEST_HOST" | sed "s/^/$c: /"; done
hr "what $TEST_HOST serves (shell headers + build stamp + main bundle)"
curl -sSI "https://$TEST_HOST/" | grep -iE '^HTTP|cache-control|server|last-modified|etag'
curl -sS "https://$TEST_HOST/" | grep -oE '<meta name="keyo-build"[^>]*>|assets/index-[^"]+\.js' | sort -u
curl -sS "https://$TEST_HOST/api/health" ; echo
hr "test source $TEST_SRC (git state only)"
if [ -d "$TEST_SRC/.git" ] || [ -f "$TEST_SRC/.git" ]; then
  git -C "$TEST_SRC" remote -v | head -2
  git -C "$TEST_SRC" branch --show-current; git -C "$TEST_SRC" log --oneline -3
  echo "-- uncommitted changes:"; git -C "$TEST_SRC" status --short | head -40
  git -C "$TEST_SRC" worktree list
  stat -c "%y %n" "$TEST_SRC/apps/web/dist/index.html" 2>/dev/null
else echo "not a git checkout"; fi
hr "Production (read-only): /opt/keyo-game git + web/server container start times"
git -C /opt/keyo-game log --oneline -1 2>/dev/null
for c in $(docker ps --filter label=com.docker.compose.project=keyo-game --format '{{.Names}}'); do echo "$c $(docker inspect "$c" --format '{{.Config.Image}} started {{.State.StartedAt}}')"; done
hr "tools"; for t in node pnpm docker git; do printf '%s: ' "$t"; command -v "$t" >/dev/null && "$t" --version 2>/dev/null | head -1 || echo missing; done
