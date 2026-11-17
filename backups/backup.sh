#!/usr/bin/env bash
# NNTime — резервная копия базы Supabase через pg_dump
# Строка подключения хранится в /root/.nntime_db_url (права 600, одна строка).
set -euo pipefail
umask 077

ENV_FILE="/root/.nntime_db_url"
DEST="/root/backups/nntime"
KEEP_DAYS=30
LOG="$DEST/backup.log"

if [ ! -r "$ENV_FILE" ]; then
  echo "$(date -Is) ERROR нет файла со строкой подключения: $ENV_FILE" >&2
  exit 1
fi

DB_URL="$(tr -d '\r\n' < "$ENV_FILE")"
if [ -z "$DB_URL" ]; then
  echo "$(date -Is) ERROR файл $ENV_FILE пустой" >&2
  exit 1
fi

mkdir -p "$DEST"

STAMP="$(date +%F_%H%M)"
FILE="$DEST/nntime_${STAMP}.sql.gz"

# Дамп только прикладной схемы public: таблицы, данные, индексы, политики RLS
if pg_dump "$DB_URL" \
      --schema=public \
      --no-owner \
      --no-privileges \
      --clean --if-exists \
      --quote-all-identifiers \
      2>>"$LOG" | gzip -9 > "$FILE.tmp"; then
  mv "$FILE.tmp" "$FILE"
else
  rm -f "$FILE.tmp"
  echo "$(date -Is) ERROR pg_dump завершился с ошибкой, см. $LOG" >&2
  exit 1
fi

# Проверка, что в дампе есть наши таблицы
# (pg_dump запускается с --quote-all-identifiers, поэтому имена в кавычках)
if ! zcat "$FILE" | grep -qE '^CREATE TABLE "?public"?\."?work_logs"?'; then
  echo "$(date -Is) ERROR в дампе нет таблицы work_logs — копия подозрительная" >&2
  exit 1
fi

if ! zcat "$FILE" | grep -qE '^CREATE TABLE "?public"?\."?settings"?'; then
  echo "$(date -Is) ERROR в дампе нет таблицы settings — копия подозрительная" >&2
  exit 1
fi

sha256sum "$FILE" > "$FILE.sha256"

SIZE="$(du -h "$FILE" | cut -f1)"
ROWS="$(zcat "$FILE" | awk '/^COPY "?public"?\."?work_logs"? /{f=1;next} f&&/^\\\.$/{f=0} f{n++} END{print n+0}')"
SETTINGS="$(zcat "$FILE" | awk '/^COPY "?public"?\."?settings"? /{f=1;next} f&&/^\\\.$/{f=0} f{n++} END{print n+0}')"

# Ротация
find "$DEST" -name 'nntime_*.sql.gz' -mtime +"$KEEP_DAYS" -delete
find "$DEST" -name '*.sql.gz.sha256' -mtime +"$KEEP_DAYS" -delete

echo "$(date -Is) OK $(basename "$FILE") $SIZE | записей work_logs: $ROWS, строк settings: $SETTINGS" | tee -a "$LOG"
