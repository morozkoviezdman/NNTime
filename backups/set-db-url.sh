#!/usr/bin/env bash
# Сохраняет строку подключения к базе NNTime в /root/.nntime_db_url
# и сразу запускает первую резервную копию.
#
# Хост уже определён (Supabase Session pooler, регион eu-west-3):
#   aws-1-eu-west-3.pooler.supabase.com:5432
# Пользователь: postgres.iutpxajgrjkbxapztsdr
set -euo pipefail

HOST="aws-1-eu-west-3.pooler.supabase.com"
PORT="5432"
USER="postgres.iutpxajgrjkbxapztsdr"
DB="postgres"
ENV_FILE="/root/.nntime_db_url"

printf 'Пароль базы Supabase (ввод не отображается): '
IFS= read -rs PASSWORD
printf '\n'

if [ -z "${PASSWORD}" ]; then
  echo "Пароль не введён — ничего не меняю." >&2
  exit 1
fi

# Пароль может содержать @ : / ? # — кодируем
ENC_PASSWORD="$(PASSWORD="$PASSWORD" python3 -c 'import os,urllib.parse;print(urllib.parse.quote(os.environ["PASSWORD"], safe=""))')"

umask 077
printf 'postgresql://%s:%s@%s:%s/%s?sslmode=require\n' "$USER" "$ENC_PASSWORD" "$HOST" "$PORT" "$DB" > "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "Строка подключения сохранена в $ENV_FILE (права 600)."
echo
echo "Запускаю первую копию..."
/root/workspace/NNTime/backups/backup.sh
