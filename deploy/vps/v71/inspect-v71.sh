#!/usr/bin/env bash
# READ-ONLY inspection of the Keyo V7.1 environment on the shared VPS, compared with Production V7.0.
# Changes NOTHING: no docker start/stop/up/down/exec, no file writes, no nginx reload, no database or
# Redis queries. Secrets are masked (only variable NAMES, DB host/name and data mode are printed).
# Usage:  sudo bash inspect-v71.sh <v71-domain> [v71-dir]  > v71-report.txt 2>&1
#   e.g.  sudo bash inspect-v71.sh test.play.keyogame.com /opt/keyo-game-pr29-1-work
set -uo pipefail
V71_HOST="${1:?usage: inspect-v71.sh <v71-domain> [v71-dir]}"
V71_DIR="${2:-}"
PROD_HOST="${PROD_HOST:-play.keyogame.com}"
hr() { printf '\n===== %s =====\n' "$*"; }
mask() { sed -E 's#(://[^:/@]+):[^@]*@#\1:***@#g; s#((PASSWORD|SECRET|TOKEN|KEY)[A-Z_]*=).*#\1***#Ig'; }

hr "host"; hostname; uptime; free -m; df -h / /opt /var/lib/docker 2>/dev/null; nproc
hr "docker containers (name | image | project | service | ports | status | cpu/mem limits)"
docker ps -a --format '{{.Names}}|{{.Image}}|{{.Label "com.docker.compose.project"}}|{{.Label "com.docker.compose.service"}}|{{.Ports}}|{{.Status}}' | column -t -s '|'
for c in $(docker ps --format '{{.Names}}'); do printf '%s nanocpus=%s mem=%s\n' "$c" "$(docker inspect "$c" --format '{{.HostConfig.NanoCpus}}')" "$(docker inspect "$c" --format '{{.HostConfig.Memory}}')"; done
hr "compose projects"; docker compose ls -a 2>/dev/null
hr "live resource use"; docker stats --no-stream --format '{{.Name}} cpu={{.CPUPerc}} mem={{.MemUsage}}' 2>/dev/null

hr "nginx: enabled sites"; ls -l /etc/nginx/sites-enabled/ 2>/dev/null; ls /etc/nginx/conf.d/ 2>/dev/null
hr "nginx: server blocks for $V71_HOST and $PROD_HOST (from nginx -T, read-only)"
NGX=$(nginx -T 2>/dev/null)
for H in "$V71_HOST" "$PROD_HOST"; do
  echo "--- $H"
  # Print every server { } block that names the host (only routing lines).
  printf '%s\n' "$NGX" | awk -v h="$H" '
    /^[[:space:]]*server[[:space:]]*\{/ {inb=1; depth=0; buf=""}
    inb { buf=buf"\n"$0; depth+=gsub(/\{/,"{"); depth-=gsub(/\}/,"}"); if (depth<=0) { if (buf ~ ("server_name[^;]*" h)) print buf; inb=0 } }' |
    grep -E 'server_name|listen|root |proxy_pass|ssl_certificate |location|return 30|try_files|alias ' | sed 's/^[[:space:]]*/  /'
done
hr "upstreams"; printf '%s\n' "$NGX" | grep -A3 -E '^\s*upstream ' | sed 's/^[[:space:]]*/  /'

hr "which container serves each proxied port"
for port in $(printf '%s\n' "$NGX" | grep -oE '127\.0\.0\.1:[0-9]+|localhost:[0-9]+' | cut -d: -f2 | sort -u); do
  owner=$(docker ps --format '{{.Names}} {{.Ports}}' | grep -E "[:]${port}->" | awk '{print $1}')
  echo "port $port -> ${owner:-<no container: host process?>}"
done

hr "V7.1 over HTTPS"
curl -sSI "https://$V71_HOST/" | grep -iE '^HTTP|cache-control|content-type|server'
curl -sS "https://$V71_HOST/" | grep -oE '<meta name="keyo-build"[^>]*>|assets/index-[^"]+\.(js|css)|rel="manifest"[^>]*' | sort -u
echo "-- /api/health:"; curl -sS -m 5 "https://$V71_HOST/api/health"; echo
echo "-- manifest:"; curl -sSI "https://$V71_HOST/manifest.webmanifest" | grep -iE '^HTTP|content-type|cache-control'
hr "Production $PROD_HOST (read-only)"
curl -sS "https://$PROD_HOST/" | grep -oE '<meta name="keyo-build"[^>]*>' ; echo "-- /api/health:"; curl -sS -m 5 "https://$PROD_HOST/api/health"; echo

hr "backend / database of every Keyo server container (secrets masked)"
for c in $(docker ps --format '{{.Names}}'); do
  envs=$(docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null)
  printf '%s\n' "$envs" | grep -qE '^(DATABASE_URL|REDIS_URL)=' || continue
  echo "--- $c (project $(docker inspect "$c" --format '{{index .Config.Labels "com.docker.compose.project"}}'), image $(docker inspect "$c" --format '{{.Config.Image}}'), started $(docker inspect "$c" --format '{{.State.StartedAt}}'))"
  printf '%s\n' "$envs" | grep -E '^(DATABASE_URL|REDIS_URL|REDIS_PREFIX|NODE_ENV|DATA_MODE|KEYO_DATA_MODE|APP_URL|PORT)=' | mask
  echo "  env names: $(printf '%s\n' "$envs" | cut -d= -f1 | tr '\n' ' ')"
done

hr "web containers (static files they serve)"
for c in $(docker ps --format '{{.Names}}'); do
  img=$(docker inspect "$c" --format '{{.Config.Image}}')
  case "$img" in *caddy*|*nginx*|*web*) ;; *) continue;; esac
  echo "--- $c image=$img project=$(docker inspect "$c" --format '{{index .Config.Labels "com.docker.compose.project"}}')"
  docker inspect "$c" --format '{{range .Mounts}}  mount {{.Source}} -> {{.Destination}} ({{.Type}}){{println}}{{end}}'
done

hr "git checkouts under /opt (branch, commit, uncommitted file count)"
for d in /opt/*/ /opt/*/source/; do
  [ -e "$d/.git" ] || continue
  printf '%s | %s | %s | dirty=%s\n' "$d" "$(git -C "$d" branch --show-current 2>/dev/null)" "$(git -C "$d" log --oneline -1 2>/dev/null)" "$(git -C "$d" status --short 2>/dev/null | wc -l)"
done
[ -n "$V71_DIR" ] && { hr "V7.1 dir $V71_DIR"; ls -la "$V71_DIR" 2>/dev/null | head -30; }

hr "certificates (names + expiry)"; certbot certificates 2>/dev/null | grep -E 'Certificate Name|Domains|Expiry' || ls /etc/letsencrypt/live 2>/dev/null
hr "firewall (read-only)"; ufw status 2>/dev/null | head -20
hr "tools"; for t in docker git curl nginx; do printf '%s: ' "$t"; command -v "$t" >/dev/null && "$t" --version 2>&1 | head -1 || echo missing; done
echo; echo "Done. Nothing was changed."
