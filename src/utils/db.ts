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

  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (error) throw error
  return data as SettingsRow | null
}

/** Обновить настройки */
export async function updateSettings(updates: Partial<SettingsRow>) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Нет сессии')

  const now = new Date().toISOString()
  const endOfDayHour = updates.end_of_shift_hour ?? 18
  const endOfDayMinute = updates.end_of_shift_minute ?? 0
  const periodStart = updates.period_start ?? '0001-01-01'
  const periodEnd = updates.period_end ?? '9999-12-31'
  const userId = session.user.id
  const id = updates.id ?? `${userId}-settings`

  const { data, error } = await supabase
    .from('settings')
    .upsert(
      {
        id,
        user_id: userId,
        end_of_shift_hour: endOfDayHour,
        end_of_shift_minute: endOfDayMinute,
        period_start: periodStart,
        period_end: periodEnd,
        updated_at: now,
      },
      { onConflict: 'id' }
    )

  if (error) throw error
  return data
}

/** Обновить комментарий (note) по id записи */
export async function updateNote(id: string, note: string) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Нет сессии')

  const { error } = await supabase
    .from('work_logs')
    .update({ note, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
  return { success: true }
}
