#!/usr/bin/env bash
# Sao lưu DB DUY NHẤT (postgres trong Docker) ra một file .dump nén.
# Dùng: bash scripts/backup-db.sh [thu_muc_dich]
# Phục hồi:
#   docker compose exec -T postgres pg_restore -U aff_user -d aff_cashback --clean < file.dump
set -euo pipefail

OUT_DIR="${1:-backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
FILE="$OUT_DIR/aff_cashback_$STAMP.dump"

echo "Đang sao lưu aff_cashback → $FILE ..."
docker compose exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$FILE"

echo "Xong. Kích thước: $(du -h "$FILE" | cut -f1)"
echo "Giữ lại vài bản gần nhất; xóa bản quá cũ nếu cần."
