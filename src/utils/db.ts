import type { Database } from './types'
import { supabase } from '@/supabaseClient'

// Types
export type WorkLogEntry = Database['public']['Tables']['work_logs']['Row']
export type SettingsRow = Database['public']['Tables']['settings']['Row']

/** Получить все записи текущего пользователя (отчёт и редактирование). */
export async function getWorkLogs() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Нет сессии')

  const { data, error } = await supabase
    .from('work_logs')
    .select('*')
    .eq('user_id', session.user.id)
    .order('press_time', { ascending: false })

  if (error) throw error
  return data as WorkLogEntry[]
}

/** Удалить запись по id */
export async function deleteWorkLog(id: string) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Нет сессии')

  const { error } = await supabase
    .from('work_logs')
    .delete()
    .eq('id', id)
    .eq('user_id', session.user.id)

  if (error) throw error
  return { success: true }
}

/** Записать конец смены (создать новую запись). */
export async function recordWorkSession(endOfDayHour: number = 18, endOfDayMinute: number = 0) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Не авторизован. Сначала войдите через экран логина.')

  const user = session.user
  if (!user) throw new Error('Не удалось получить данные пользователя.')

  const now = new Date()
  const overtimeMinutes = calculateOvertimeMinutes(now, endOfDayHour, endOfDayMinute)

  const { error } = await supabase.from('work_logs').insert({
    user_id: user.id,
    date: now.toISOString().slice(0, 10),
    press_time: now,
    overtime_minutes: overtimeMinutes,
    note: null,
  })

  if (error) throw error
  return overtimeMinutes
}

/** Вычислить сверхнормативное время (в минутах). */
export function calculateOvertimeMinutes(pressTime: Date, endOfDayHour: number = 18, endOfDayMinute: number = 0): number {
  const localMinutes = pressTime.getHours() * 60 + pressTime.getMinutes()
  const thresholdMinutes = endOfDayHour * 60 + endOfDayMinute
  const diff = localMinutes - thresholdMinutes
  return diff > 0 ? Math.floor(diff) : 0
}

/** Получить итоги за период */
export async function getPeriodOvertime(startDate: string, endDate: string) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Нет сессии')

  const { data, error } = await supabase
    .from('work_logs')
    .select('overtime_minutes, date')
    .eq('user_id', session.user.id)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('press_time', { ascending: false })

  if (error) throw error

  let totalMinutes = 0
  const days = new Set<string>()
  for (const row of data as WorkLogEntry[]) {
    totalMinutes += row.overtime_minutes ?? 0
    if (row.date) days.add(row.date)
  }

  const totalHours = Math.floor(totalMinutes / 60)
  const totalMinLeft = totalMinutes % 60
  const totalDays = days.size

  return {
    totalMinutes,
    totalHours,
    totalMinLeft,
    totalDays,
  }
}

/** Получить настройки (первую строку) */
export async function getSettings(): Promise<SettingsRow | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Нет сессии')

  // ВАЖНО: maybeSingle() падает с ошибкой, если у пользователя больше одной строки
  // настроек (так бывало из-за старых версий, создававших случайный id).
  // Поэтому читаем список и берём самую свежую строку.
  let { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', session.user.id)
    .order('updated_at', { ascending: false })
    .limit(1)

  // На случай очень старой базы без колонки updated_at
  if (error && /updated_at/i.test(error.message ?? '')) {
    const retry = await supabase
      .from('settings')
      .select('*')
      .eq('user_id', session.user.id)
      .limit(1)
    data = retry.data
    error = retry.error
  }

  if (error) throw error
  const rows = (data ?? []) as SettingsRow[]
  return rows.length ? rows[0] : null
}

/** Обновить настройки */
export async function updateSettings(updates: Partial<SettingsRow>) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Нет сессии')

  const userId = session.user.id
  const payload: Record<string, any> = {
    end_of_shift_hour: updates.end_of_shift_hour ?? 18,
    end_of_shift_minute: updates.end_of_shift_minute ?? 0,
    period_start: updates.period_start ?? '0001-01-01',
    period_end: updates.period_end ?? '9999-12-31',
    updated_at: new Date().toISOString(),
  }

  const existing = await getSettings()

  // Пишем, отбрасывая колонки, которых нет в конкретной базе (ошибка 42703).
  let attempts = 0
  while (attempts < 6) {
    attempts += 1
    let error: any = null
    let data: any = null

    if (existing?.id) {
      const res = await supabase
        .from('settings')
        .update(payload)
        .eq('id', existing.id)
        .eq('user_id', userId)
        .select()
      error = res.error
      data = res.data
    } else {
      const id = updates.id ?? `${userId}-settings`
      const res = await supabase
        .from('settings')
        .upsert({ id, user_id: userId, ...payload }, { onConflict: 'id' })
      error = res.error
      data = res.data
    }

    if (!error) return data

    const missing = /column (?:settings\.)?"?([a-z_]+)"? does not exist/i.exec(error.message ?? '')
    if (missing && missing[1] in payload) {
      delete payload[missing[1]]
      continue
    }
    throw error
  }
  throw new Error('Не удалось сохранить настройки')
}

/** Обновить запись сверхнормы (всё поле целиком) по id записи */
export async function updateWorkLog(id: string, date: string, pressTime: Date, overtimeMinutes: number, note: string) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Нет сессии')

  // updated_at берём только если колонка есть в базе (см. SQL-миграцию);
  // иначе update падает и запись не перезаписывается.
  const payload: Record<string, any> = {
    date,
    press_time: pressTime,
    overtime_minutes: overtimeMinutes,
    note,
    updated_at: new Date().toISOString(),
  }

  let attempts = 0
  while (attempts < 4) {
    attempts += 1
    const { error } = await supabase
      .from('work_logs')
      .update(payload)
      .eq('id', id)
      .eq('user_id', session.user.id)

    if (!error) return { success: true }

    const missing = /column (?:work_logs\.)?"?([a-z_]+)"? does not exist/i.exec(error.message ?? '')
    if (missing && missing[1] in payload) {
      delete payload[missing[1]]
      continue
    }
    throw error
  }
  throw new Error('Не удалось перезаписать запись')
}

/** Обновить запись по id (дата/время/норма не меняются, меняется только комментарий) */
export async function updateNote(id: string, note: string) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Нет сессии')

  const { error } = await supabase
    .from('work_logs')
    .update({ note })
    .eq('id', id)

  if (error) throw error
  return { success: true }
}
