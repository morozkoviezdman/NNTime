-- ============================================================
-- NNTime — Supabase схема (PostgreSQL / Supabase)
-- Создать: в Supabase → Settings → SQL → New query → Paste & Run.
-- ============================================================

-- Таблица настроек проекта (один row)
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  end_of_shift_hour smallint NOT NULL DEFAULT 18,  -- окончание смены (по норме)
  end_of_shift_minute smallint NOT NULL DEFAULT 0, -- минуты окончания смены
  period_start date NOT NULL,                       -- начало периода отчёта
  period_end date NOT NULL,                         -- конец периода отчёта
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Добавить колонку end_of_shift_minute, если отсутствует
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'end_of_shift_minute'
  ) THEN
    ALTER TABLE settings ADD COLUMN end_of_shift_minute smallint NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Запись о смене (переработка)
CREATE TABLE IF NOT EXISTS work_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  press_time timestamptz NOT NULL,
  overtime_minutes integer NOT NULL DEFAULT 0,   -- минуты сверх нормы
  note text NULL,                                -- примечание
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Индекс по user_id + date
CREATE INDEX IF NOT EXISTS idx_work_logs_user ON work_logs(user_id, date);

-- RLS: видит и пишет только текущий пользователь
ALTER TABLE work_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_logs_select ON work_logs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY work_logs_insert ON work_logs FOR INSERT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY work_logs_update ON work_logs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY work_logs_delete ON work_logs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
