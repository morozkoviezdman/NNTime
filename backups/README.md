# Резервные копии базы NNTime

Ежедневный дамп базы Supabase через `pg_dump` — на случай, если тариф Free (там автобэкапов нет).

## Что уже готово

- `pg_dump` 18.6 установлен
- скрипт `backup.sh`: дамп схемы `public` → gzip → `/root/backups/nntime/`
- проверка, что в дампе реально есть таблица `work_logs` (иначе копия считается битой и скрипт падает с ошибкой)
- контрольная сумма `sha256` рядом с каждым файлом
- копия **каждый день** (cron в 03:17; повторный запуск в тот же день пропускается)
- ротация: копии старше **30 дней** удаляются
- отчёт в Telegram — **раз в 7 дней**: сколько копий, общий вес, файл последней копии, число записей
- при ошибке уведомление приходит сразу, не дожидаясь недели

## Что нужно один раз сделать

1. Supabase → **Project Settings → Database → Connection string → URI**
   (вкладка **Session pooler**, порт `5432`).
2. В строке заменить `[YOUR-PASSWORD]` на пароль базы.
   Пароль: там же, **Database → Reset database password**, если не сохранён.
3. На сервере положить строку в защищённый файл (одна строка, без кавычек):

```bash
install -m 600 /dev/null /root/.nntime_db_url
nano /root/.nntime_db_url      # вставить строку, сохранить: Ctrl+O, Enter, Ctrl+X
```

Проверить, что права верные:

```bash
ls -l /root/.nntime_db_url     # должно быть -rw------- root root
```

## Проверка

```bash
/root/workspace/NNTime/backups/backup.sh
ls -lh /root/backups/nntime/
```

Ожидаемый вывод: `OK nntime_ГГГГ-ММ-ДД_ЧЧММ.sql.gz <размер>`.

## Восстановление

Восстановление в текущий проект (осторожно — перезапишет таблицы):

```bash
gunzip -c /root/backups/nntime/nntime_2026-11-17_0317.sql.gz \
  | psql "<строка подключения>" -v ON_ERROR_STOP=1
```

Проверить копию без восстановления:

```bash
zcat /root/backups/nntime/nntime_*.sql.gz | head -40
zcat /root/backups/nntime/nntime_*.sql.gz | grep -c "COPY public.work_logs"
```

## Отчёты в Telegram

Раз в неделю (маркер `/root/backups/nntime/.last_report`) в чат Hermes приходит сводка по копиям. При ошибке — немедленное предупреждение с причиной.

Отправить отчёт досрочно: удалить маркер и запустить копию.

```bash
rm -f /root/backups/nntime/.last_report
FORCE=1 /root/workspace/NNTime/backups/backup.sh
```

Проверить вручную:

```bash
FORCE=1 /root/workspace/NNTime/backups/backup.sh
```

## Ротация и диск

60 дней при копии раз в 5 дней — 12 копий, меньше 1 МБ. Если понадобится хранить дольше, поменяйте `KEEP_DAYS` в `backup.sh`.

## Полезно

- Копия лежит на том же сервере, что и приложение. Для полной безопасности раз в неделю копируйте каталог `/root/backups/nntime/` на другой носитель (или отдавайте в облако).
- Если проект перейдёт на **Pro**, автобэкапы Supabase (7 дней) включатся сами — этот cron можно оставить как дополнительную страховку.
