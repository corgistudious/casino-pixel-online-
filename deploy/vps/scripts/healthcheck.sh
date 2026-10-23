#!/usr/bin/env bash
# Exit 0 when the Keyo Game stack answers through the loopback port; for cron or uptime monitors.
# shellcheck source=common.sh
source "$(dirname "$0")/common.sh"
port=$(env_value KEYO_HTTP_PORT 2>/dev/null || true); port=${port:-18480}
body=$(curl -fsS --max-time 5 "http://127.0.0.1:$port/api/health") || die "health endpoint unreachable on 127.0.0.1:$port"
echo "$body" | grep -q '"ok":true' || die "unhealthy: $body"
log "healthy: $body"
compose ps --format 'table {{.Service}}\t{{.Status}}'
