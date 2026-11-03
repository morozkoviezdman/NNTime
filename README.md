# NNTime — «Рабочее время» (PWA + Supabase)

Панель учёта сверхнормативного времени на работе. Открываешь сайт, входишь через почту+пароль, нажимаешь кнопку — время фиксируется в Supabase. Отчёт считается на клиенте за выбранный период.

## Структура проекта

- `src/supabaseClient.ts` — клиент Supabase (anon-ключ, persistSession, autoRefreshToken).
- `src/stores/auth.ts` — Pinia-сторед: сессия, регистрация, вход.
- `src/router/index.ts` — маршруты: `/`, `/app`, `/report` с guards.
- `src/views/LoginView.vue` — вход/регистрация.
- `src/views/MainView.vue` — главная: кнопка фиксации, норма, краткая сводка.
- `src/views/ReportView.vue` — отчёт по `settings` + `work_logs`;
- `src/utils/db.ts` — `getWorkLogs`, `recordWorkSession`, `calculateOvertimeMinutes`.
- `src/utils/types.ts` — типы `Database` для `settings` и `work_logs`.
- `src/styles/global.css` — дизайн.
- `vite.config.ts` — `base` по переменной `GITHUB_PAGES_BASE` (GitHub Pages).
- `.github/workflows/deploy.yml` — автоматический деплой на GitHub Pages.

## База данных (Supabase)

Также смотреть в `supabase-setup.sql` (скорее всего, его нет в этом репозитории).

### Таблицы

```sql
-- settings: настройки проекта
CREATE TABLE settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  end_of_shift_hour smallint NOT NULL DEFAULT 18,   -- окончание смены (по норме)
  period_start date NOT NULL,                        -- начало периода отчёта
  period_end date NOT NULL,                          -- конец периода отчёта
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- work_logs: запись о смене
CREATE TABLE work_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  press_time timestamptz NOT NULL,
  overtime_minutes integer NOT NULL DEFAULT 0,       -- минуты сверх нормы
  note text NULL,                                    -- примечание
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Индекс по user_id + date
CREATE INDEX idx_work_logs_user ON work_logs(user_id, date);

-- RLS: видит и пишет только свой user_id
ALTER TABLE work_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_logs_select ON work_logs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY work_logs_insert ON work_logs FOR INSERT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY work_logs_update ON work_logs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY work_logs_delete ON work_logs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
```

## Локальный запуск

```bash
cp .env.example .env   # вставь сюда свой URL и anon-ключ
npm install
npm run dev
```

## Сборка & деплой

```bash
npm run build      # -> dist/
npm run preview    # локальный прогон собранного
```

### GitHub Pages

1. Создай репозиторий `NNTime` (или любое другое).
2. В `vite.config.ts` оставь `base: '/NNTime/'` (или `process.env.GITHUB_PAGES_BASE` для гибкости).
3. Залить `git push`.
4. В настройках репозитория **Settings → Pages** выбрать ветку `main` и папку `/root/workspace/supabase-pwa/dist` (GitHub Actions сделает это автоматически, если workflow включён).
5. Потом сайт будет по адресу `https://<ваш-логин>.github.io/NNTime/`.

> На macOS нельзя собиратьIPA для iOS; PWA в Safari — «Add to Home Screen» — правильное решение без оборудования.

## Безопасность

- В браузер идёт только `VITE_SUPABASE_ANON_KEY` (публичный).
- `service_role` / `sb_secret_xxx` — только серверное окружение, не класть в репозиторий.
- RLS: `work_logs` доступно только для текущего пользователя (`auth.uid() = user_id`).
- Пароли в Supabase хранятся как хэш; никогда не выкладывайте секреты.


