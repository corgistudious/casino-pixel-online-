#!/usr/bin/env bash
# Read-only checks before installing or updating Keyo Game on a shared VPS. Changes nothing.
# shellcheck source=common.sh
source "$(dirname "$0")/common.sh"

status=0
ok()   { printf '  OK    %s\n' "$*"; }
warn() { printf '  WARN  %s\n' "$*"; }
bad()  { printf '  FAIL  %s\n' "$*"; status=1; }

echo "== System"
. /etc/os-release 2>/dev/null && { [[ "${VERSION_ID:-}" == "24.04" ]] && ok "$PRETTY_NAME" || warn "expected Ubuntu 24.04, found ${PRETTY_NAME:-unknown}"; }
mem_mb=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
(( mem_mb >= 1800 )) && ok "available RAM ${mem_mb} MB (Keyo limits total ~2.2 GB)" || warn "available RAM ${mem_mb} MB; Keyo containers may use up to ~2.2 GB"
disk_gb=$(df -BG --output=avail "$(dirname "$KEYO_ROOT")" | tail -1 | tr -dc 0-9)
(( disk_gb >= 10 )) && ok "free disk ${disk_gb} GB" || warn "free disk ${disk_gb} GB (images + database + backups need ~10 GB)"

echo "== Docker"
command -v docker >/dev/null && ok "$(docker --version)" || bad "docker is not installed"
docker compose version >/dev/null 2>&1 && ok "$(docker compose version)" || bad "docker compose plugin is missing"
systemctl is-enabled docker >/dev/null 2>&1 && ok "docker starts at boot (containers restart after reboot)" || bad "docker is not enabled at boot: sudo systemctl enable docker"

echo "== Other apps on this VPS (left untouched)"
docker ps --format '  -     {{.Names}} ({{.Image}}) {{.Status}}' 2>/dev/null | grep -v ' keyo-game-' || echo "  -     none"

echo "== Ports"
port=$( [[ -f "$KEYO_ENV_FILE" ]] && env_value KEYO_HTTP_PORT || true )
port=${port:-18480}
if ss -ltnH "( sport = :$port )" | grep -q .; then
  if docker ps --format '{{.Names}} {{.Ports}}' | grep -q "^keyo-game-web.*:$port->"; then ok "127.0.0.1:$port is used by Keyo Game itself"
  else bad "port $port is already used by another service; choose another KEYO_HTTP_PORT"; fi
else ok "port $port is free"; fi
for p in 80 443; do
  owner=$(ss -ltnpH "( sport = :$p )" 2>/dev/null | sed -E 's/.*users:\(\("([^"]+)".*/\1/' | head -1)
  [[ -n "$owner" ]] && ok "port $p served by '$owner' (host reverse proxy; add the Keyo site there)" || warn "nothing listens on port $p; install a host reverse proxy (see docs/DEPLOYMENT_VPS.md)"
done

echo "== Keyo Game files"
[[ -d "$KEYO_ROOT/.git" ]] && ok "repository at $KEYO_ROOT ($(git -C "$KEYO_ROOT" rev-parse --short HEAD 2>/dev/null))" || warn "$KEYO_ROOT is not a git checkout yet"
if [[ -f "$KEYO_ENV_FILE" ]]; then
  mode=$(stat -c %a "$KEYO_ENV_FILE"); [[ "$mode" == "600" || "$mode" == "400" ]] && ok ".env permissions $mode" || bad ".env must be chmod 600 (is $mode)"
  for key in POSTGRES_PASSWORD JWT_SECRET APP_URL CORS_ORIGINS KEYO_DATA_MODE; do
    [[ -n "$(env_value $key)" ]] && ok "$key is set" || bad "$key is empty"
  done
  jwt=$(env_value JWT_SECRET); (( ${#jwt} >= 32 )) || bad "JWT_SECRET must be at least 32 characters"
  [[ "$(env_value KEYO_DATA_MODE)" =~ ^(test|production)$ ]] || bad "KEYO_DATA_MODE must be test or production"
  [[ -n "$(env_value SMTP_URL)" ]] && ok "SMTP_URL is set" || warn "SMTP_URL is empty: verification emails will stay queued"
else warn "$KEYO_ENV_FILE does not exist yet"; fi
[[ -d "$KEYO_BACKUP_DIR" ]] && ok "backup directory $KEYO_BACKUP_DIR" || warn "backup directory $KEYO_BACKUP_DIR does not exist yet"

echo
(( status == 0 )) && echo "Preflight passed (warnings are informational)." || echo "Preflight found problems; fix the FAIL lines before deploying."
exit $status
