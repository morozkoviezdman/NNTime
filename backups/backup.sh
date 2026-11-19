#!/usr/bin/env bash
# NNTime — резервная копия базы Supabase через pg_dump.
# Cron запускает скрипт ежедневно, но копия создаётся только раз в GATE_DAYS дней.
# После успешной копии в Telegram уходит краткий отчёт.
set -euo pipefail
umask 077

ENV_FILE="/root/.nntime_db_url"
DEST="/root/backups/nntime"
LOG="$DEST/backup.log"
KEEP_DAYS=30          # сколько дней хранить копии
GATE_DAYS=1           # копия каждый день
REPORT_DAYS=7         # как часто присылать отчёт в Telegram
FORCE="${FORCE:-0}"   # FORCE=1 — сделать копию немедленно, без проверки интервала

HERMES_ENV="/root/.hermes/.env"
TG_TOKEN="$(grep -oP '^TELEGRAM_BOT_TOKEN=\K.*' "$HERMES_ENV" 2>/dev/null | head -1 | tr -d '"'"'"'\r' || true)"
TG_CHAT="$(grep -oP '^TELEGRAM_HOME_CHANNEL=\K.*' "$HERMES_ENV" 2>/dev/null | head -1 | tr -d '"'"'"'\r' || true)"
TG_THREAD="$(grep -oP '^TELEGRAM_HOME_CHANNEL_THREAD_ID=\K.*' "$HERMES_ENV" 2>/dev/null | head -1 | tr -d '"'"'"'\r' || true)"
TG_CHAT="${TG_CHAT:--1004407829948}"
TG_THREAD="${TG_THREAD:-1}"

notify() {
  [ -n "${TG_TOKEN}" ] || return 0
  # тема (message_thread_id) не передаём: в этом чате отправка с темой отклоняется
  curl -s --max-time 20 -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    -d "chat_id=${TG_CHAT}" \
    -d "parse_mode=HTML" \
    -d "disable_web_page_preview=true" \
    --data-urlencode "text=$1" >/dev/null 2>&1 || true
}

fail() {
  local reason="$1"
  # одна запись: cron перенаправляет stderr в тот же лог
  echo "$(date -Is) ERROR ${reason}" >&2
  notify "⚠️ <b>Бэкап NNTime не выполнен</b>
Причина: ${reason}
Проверить: <code>tail -20 /root/backups/nntime/backup.log</code>"
  exit 1
}

[ -r "$ENV_FILE" ] || fail "нет файла со строкой подключения ${ENV_FILE}"

DB_URL="$(tr -d '\r\n' < "$ENV_FILE")"
[ -n "$DB_URL" ] || fail "файл ${ENV_FILE} пустой"

mkdir -p "$DEST"

# ── Интервал: не чаще раза в GATE_DAYS дней ──
if [ "$FORCE" != "1" ]; then
  LAST_FILE="$(ls -1t "$DEST"/nntime_*.sql.gz 2>/dev/null | head -1 || true)"
  if [ -n "$LAST_FILE" ]; then
    # считаем разницу по календарным дням, а не по 24-часовым отрезкам:
    # иначе копия, сделанная вечером вручную, отменяет утренний запуск на следующий день
    LAST_DAY_TS="$(date -d "$(date -d "@$(stat -c %Y "$LAST_FILE")" +%F)" +%s)"
    TODAY_TS="$(date -d "$(date +%F)" +%s)"
    AGE_DAYS=$(( (TODAY_TS - LAST_DAY_TS) / 86400 ))
    if [ "$AGE_DAYS" -lt "$GATE_DAYS" ]; then
      echo "$(date -Is) SKIP последняя копия ${AGE_DAYS} дн. назад, интервал ${GATE_DAYS} дн."
      exit 0
    fi
  fi
fi

STAMP="$(date +%F_%H%M)"
FILE="$DEST/nntime_${STAMP}.sql.gz"

# Дамп прикладной схемы public: таблицы, данные, индексы, политики RLS
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
  fail "pg_dump завершился с ошибкой, см. backup.log"
fi

# Проверка содержимого (имена в дампе в кавычках из-за --quote-all-identifiers)
# grep -c читает файл до конца: grep -q завершается досрочно, zcat получает SIGPIPE,
# и с pipefail проверка ложно срабатывает на целом дампе
HAS_LOGS="$(zcat "$FILE" | grep -cE '^CREATE TABLE "?public"?\."?work_logs"?')" || HAS_LOGS=0
if [ "${HAS_LOGS:-0}" -eq 0 ]; then
  mv -f "$FILE" "$FILE.rejected"
  fail "в дампе нет таблицы work_logs — файл переименован в .rejected"
fi

HAS_SETTINGS="$(zcat "$FILE" | grep -cE '^CREATE TABLE "?public"?\."?settings"?')" || HAS_SETTINGS=0
if [ "${HAS_SETTINGS:-0}" -eq 0 ]; then
  mv -f "$FILE" "$FILE.rejected"
  fail "в дампе нет таблицы settings — файл переименован в .rejected"
fi

sha256sum "$FILE" > "$FILE.sha256"

SIZE="$(du -h "$FILE" | cut -f1)"
ROWS="$(zcat "$FILE" | awk '/^COPY "?public"?\."?work_logs"? /{f=1;next} f&&/^\\\.$/{f=0} f{n++} END{print n+0}')"
SETTINGS="$(zcat "$FILE" | awk '/^COPY "?public"?\."?settings"? /{f=1;next} f&&/^\\\.$/{f=0} f{n++} END{print n+0}')"

# Ротация старых копий
find "$DEST" -name 'nntime_*.sql.gz' -mtime +"$KEEP_DAYS" -delete
find "$DEST" -name '*.sql.gz.sha256' -mtime +"$KEEP_DAYS" -delete

COUNT="$(ls -1 "$DEST"/nntime_*.sql.gz 2>/dev/null | wc -l | tr -d ' ')"
TOTAL="$(du -sh "$DEST" 2>/dev/null | cut -f1)"

echo "$(date -Is) OK $(basename "$FILE") $SIZE | записей work_logs: $ROWS, строк settings: $SETTINGS" | tee -a "$LOG"

# ── Отчёт в Telegram: раз в REPORT_DAYS дней (ошибки уходят всегда и сразу) ──
REPORT_MARK="$DEST/.last_report"
SEND_REPORT=0
if [ ! -f "$REPORT_MARK" ]; then
  SEND_REPORT=1
else
  MARK_AGE=$(( ( $(date +%s) - $(stat -c %Y "$REPORT_MARK") ) / 86400 ))
  [ "$MARK_AGE" -ge "$REPORT_DAYS" ] && SEND_REPORT=1
fi

if [ "$SEND_REPORT" = "1" ]; then
  PERIOD_FROM="$(date -d "-${REPORT_DAYS} days" +%d.%m.%Y)"
  notify "📦 <b>Бэкапы NNTime: недельный отчёт</b> (${PERIOD_FROM} — $(date +%d.%m.%Y))
Копий в хранилище: <b>${COUNT}</b>, общий вес: <b>${TOTAL}</b>
Последняя: <code>$(basename "$FILE")</code> — ${SIZE}
Записей в базе: ${ROWS}, настроек: ${SETTINGS}
Копии создаются каждый день, хранение ${KEEP_DAYS} дн."
  touch "$REPORT_MARK"
  echo "$(date -Is) REPORT отправлен недельный отчёт" >> "$LOG"
else
  echo "$(date -Is) INFO отчёт не отправлялся (раз в ${REPORT_DAYS} дн.)" >> "$LOG"
fi

