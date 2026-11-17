-- NNTime: персональные настройки
-- Было: одна общая строка settings на всё приложение (период и время менялись у всех).
-- Стало: у каждого аккаунта своя строка, RLS не даёт видеть и менять чужие.
--
-- Выполнять в Supabase → SQL Editor. Скрипт идемпотентный, можно запускать повторно.
-- Перед запуском сделайте резервную копию (бэкап уже настроен).

begin;

-- 1. Привязка настроек к пользователю
alter table settings
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 2. Старую общую строку отдаём владельцу с наибольшим числом записей —
--    так сохранённые период и время не потеряются у основного аккаунта
update settings s
set user_id = (
  select w.user_id
  from work_logs w
  group by w.user_id
  order by count(*) desc
  limit 1
)
where s.user_id is null;

-- 3. Если привязать не к кому (нет записей) — общая строка удаляется,
--    каждый аккаунт получит значения по умолчанию
delete from settings where user_id is null;

-- 4. Одна строка настроек на пользователя
create unique index if not exists settings_user_id_key on settings(user_id);

do $$
begin
  if not exists (select 1 from settings where user_id is null) then
    alter table settings alter column user_id set not null;
  end if;
end $$;

-- 5. RLS: только свои настройки
alter table settings enable row level security;

drop policy if exists settings_select on settings;
drop policy if exists settings_insert on settings;
drop policy if exists settings_update on settings;
drop policy if exists settings_delete on settings;
drop policy if exists settings_owner_all on settings;

create policy settings_select on settings
  for select to authenticated using (user_id = auth.uid());

create policy settings_insert on settings
  for insert to authenticated with check (user_id = auth.uid());

create policy settings_update on settings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy settings_delete on settings
  for delete to authenticated using (user_id = auth.uid());

commit;

-- Проверка результата
select user_id, period_start, period_end, end_of_shift_hour, end_of_shift_minute, updated_at
from settings
order by updated_at desc;