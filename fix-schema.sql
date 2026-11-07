-- ============================================================
-- NNTime — починка схемы и прав доступа
-- Supabase → SQL Editor → New query → вставить → Run
-- Безопасно запускать повторно.
--
-- В этой базе settings — ОДНА общая строка (без user_id),
-- а work_logs — записи пользователя (с user_id).
-- ============================================================

-- 1. Недостающие колонки
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS end_of_shift_minute smallint NOT NULL DEFAULT 0;

ALTER TABLE work_logs
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE work_logs
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- 2. Права на settings для авторизованных пользователей приложения.
--    Раньше политики ссылались на user_id, которого в таблице нет,
--    поэтому любая запись настроек отклонялась (RLS).
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settings_select ON settings;
DROP POLICY IF EXISTS settings_insert ON settings;
DROP POLICY IF EXISTS settings_update ON settings;
DROP POLICY IF EXISTS settings_delete ON settings;

CREATE POLICY settings_select ON settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY settings_insert ON settings
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY settings_update ON settings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY settings_delete ON settings
  FOR DELETE TO authenticated USING (true);

-- 3. Права на work_logs — только свои записи
ALTER TABLE work_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS work_logs_select ON work_logs;
DROP POLICY IF EXISTS work_logs_insert ON work_logs;
DROP POLICY IF EXISTS work_logs_update ON work_logs;
DROP POLICY IF EXISTS work_logs_delete ON work_logs;

CREATE POLICY work_logs_select ON work_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY work_logs_insert ON work_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY work_logs_update ON work_logs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY work_logs_delete ON work_logs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 4. Проверка результата
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'settings' ORDER BY column_name;
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'work_logs' ORDER BY column_name;
