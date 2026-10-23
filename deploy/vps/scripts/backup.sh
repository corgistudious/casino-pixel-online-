#!/usr/bin/env bash
# Daily backup of the Keyo Game database only (pg_dump custom format), verified with
# pg_restore --list, then old Keyo backups past BACKUP_RETENTION_DAYS are pruned.
# Run by keyo-game-backup.timer; safe to run by hand at any time.
# shellcheck source=common.sh
source "$(dirname "$0")/common.sh"
require_env_file

db=$(env_value POSTGRES_DB); db=${db:-keyo_game}
retention=$(env_value BACKUP_RETENTION_DAYS); retention=${retention:-14}
dir="$KEYO_BACKUP_DIR/daily"
mkdir -p "$dir" && chmod 700 "$KEYO_BACKUP_DIR" "$dir"
file="$dir/keyo-${db}-daily-$(date -u +%Y-%m-%dT%H-%M-%SZ).dump"
tmp="$file.partial"

log "backing up database $db"
compose exec -T postgres pg_dump --username keyo --format=custom --no-owner "$db" > "$tmp"
compose exec -T postgres pg_restore --list < "$tmp" | grep -q 'TABLE DATA public users' || { rm -f "$tmp"; die "backup verification failed"; }
mv "$tmp" "$file" && chmod 600 "$file"
log "backup ok: $file ($(du -h "$file" | cut -f1))"

# Only files this script created are pruned.
find "$dir" -maxdepth 1 -type f -name 'keyo-*-daily-*.dump' -mtime +"$retention" -print -delete | sed 's/^/pruned: /'
