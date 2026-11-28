-- Норма смены: сколько часов переработки = один «дополнительный день».
alter table settings add column if not exists shift_norm_minutes integer not null default 480;

alter table settings drop constraint if exists settings_shift_norm_range;
alter table settings add constraint settings_shift_norm_range
  check (shift_norm_minutes between 60 and 1440);
