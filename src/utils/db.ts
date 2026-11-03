import type { Database } from './types'
import { supabase } from '@/supabaseClient'

// Одна строка журнала работы
export type WorkLogEntry = Database['public']['Tables']['work_logs']['Row']

// Настройки проекта
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

/** Записать конец смены (или перезаписать сегодняшнюю, если уже есть). */
export async function recordWorkSession() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Не авторизован. Сначала войдите через экран логина.')

  const user = session.user
  if (!user) throw new Error('Не удалось получить данные пользователя.')

  // Берём последнюю запись пользователя
  const { data: lastRows } = await supabase
    .from('work_logs')
    .select('id, press_time')
    .eq('user_id', user.id)
    .order('press_time', { ascending: false })
    .limit(1)

  const lastRow = lastRows?.[0]

  // Если вчерашняя (сегодняшняя) запись уже есть — закрываем/перезаписываем её
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const isSameDay = lastRow !== undefined && lastRow.press_time !== undefined && lastRow.press_time !== null && new Date(lastRow.press_time).toDateString() === today.toDateString()

  if (isSameDay) {
    const { error } = await supabase
      .from('work_logs')
      .update({
        press_time: new Date(),
        note: null,
      })
      .eq('id', lastRow.id)

    if (error) throw error
    return
  }

  // Новая запись — счётчик переработки сразу вычисляем
  const now = new Date()
  const overtimeMinutes = calculateOvertimeMinutes(now)

  const { error } = await supabase.from('work_logs').insert({
    user_id: user.id,
    date: now.toISOString().slice(0, 10),
    press_time: now,
    overtime_minutes: overtimeMinutes,
    note: null,
  })

  if (error) throw error
}

/**
 * Вычислить сверхнормативное время (в минутах).
 * Норма — окончание смены в `endOfDayHour` hours.
 * Пример: нажатие 18:35, норма 18:00 => сверхнорма 35 мин.
 */
export function calculateOvertimeMinutes(pressTime: Date, endOfDayHour: number = 18): number {
  const local = pressTime.getHours() * 60 + pressTime.getMinutes()
  const minutesFromMidnight = local
  const normMinutes = endOfDayHour * 60
  const diff = minutesFromMidnight - normMinutes
  return diff > 0 ? Math.floor(diff) : 0
}
