-- ============================================================
-- NNTime — схема базы для Supabase
-- Supabase → SQL Editor → New query → вставить → Run
-- Скрипт идемпотентный: можно запускать повторно.
-- ============================================================

-- 1. Настройки приложения (одна общая строка)
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  end_of_shift_hour smallint NOT NULL DEFAULT 18,   -- час окончания смены (по норме)
  end_of_shift_minute smallint NOT NULL DEFAULT 0,  -- минуты окончания смены
  period_start date NOT NULL,                       -- начало периода отчёта
  period_end date NOT NULL,                         -- конец периода отчёта
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- миграции для баз, созданных ранее
ALTER TABLE settings ADD COLUMN IF NOT EXISTS end_of_shift_minute smallint NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2. Записи о переработке (по одной на дату у пользователя)
CREATE TABLE IF NOT EXISTS work_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  press_time timestamptz NOT NULL,
  overtime_minutes integer NOT NULL DEFAULT 0,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- 3. Индексы
CREATE INDEX IF NOT EXISTS idx_work_logs_user ON work_logs(user_id, date);

-- одна запись на дату: защита от дублей на уровне базы
CREATE UNIQUE INDEX IF NOT EXISTS work_logs_user_date_uniq ON work_logs(user_id, date);

-- 4. Права доступа (RLS)

-- settings: общая строка, доступна авторизованным пользователям приложения
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settings_select ON settings;
DROP POLICY IF EXISTS settings_insert ON settings;
DROP POLICY IF EXISTS settings_update ON settings;
DROP POLICY IF EXISTS settings_delete ON settings;

CREATE POLICY settings_select ON settings FOR SELECT TO authenticated USING (true);
CREATE POLICY settings_insert ON settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY settings_update ON settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY settings_delete ON settings FOR DELETE TO authenticated USING (true);

-- work_logs: пользователь видит и меняет только свои записи
ALTER TABLE work_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS work_logs_select ON work_logs;
DROP POLICY IF EXISTS work_logs_insert ON work_logs;
DROP POLICY IF EXISTS work_logs_update ON work_logs;
DROP POLICY IF EXISTS work_logs_delete ON work_logs;

CREATE POLICY work_logs_select ON work_logs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY work_logs_insert ON work_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY work_logs_update ON work_logs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY work_logs_delete ON work_logs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- 5. Стартовая строка настроек (если таблица пустая)
INSERT INTO settings (end_of_shift_hour, end_of_shift_minute, period_start, period_end)
SELECT 18, 0, current_date - 365, current_date
WHERE NOT EXISTS (SELECT 1 FROM settings);
