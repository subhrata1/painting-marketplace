#!/bin/bash
# The Brush Collective — Automated Database Backup

SITE="https://www.thebrushcollective.com"
BACKUP_DIR="$(dirname "$0")/backups"
TOKEN="b320fc0b121b1775732769a60419a17eb305c614667b22e92e24abf79d370354"
DATE=$(date +%Y-%m-%d_%H%M)

mkdir -p "$BACKUP_DIR"

HTTP_CODE=$(curl -s -o "$BACKUP_DIR/backup-$DATE.db" -w "%{http_code}" \
  "$SITE/api/admin/backup?token=$TOKEN")

if [ "$HTTP_CODE" = "200" ]; then
  SIZE=$(ls -lh "$BACKUP_DIR/backup-$DATE.db" | awk '{print $5}')
  echo "$(date): Backup saved — backup-$DATE.db ($SIZE)"

  # Keep only last 30 backups
  ls -t "$BACKUP_DIR"/backup-*.db 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null
else
  echo "$(date): Backup failed (HTTP $HTTP_CODE)"
  rm -f "$BACKUP_DIR/backup-$DATE.db"
  exit 1
fi
