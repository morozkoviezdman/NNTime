export type ReportLog = {
  date: string
  press_time: string
  overtime_minutes: number
  note?: string | null
}

export type ReportCsvOptions = {
  periodStart: string
  periodEnd: string
  filterLabel: string
  logs: ReportLog[]
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** ISO-дата → ДД.ММ.ГГГГ */
export function displayDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}.${m}.${y}`
}

/** ISO-время → ЧЧ:ММ (по местному часовому поясу) */
export function displayTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 188 → «3 ч 08 мин» */
export function humanDuration(minutes: number): string {
  const total = Math.max(0, Math.round(Number(minutes) || 0))
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h} ч ${pad2(m)} мин`
}

function esc(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * CSV для Excel / Google Таблиц / Numbers.
 * Разделитель «;», BOM в начале — чтобы кириллица открывалась корректно.
 */
export function buildReportCsv(options: ReportCsvOptions): string {
  const { periodStart, periodEnd, filterLabel, logs } = options
  const totalMinutes = logs.reduce((sum, log) => sum + (Number(log.overtime_minutes) || 0), 0)

  const lines: string[] = []
  lines.push('Отчёт NNTime — учёт сверхнормативного времени')
  lines.push(['Период', `${displayDate(periodStart)} — ${displayDate(periodEnd)}`].map(esc).join(';'))
  lines.push(['Фильтр', filterLabel].map(esc).join(';'))
  lines.push(['Записей', String(logs.length)].map(esc).join(';'))
  lines.push(['Всего сверхнормы', `${humanDuration(totalMinutes)} (${totalMinutes} мин)`].map(esc).join(';'))
  lines.push('')
  lines.push(['Дата', 'Время выхода', 'Сверхнорма, мин', 'Сверхнорма', 'Комментарий'].map(esc).join(';'))

  for (const log of logs) {
    lines.push(
      [
        displayDate(log.date),
        displayTime(log.press_time),
        String(Number(log.overtime_minutes) || 0),
        humanDuration(Number(log.overtime_minutes) || 0),
        log.note ?? '',
      ]
        .map(esc)
        .join(';'),
    )
  }

  lines.push(['Итого', `${logs.length} записей`, String(totalMinutes), humanDuration(totalMinutes), ''].map(esc).join(';'))

  return `\uFEFF${lines.join('\r\n')}`
}

/** Имя файла вида nntime-otchet-2025-11-17_2026-11-16.csv */
export function reportFileName(periodStart: string, periodEnd: string): string {
  const safe = (s: string) => (s || '').replace(/[^0-9-]/g, '')
  return `nntime-otchet-${safe(periodStart)}_${safe(periodEnd)}.csv`
}