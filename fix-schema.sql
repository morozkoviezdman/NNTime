-- ============================================================
-- NNTime — починка схемы под текущую версию приложения
-- Supabase → SQL Editor → New query → вставить → Run
-- Безопасно запускать повторно.
-- ============================================================

-- 1. Минуты окончания смены (нужны для настройки «18:30», а не только «18:00»)
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS end_of_shift_minute smallint NOT NULL DEFAULT 0;

-- 2. Поле updated_at у записей смены (нужно для перезаписи за ту же дату)
ALTER TABLE work_logs
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2.1 Для очень старых баз — created_at, если его нет
ALTER TABLE work_logs
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- 3. Настройки: не больше одной строки на пользователя
CREATE UNIQUE INDEX IF NOT EXISTS settings_user_id_uniq ON settings(user_id);

-- 4. Приводим возможные старые дубли к одной строке (оставляем самую свежую)
DELETE FROM settings s
USING settings s2
WHERE s.user_id = s2.user_id
  AND s.updated_at < s2.updated_at;

-- 5. Проверка результата
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'settings' ORDER BY column_name;
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'work_logs' ORDER BY column_name;
