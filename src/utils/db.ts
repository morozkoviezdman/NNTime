import type { Database } from './types'
import { supabase } from '@/supabaseClient'

// Types
export type WorkLogEntry = Database['public']['Tables']['work_logs']['Row']
export type SettingsRow = Database['public']['Tables']['settings']['Row']

/**
 * Достаёт имя отсутствующей в базе колонки из ошибки Supabase.
 * PostgREST отвечает двумя разными формами:
 *   PGRST204: Could not find the 'updated_at' column of 'work_logs' in the schema cache
 *   Postgres 42703: column "updated_at" does not exist
 */
function missingColumn(err: any): string | null {
  const msg = String(err?.message ?? '')
  const a = /Could not find the '([a-z_]+)' column/i.exec(msg)
  if (a) return a[1]
  const b = /column (?:[\w]+\.)?["']?([a-z_]+)["']? does not exist/i.exec(msg)
  if (b) return b[1]
  return null
}

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
  // Дата — локальная (не UTC), иначе около полуночи запись уезжает на вчера.
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const payload: Record<string, any> = {
    user_id: user.id,
    date: localDate,
    press_time: now.toISOString(),
    overtime_minutes: overtimeMinutes,
    note: null,
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await supabase.from('work_logs').insert(payload).select()

    if (!error) {
      if (!data || data.length === 0) {
        throw new Error('Запись не сохранилась: база не вернула созданную строку. Проверьте права таблицы work_logs.')
      }
      return { overtimeMinutes, date: localDate, row: data[0] }
    }

    const col = missingColumn(error)
    if (col && col in payload) {
      delete payload[col]
      continue
    }
    throw error
  }
  throw new Error('Не удалось сохранить запись')
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

/**
 * В разных базах таблица settings бывает двух видов:
 *  - с user_id (настройки на пользователя),
 *  - без user_id (одна общая строка).
 * Определяем автоматически при первом чтении.
 */
let settingsHasUserColumn: boolean | null = null

async function readSettingsRows(scoped: boolean): Promise<any[]> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Нет сессии')

  let q: any = supabase.from('settings').select('*')
  if (scoped) q = q.eq('user_id', session.user.id)

  const first = await q.order('updated_at', { ascending: false }).limit(1)

  if (first.error) {
    const col = missingColumn(first.error)
    if (col === 'user_id' && scoped) {
      settingsHasUserColumn = false
      return readSettingsRows(false)
    }
    if (col === 'updated_at') {
      let q2: any = supabase.from('settings').select('*')
      if (scoped) q2 = q2.eq('user_id', session.user.id)
      const second = await q2.limit(1)
      if (second.error) throw second.error
      return (second.data ?? []) as any[]
    }
    throw first.error
  }

  if (scoped && settingsHasUserColumn === null) settingsHasUserColumn = true
  return (first.data ?? []) as any[]
}

/** Получить настройки (первую строку) */
export async function getSettings(): Promise<SettingsRow | null> {
  const rows = await readSettingsRows(settingsHasUserColumn !== false)
  return rows.length ? (rows[0] as SettingsRow) : null
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

  // Пишем, отбрасывая колонки, которых нет в конкретной базе
  // (PostgREST: "Could not find the 'x' column" / Postgres 42703).
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let error: any = null
    let data: any = null

    if (existing?.id) {
      let q: any = supabase.from('settings').update(payload).eq('id', existing.id)
      if (settingsHasUserColumn !== false) q = q.eq('user_id', userId)
      const res = await q.select()
      error = res.error
      data = res.data
      if (error && missingColumn(error) === 'user_id') {
        settingsHasUserColumn = false
        continue
      }
    } else {
      const id = updates.id ?? `${userId}-settings`
      const body: Record<string, any> = { id, ...payload }
      if (settingsHasUserColumn !== false) body.user_id = userId
      const res = await supabase.from('settings').upsert(body, { onConflict: 'id' })
      error = res.error
      data = res.data
      if (error && missingColumn(error) === 'user_id') {
        settingsHasUserColumn = false
        continue
      }
    }

    if (!error) return data

    const col = missingColumn(error)
    if (col && col in payload) {
      delete payload[col]
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

    const col = missingColumn(error)
    if (col && col in payload) {
      delete payload[col]
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
