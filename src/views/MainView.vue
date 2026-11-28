<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getSettings, getPeriodOvertime, updateSettings, getWorkLogs, getWorkLogByDate, deleteWorkLog, updateNote, recordWorkSession, updateWorkLog } from '@/utils/db'
import { buildReportCsv, reportFileName } from '@/utils/export'

import { supabase } from '@/supabaseClient'

const authStore = useAuthStore()
const router = useRouter()

// ── State ──────────────────────────────────────────────
const settings = ref<any>(null)

// период, по которому считаются итоги — показываем прямо в блоке сверхнормы
const periodLabel = computed(() => {
  const fmt = (s?: string) => (s ? s.split('-').reverse().join('.') : '—')
  return `${fmt(settings.value?.period_start)} — ${fmt(settings.value?.period_end)}`
})

// ── Уровни: одна норма смены = один «дополнительный день» ─
const NORM_DEFAULT = 480 // 8 часов

const normMinutes = computed(() => {
  const n = Number(settings.value?.shift_norm_minutes)
  return Number.isFinite(n) && n >= 60 ? n : NORM_DEFAULT
})

const hoursPerLevel = computed(() => Math.max(2, Math.round(normMinutes.value / 60)))

const daysEarned = computed(() => Math.floor(totalMinutes.value / normMinutes.value))
const restInLevel = computed(() => totalMinutes.value - daysEarned.value * normMinutes.value)
const fillPct = computed(() => Math.min(100, (restInLevel.value / normMinutes.value) * 100))

// палитра уровней: синий → бирюзовый → зелёный → лаймовый → янтарный → оранжевый → розовый
const LEVEL_COLORS = [
  ['#2563eb', '#3b82f6', '#22d3ee'],
  ['#0ea5e9', '#22d3ee', '#2dd4bf'],
  ['#16a34a', '#22c55e', '#4ade80'],
  ['#65a30d', '#84cc16', '#a3e635'],
  ['#d97706', '#f59e0b', '#fcd34d'],
  ['#ea580c', '#f97316', '#fb923c'],
  ['#be185d', '#db2777', '#f472b6'],
]

const levelColors = computed(() => LEVEL_COLORS[daysEarned.value % LEVEL_COLORS.length])
const prevColors = computed(() => LEVEL_COLORS[(daysEarned.value - 1 + LEVEL_COLORS.length) % LEVEL_COLORS.length])

const hexToRgba = (hex: string, a: number) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}



const underStyle = computed(() => ({
  background: `linear-gradient(92deg, ${prevColors.value[0]} 0%, ${prevColors.value[1]} 45%, ${prevColors.value[2]} 100%)`,
}))

const daysLabel = computed(() => {
  const n = daysEarned.value
  const m10 = n % 10
  const m100 = n % 100
  let word = 'дней'
  if (m10 === 1 && m100 !== 11) word = 'день'
  else if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) word = 'дня'
  return `${n} ${word}`
})

const restLabel = computed(() => `${Math.floor(restInLevel.value / 60)} ч ${String(restInLevel.value % 60).padStart(2, '0')} м`)

const normLabel = computed(() => {
  const h = normMinutes.value / 60
  return `${Number.isInteger(h) ? h : h.toFixed(1).replace('.', ',')} ч`
})

const levelUpFlash = ref(false)
let levelUpTimer: number | undefined

// надпись «+N добавлено» появляется прямо в полоске
const barDeltaText = ref('')
const deltaNegativeRef = ref(false)
let barDeltaTimer: number | undefined

const showBarDelta = (delta: number) => {
  if (levelFreeze.value) return // идёт праздник уровня — там своя плашка
  barDeltaText.value = `${fmtDelta(delta)} добавлено`
  deltaNegativeRef.value = delta < 0
  window.clearTimeout(barDeltaTimer)
  barDeltaTimer = window.setTimeout(() => { barDeltaText.value = '' }, 1900)
}

const barDeltaStyle = computed(() => ({
  left: `${Math.min(84, Math.max(16, fillPct.value))}%`,
}))

// пока идёт «праздник» уровня, полоска стоит заполненной на 100% старым цветом
const levelFreeze = ref(false)
const frozenColors = ref<string[] | null>(null)

const barFillPct = computed(() => (levelFreeze.value ? 100 : fillPct.value))
const barColors = computed(() => (levelFreeze.value && frozenColors.value ? frozenColors.value : levelColors.value))

const barFillStyle = computed(() => ({
  width: barFillPct.value + '%',
  background: `linear-gradient(92deg, ${barColors.value[0]} 0%, ${barColors.value[1]} 45%, ${barColors.value[2]} 100%)`,
  boxShadow: `0 0 18px ${hexToRgba(barColors.value[0], 0.3)}, inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -8px 12px rgba(4,20,60,0.14)`,
}))

const levelUpBadge = ref('')

// праздник закрытого уровня: полоска доходит до конца, вспыхивает, летят искры,
// крупная плашка «+1 день», и только потом полоска переходит на новый цвет
const runLevelUpFx = async (daysAfter: number) => {
  const { ms } = fxTiming()

  // плашка «+1 день» заменяет подпись прибавки в полоске, чтобы не мешали друг другу
  barDeltaText.value = ''
  window.clearTimeout(barDeltaTimer)

  frozenColors.value = LEVEL_COLORS[(daysAfter - 1) % LEVEL_COLORS.length]
  levelFreeze.value = true
  levelUpFlash.value = true
  levelUpBadge.value = '+1 день'
  playLevelUp()

  const bar = levelBarEl.value?.getBoundingClientRect()
  if (bar) {
    burst({
      cx: bar.left + bar.width * 0.5,
      cy: bar.top + bar.height / 2,
      fromRadius: 8,
      toRadius: 170,
      backRadius: 24,
      count: 34,
      negative: false,
      delay: 0,
      duration: ms(820),
      jitter: ms(90),
      sizeBase: 11,
    })
  }

  await wait(ms(1100))
  levelFreeze.value = false

  window.clearTimeout(levelUpTimer)
  levelUpTimer = window.setTimeout(() => { levelUpFlash.value = false }, ms(900))
  window.setTimeout(() => { levelUpBadge.value = '' }, ms(1600))
}

const goSettings = () => router.push('/settings')
const overtimeHours = ref(18)
const overtimeMinutes = ref(0)
const today = new Date()
const startDefault = new Date(today)
startDefault.setDate(today.getDate() - 365)
const endDefault = new Date()

const formatDateForInput = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const periodStart = ref<string>(formatDateForInput(startDefault))
const periodEnd = ref<string>(formatDateForInput(endDefault))
const totalMinutes = ref(0)
const totalHours = ref(0)
const totalMinLeft = ref(0)
const totalDays = ref(0)
const workLogs = ref<any[]>([])
const currentNote = ref('')
const editingId = ref<string | null>(null)
const reportOpen = ref(false)
// фильтр отчёта по величине сверхнормы, в минутах (0 — все записи)
const reportMinMinutes = ref(0)
const filterOptions = [
  { m: 0, label: 'Все' },
  { m: 30, label: '> 30 мин' },
  { m: 60, label: '> 1 ч' },
  { m: 120, label: '> 2 ч' },
  { m: 180, label: '> 3 ч' },
]
const filterLabel = computed(() => filterOptions.find((o) => o.m === reportMinMinutes.value)?.label ?? 'Все')

// записи, прошедшие только порог по минутам (по ним строится график)
// период, за который открыт отчёт: по нему всегда фильтруются строки
const reportPeriod = ref<{ start: string; end: string } | null>(null)

// ── анимация фиксации ─────────────────────────────
const recordBtnEl = ref<HTMLElement | null>(null)
const levelBarEl = ref<HTMLElement | null>(null)
const fxHidden = ref(false)
const effectBusy = ref(false)
const soundOn = ref(localStorage.getItem('nntime_sound') !== 'off')
let audioCtx: AudioContext | null = null
const playTick = () => {
  if (!soundOn.value) return
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    audioCtx = audioCtx ?? new Ctx()
    const ctx = audioCtx
    if (ctx.state === 'suspended') void ctx.resume()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(760, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1180, ctx.currentTime + 0.05)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.13)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.15)
  } catch {
    /* звук не критичен */
  }
}


// короткая фанфара закрытого уровня: три ноты вверх
const playLevelUp = () => {
  if (!soundOn.value) return
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    audioCtx = audioCtx ?? new Ctx()
    const ctx = audioCtx
    if (ctx.state === 'suspended') void ctx.resume()

    const notes = [
      { f: 659.25, t: 0.0 },   // ми
      { f: 783.99, t: 0.11 },  // соль
      { f: 1046.5, t: 0.22 },  // до второй октавы
    ]

    notes.forEach(({ f, t }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const start = ctx.currentTime + t
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(f, start)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.09, start + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.3)
    })
  } catch {
    /* звук не критичен */
  }
}

const fmtDelta = (minutes: number) => {
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  const sign = minutes > 0 ? '+' : minutes < 0 ? '−' : ''
  return `${sign}${h}:${String(m).padStart(2, '0')}`
}

const setShownTotal = (mins: number) => {
  totalMinutes.value = mins
  totalHours.value = Math.floor(mins / 60)
  totalMinLeft.value = mins % 60
}

const tweenTotal = (from: number, to: number, duration = 600) =>
  new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      setShownTotal(to)
      resolve()
    }
    const start = performance.now()
    const step = (now: number) => {
      if (done) return
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setShownTotal(Math.round(from + (to - from) * eased))
      if (t < 1) requestAnimationFrame(step)
      else finish()
    }
    requestAnimationFrame(step)
    // страховка: в фоновой вкладке кадры не идут — завершаем по таймеру
    window.setTimeout(finish, duration + 400)
  })

const fxLayer = () => {
  const layer = document.createElement('div')
  layer.className = 'fx-layer'
  document.body.appendChild(layer)
  return layer
}

// частицы: разлёт из точки (или с края круга), замирание и «магнитный» возврат
const burst = (opts: {
  cx: number
  cy: number
  fromRadius: number
  toRadius: number
  backRadius: number
  count: number
  negative: boolean
  delay: number
  duration: number
  jitter?: number
  sizeBase?: number
}) => {
  const layer = fxLayer()
  const palette = opts.negative
    ? ['#f59e0b', '#fbbf24', '#fb923c', '#f97316']
    : ['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd']

  for (let i = 0; i < opts.count; i += 1) {
    const el = document.createElement('div')
    el.className = 'fx-particle'
    const base = opts.sizeBase ?? 12
    const size = Math.round(base * (0.72 + Math.random() * 0.5))
    const color = palette[i % palette.length]
    el.style.width = `${size}px`
    el.style.height = `${size}px`
    el.style.left = `${opts.cx}px`
    el.style.top = `${opts.cy}px`
    el.style.background = color
    el.style.boxShadow = `0 0 ${10 + size * 1.8}px ${color}`

    const angle = (Math.PI * 2 * i) / opts.count + (Math.random() - 0.5) * 0.3
    const out = opts.toRadius * (0.8 + Math.random() * 0.45)
    const sx = Math.cos(angle) * opts.fromRadius
    const sy = Math.sin(angle) * opts.fromRadius
    const ex = Math.cos(angle) * out
    const ey = Math.sin(angle) * out
    const bx = Math.cos(angle) * opts.backRadius
    const by = Math.sin(angle) * opts.backRadius
    const spin = Math.round((Math.random() - 0.5) * 240)

    layer.appendChild(el)
    el.animate(
      [
        { transform: `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(0.45)`, opacity: 0.85, offset: 0 },
        { transform: `translate(${ex}px, ${ey}px) translate(-50%, -50%) scale(1.15) rotate(${spin * 0.3}deg)`, opacity: 1, offset: 0.2 },
        { transform: `translate(${ex * 1.03}px, ${ey * 1.03}px) translate(-50%, -50%) scale(1) rotate(${spin * 0.6}deg)`, opacity: 1, offset: 0.44 },
        { transform: `translate(${bx}px, ${by}px) translate(-50%, -50%) scale(0.6) rotate(${spin}deg)`, opacity: 0.4, offset: 0.88 },
        { transform: `translate(${bx}px, ${by}px) translate(-50%, -50%) scale(0.25) rotate(${spin}deg)`, opacity: 0, offset: 1 },
      ],
      {
        duration: opts.duration,
        delay: opts.delay + (opts.jitter ? Math.random() * opts.jitter : 0),
        easing: 'cubic-bezier(.32, .72, .24, 1)',
        fill: 'both',
      },
    )
  }

  window.setTimeout(() => layer.remove(), opts.delay + opts.duration + 250)
}

const spawnRing = (x: number, y: number, radius: number, negative: boolean) => {
  const layer = fxLayer()
  const ring = document.createElement('div')
  ring.className = `fx-ring${negative ? ' fx-ring-minus' : ''}`
  ring.style.left = `${x}px`
  ring.style.top = `${y}px`
  ring.style.width = `${radius * 2}px`
  ring.style.height = `${radius * 2}px`
  layer.appendChild(ring)
  const anim = ring.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.35)', opacity: 0.85 },
      { transform: 'translate(-50%, -50%) scale(1.35)', opacity: 0 },
    ],
    { duration: 620, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'forwards' },
  )
  // убираем сразу после завершения: без fill:forwards кольцо «всплывало» обратно
  anim.addEventListener('finish', () => layer.remove())
  window.setTimeout(() => layer.remove(), 900)
}

// «таблетка» с прибавкой летит по дуге от кнопки к итогу
const flyPill = (text: string, from: DOMRect, to: DOMRect, negative: boolean, duration = 520) => {
  const layer = fxLayer()
  const pill = document.createElement('div')
  pill.className = `fx-pill${negative ? ' fx-pill-minus' : ''}`
  pill.textContent = text
  layer.appendChild(pill)

  const sx = from.left + from.width / 2
  const sy = from.top + from.height / 2
  const ex = to.left + to.width / 2
  const ey = to.top + to.height / 2
  const cx = (sx + ex) / 2 + 70
  const cy = Math.min(sy, ey) - 90

  const frames: Keyframe[] = []
  const steps = 14
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const u = 1 - t
    const x = u * u * sx + 2 * u * t * cx + t * t * ex
    const y = u * u * sy + 2 * u * t * cy + t * t * ey
    const scale = i === 0 ? 0.55 : 1 + 0.18 * Math.sin(Math.PI * t)
    // к моменту прилёта «таблетка» растворяется, чтобы не закрывать число
    const opacity = t > 0.86 ? Math.max(0, 1 - (t - 0.86) / 0.14) : 1
    frames.push({
      transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`,
      opacity,
      offset: t,
    })
  }

  const anim = pill.animate(frames, {
    duration,
    easing: 'cubic-bezier(.45, .05, .55, .95)',
    fill: 'forwards',
  })
  // уборка по таймеру, а не по событию finish: так эффект не может «зависнуть»
  window.setTimeout(() => {
    try {
      anim.cancel()
    } catch {
      /* уже завершилась */
    }
    pill.remove()
    layer.remove()
  }, duration + 120)
}


// параметры эффекта фиксации (подобраны вручную)
const FX_CONST = { speed: 1.3, size: 18, count: 80 }

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))


const cancelButtonAnimations = (btn: HTMLElement | null | undefined) => {
  if (!btn) return
  try {
    btn.getAnimations().forEach((a) => a.cancel())
  } catch {
    /* старых анимаций может не быть */
  }
}

const revealButton = (btn: HTMLElement, duration = 320) => {
  cancelButtonAnimations(btn)
  btn.animate(
    [
      { transform: 'scale(0.62)', opacity: 0 },
      { transform: 'scale(1.06)', opacity: 1, offset: 0.7 },
      { transform: 'scale(1)', opacity: 1 },
    ],
    { duration, easing: 'cubic-bezier(.2, .9, .3, 1)' },
  )
}

// ── эффект разделён на две части ──────────────────────────
// startRecordFx — запускается сразу по нажатию, не дожидаясь ответа базы
// finishRecordFx — приходит, когда известно, на сколько изменилась сумма
let fxStartedAt = 0
let fxVariant: 'full' | 'simple' | null = null

const fxTiming = () => {
  const tune = FX_CONST
  return { tune, ms: (v: number) => Math.max(80, Math.round(v * tune.speed)) }
}

const startRecordFx = () => {
  if (effectBusy.value) return
  const { tune, ms } = fxTiming()
  const forceAnimation = localStorage.getItem('nntime_animation') !== 'auto'
  const reduceMotion = !forceAnimation && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (reduceMotion && !sessionStorage.getItem('nntime_motion_hint')) {
    sessionStorage.setItem('nntime_motion_hint', '1')
    showToast('Анимация сокращена настройкой устройства — включите «Полную анимацию» в настройках')
  }
  if (reduceMotion) {
    fxVariant = null
    return
  }

  const btn = recordBtnEl.value
  const rect = btn?.getBoundingClientRect()
  if (!btn || !rect) {
    fxVariant = null
    return
  }

  effectBusy.value = true
  fxStartedAt = Date.now()
  playTick()

  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const radius = rect.width / 2

  if (forceAnimation) {
    fxVariant = 'full'
    btn.animate(
      [
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(0.06)', opacity: 0 },
      ],
      { duration: ms(220), easing: 'cubic-bezier(.4, 0, .7, 1)', fill: 'forwards' },
    )
    window.setTimeout(() => {
      fxHidden.value = true
    }, ms(220))

    burst({
      cx,
      cy,
      fromRadius: 0,
      toRadius: Math.max(230, radius * 1.7),
      backRadius: radius - 12,
      count: tune.count,
      negative: false,
      delay: ms(220),
      duration: ms(900),
      jitter: ms(90),
      sizeBase: tune.size,
    })
  } else {
    fxVariant = 'simple'
    btn.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(0.94)', offset: 0.35 },
        { transform: 'scale(1)' },
      ],
      { duration: ms(460), easing: 'ease-in-out' },
    )

    burst({
      cx,
      cy,
      fromRadius: radius - 10,
      toRadius: radius + 120,
      backRadius: radius - 14,
      count: tune.count,
      negative: false,
      delay: 0,
      duration: ms(900),
      sizeBase: tune.size,
    })
  }
}

const finishRecordFx = async (delta: number, fromTotal: number, toTotal: number) => {
  const { ms } = fxTiming()
  const btn = recordBtnEl.value

  const daysBefore = Math.floor(fromTotal / normMinutes.value)
  const daysAfter = Math.floor(toTotal / normMinutes.value)
  const crossed = daysAfter > daysBefore

  if (!effectBusy.value) {
    showBarDelta(delta)
    if (crossed) void runLevelUpFx(daysAfter)
    await tweenTotal(fromTotal, toTotal, ms(460))
    return
  }

  const guard = window.setTimeout(() => setShownTotal(toTotal), 4200)
  try {
    // даём частицам разлететься, но не ждём дольше ~0,6 с
    const minTime = ms(430)
    const elapsed = Date.now() - fxStartedAt
    if (elapsed < minTime) await wait(minTime - elapsed)

    setShownTotal(fromTotal)

    const btnRect = btn?.getBoundingClientRect()
    const barRect = levelBarEl.value?.getBoundingClientRect()
    const negative = delta < 0

    if (btnRect && barRect) {
      // «таблетка» летит к краю заполнения полоски и там растворяется
      const edgeX = barRect.left + barRect.width * Math.min(1, Math.max(0.04, fillPct.value / 100))
      const target = { left: edgeX - 30, top: barRect.top, width: 60, height: barRect.height } as DOMRect

      void flyPill(fmtDelta(delta), btnRect, target, negative, ms(680))
      window.setTimeout(() => {
        spawnRing(edgeX, barRect.top + barRect.height / 2, 20, negative)
      }, ms(520))
    }

    // надпись внутри полоски появляется в момент долива
    window.setTimeout(() => showBarDelta(delta), ms(620))

    if (fxVariant === 'full') {
      await wait(ms(330))
      fxHidden.value = false
      if (btn) revealButton(btn, ms(320))
    }

    // праздник уровня запускаем вместе с прокруткой числа, а не после неё
    if (crossed) void runLevelUpFx(daysAfter)

    await tweenTotal(fromTotal, toTotal, ms(600))
  } finally {
    window.clearTimeout(guard)
    cancelButtonAnimations(btn)
    fxHidden.value = false
    setShownTotal(toTotal)
    effectBusy.value = false
    fxVariant = null
  }
}

// если запись не удалась — вернуть кнопку на место
const abortRecordFx = () => {
  cancelButtonAnimations(recordBtnEl.value)
  fxHidden.value = false
  effectBusy.value = false
  fxVariant = null
}

const reportPeriodLogs = computed(() => {
  const period = reportPeriod.value
  if (!period) return workLogs.value
  return workLogs.value.filter((log: any) => log.date >= period.start && log.date <= period.end)
})

const thresholdLogs = computed(() => {
  if (!reportMinMinutes.value) return reportPeriodLogs.value
  return reportPeriodLogs.value.filter((log: any) => (log.overtime_minutes ?? 0) > reportMinMinutes.value)
})

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

// ── график в отчёте ─────────────────────────────────────────────
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const pad2 = (n: number) => String(n).padStart(2, '0')
const dkey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const parseDay = (s: string) => {
  if (!s) return null
  const d = new Date(`${s}T00:00:00`)
  return isNaN(d.getTime()) ? null : d
}
const startOfWeek = (d: Date) => {
  const x = new Date(d)
  const wd = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - wd)
  x.setHours(0, 0, 0, 0)
  return x
}

const periodDays = computed(() => {
  const a = parseDay(periodStart.value)
  const b = parseDay(periodEnd.value)
  if (!a || !b || b < a) return 0
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1
})

// шаг группировки зависит от длины периода
const chartStep = computed<'day' | 'week' | 'month' | 'quarter'>(() => {
  const d = periodDays.value
  if (d <= 14) return 'day'
  if (d <= 90) return 'week'
  if (d <= 730) return 'month'
  return 'quarter'
})
const stepLabel = computed(
  () => ({ day: 'по дням', week: 'по неделям', month: 'по месяцам', quarter: 'по кварталам' })[chartStep.value],
)

const buckets = computed(() => {
  const a = parseDay(periodStart.value)
  const b = parseDay(periodEnd.value)
  const list: { key: string; label: string; minutes: number; count: number; from: string; to: string }[] = []
  if (!a || !b || b < a) return list

  const step = chartStep.value
  const cursor = new Date(a)
  if (step === 'week') cursor.setTime(startOfWeek(cursor).getTime())
  if (step === 'month') cursor.setDate(1)
  if (step === 'quarter') {
    cursor.setDate(1)
    cursor.setMonth(Math.floor(cursor.getMonth() / 3) * 3)
  }

  let guard = 0
  while (cursor <= b && guard < 2000) {
    const from = new Date(cursor)
    const to = new Date(cursor)
    if (step === 'day') to.setDate(to.getDate() + 1)
    else if (step === 'week') to.setDate(to.getDate() + 7)
    else if (step === 'month') to.setMonth(to.getMonth() + 1)
    else to.setMonth(to.getMonth() + 3)
    to.setDate(to.getDate() - 1)

    let label = `${pad2(from.getDate())}.${pad2(from.getMonth() + 1)}`
    // год подписываем только в январе и на самом первом столбце — иначе подписи наезжают
    const yearTag = from.getMonth() === 0 || list.length === 0 ? ` ${String(from.getFullYear()).slice(2)}` : ''
    if (step === 'month') label = `${MONTHS_SHORT[from.getMonth()]}${yearTag}`
    if (step === 'quarter') {
      const q = ['I', 'II', 'III', 'IV'][Math.floor(from.getMonth() / 3)]
      label = `${q} кв${from.getMonth() === 0 || list.length === 0 ? ` ${String(from.getFullYear()).slice(2)}` : ''}`
    }

    list.push({ key: dkey(from), label, minutes: 0, count: 0, from: dkey(from), to: dkey(to < b ? to : b) })
    cursor.setTime(to.getTime())
    cursor.setDate(cursor.getDate() + 1)
    guard += 1
  }

  const index = new Map(list.map((b2, i) => [b2.key, i]))
  const keyFor = (d: Date) => {
    const x = new Date(d)
    if (step === 'week') x.setTime(startOfWeek(x).getTime())
    if (step === 'month') x.setDate(1)
    if (step === 'quarter') {
      x.setDate(1)
      x.setMonth(Math.floor(x.getMonth() / 3) * 3)
    }
    return dkey(x)
  }

  for (const log of thresholdLogs.value) {
    const d = parseDay(log.date)
    if (!d) continue
    const i = index.get(keyFor(d))
    if (i === undefined) continue
    list[i].minutes += Number(log.overtime_minutes) || 0
    list[i].count += 1
  }
  return list
})

const CHART_W = 600
const CHART_H = 170
const PAD_L = 40
const PAD_R = 10
const PAD_T = 12
const PAD_B = 26

const bars = computed(() => {
  const data = buckets.value
  const plotW = CHART_W - PAD_L - PAD_R
  const plotH = CHART_H - PAD_T - PAD_B
  if (!data.length) return { items: [], grid: [], xLabels: [], plotH, plotW }
  const maxMin = Math.max(60, ...data.map((b) => b.minutes))
  const niceMax = Math.ceil(maxMin / 60) * 60
  const stepX = plotW / data.length
  const barW = Math.max(2, Math.min(40, stepX * 0.62))
  const items = data.map((b, i) => {
    const h = b.minutes > 0 ? Math.max(2, (b.minutes / niceMax) * plotH) : 0
    const x = PAD_L + stepX * i + (stepX - barW) / 2
    return {
      x,
      y: PAD_T + plotH - h,
      w: barW,
      h,
      key: b.key,
      empty: b.minutes === 0,
      label: b.label,
      title:
        `${b.label}: ${formatDuration(b.minutes)} · ${b.count} ${plural(b.count, 'запись', 'записи', 'записей')}` +
        (b.minutes > 0 ? ' · нажмите, чтобы отфильтровать' : ''),
    }
  })
  const grid = [0, 0.5, 1].map((k) => ({
    y: PAD_T + plotH - k * plotH,
    label: `${Math.round((niceMax * k) / 60)} ч`,
  }))
  // подписи: на широком экране все (до 14), на узком каждая вторая скрывается через CSS
  const every = data.length <= 14 ? 1 : Math.ceil(data.length / 9)
  const xLabels = items
    .filter((_, i) => i % every === 0)
    .map((it, i) => ({ x: it.x + it.w / 2, label: it.label, alt: data.length > 8 && i % 2 === 1 }))
  return { items, grid, xLabels, plotH, plotW }
})

// выбранный пользователем столбик графика
const selectedBucketKey = ref<string | null>(null)
const selectedBucket = computed(() => {
  if (!selectedBucketKey.value) return null
  return buckets.value.find((b) => b.key === selectedBucketKey.value) ?? null
})
const selectedRangeLabel = computed(() => {
  const b = selectedBucket.value
  if (!b) return ''
  return b.from === b.to ? displayShort(b.from) : `${displayShort(b.from)} — ${displayShort(b.to)}`
})
const toggleBucket = (key: string) => {
  selectedBucketKey.value = selectedBucketKey.value === key ? null : key
}

// записи для таблицы: порог по минутам + выбранный промежуток
const filteredLogs = computed(() => {
  const bucket = selectedBucket.value
  if (!bucket) return thresholdLogs.value
  return thresholdLogs.value.filter((log: any) => log.date >= bucket.from && log.date <= bucket.to)
})

// если период сменили и выбранного промежутка больше нет — сбрасываем выбор
watch(buckets, (list) => {
  if (selectedBucketKey.value && !list.some((b) => b.key === selectedBucketKey.value)) {
    selectedBucketKey.value = null
  }
})
const filteredMinutes = computed(() =>
  filteredLogs.value.reduce((sum: number, log: any) => sum + (Number(log.overtime_minutes) || 0), 0),
)
const maxFilteredMinutes = computed(() =>
  Math.max(60, ...filteredLogs.value.map((log: any) => Number(log.overtime_minutes) || 0)),
)

// подкраска строк отчёта: чем больше сверхнорма, тем насыщеннее зелёный (только на экране)
const rowStyle = (minutes: number) => {
  const t = Math.min(1, Math.max(0, (Number(minutes) || 0) / maxFilteredMinutes.value))
  const k = Math.pow(t, 0.8)
  const mix = (from: number[], to: number[]) =>
    `rgb(${from.map((c, i) => Math.round(c + (to[i] - c) * k)).join(',')})`
  // тёплая шкала: от почти белого к янтарному
  return { backgroundColor: mix([255, 254, 249], [254, 240, 170]) }
}


const changesOpen = ref(false)
const changelog = [
  {
    version: 'v1.6.1',
    date: '28 ноября 2026',
    items: [
      'Полоска «Дополнительные дни» с делением по часам',
      'Настройка «Норма рабочего времени» — 1–24 часа',
      'Крупная плашка «+1 день» при закрытии уровня',
      'Прибавка показывается в полоске, число не сдвигается',
      'Звук при начислении нового дня',
      'Главный экран обновляется после закрытия отчёта',
      'Блок «Как добавить на домашний экран» перенесён в настройки',
      'Период, время и норма — свои у каждого аккаунта',
    ],
  },
  {
    version: 'v1.5.0',
    date: '20 ноября 2026',
    items: [
      'Анимация фиксации: искры из кнопки, «таблетка» с прибавкой летит к итогу, удар, прокрутка числа',
      'При перезаписи с уменьшением суммы показывается минус другим цветом',
      'Короткий звук при фиксации — с кнопкой отключения рядом с блоком сверхнормы',
      'При системной настройке «уменьшить движение» анимации отключаются, остаётся прокрутка числа',
    ],
  },
  {
    version: 'v1.4.3',
    date: '20 ноября 2026',
    items: [
      'Исправлено: после входа мог открываться пустой белый экран (ошибка порядка инициализации в отчёте)',
    ],
  },
  {
    version: 'v1.4.2',
    date: '19 ноября 2026',
    items: [
      'Исправлено: после сохранения комментария в отчёте пропадал выбранный период — показывались все записи из базы',
      'Отчёт всегда перечитывает записи строго за свой период, в том числе после сохранения и удаления',
    ],
  },
  {
    version: 'v1.4.1',
    date: '18 ноября 2026',
    items: [
      'Нажатие на столбик графика фильтрует отчёт по этому промежутку — повторное нажатие сбрасывает',
      'Выбранный промежуток складывается с фильтрами «> 30 мин / > 1 ч / > 2 ч / > 3 ч», рядом появляется чип сброса',
      'Печать и экспорт в CSV учитывают выбранный промежуток',
      'Убрана цветная полоса слева в подсветке строк — осталась только заливка',
    ],
  },
  {
    version: 'v1.4.0',
    date: '17 ноября 2026',
    items: [
      'График сверхнормы в отчёте: по дням, неделям или месяцам — шаг подбирается по длине периода',
      'Фильтр «> 30 мин» рядом с прежними «> 1 ч», «> 2 ч», «> 3 ч»',
      'В шапке отчёта — количество записей и общая сумма часов, меняются вместе с фильтром',
      'Подсветка строк по величине сверхнормы: тёплая шкала и полоса слева (только на экране)',
      'Экспорт отчёта в CSV для Excel и Google Таблиц, кнопка «Поделиться» для Telegram и почты',
      'Исправлено: период и время начала переработки стали персональными для каждого аккаунта — раньше общая настройка менялась у всех',
      'Исправлено: в подвале показывалась сегодняшняя дата вместо даты выпуска версии',
    ],
  },
  {
    version: 'v1.3.0',
    date: '8 ноября 2026',
    items: [
      'Галочка «Спрашивать комментарий при фиксации» — заметка пишется сразу при записи',
      'Окно комментария при фиксации, до 400 символов',
      'Настройка хранится в базе и работает на всех устройствах',
      'Отчёт на телефоне — карточки вместо таблицы, названия полей больше не наезжают',
    ],
  },
  {
    version: 'v1.2.0',
    date: '8 ноября 2026',
    items: [
      'Значок NNTime: часы со стрелкой «сверх нормы» и надписью',
      'PWA-манифест и иконки для установки на телефон',
      'Логотип в шапке приложения и на экране входа',
      'Настоящая иконка Google на кнопке входа',
    ],
  },
  {
    version: 'v1.1.0',
    date: '7 ноября 2026',
    items: [
      'Кнопка «Зафиксировать» корректно возвращается в исходное состояние',
      'Повторная фиксация за ту же дату перезаписывает запись, а не создаёт дубль',
      'Период и время сохраняются в базе и подгружаются при новом входе',
      'Отчёт печатается целиком, с разбивкой на страницы',
      'Фильтры отчёта по сверхнорме: больше 1, 2 и 3 часов',
      'Оформление блока периода и времени, подсказки по установке',
    ],
  },
  {
    version: 'v1.0.0',
    date: '1 ноября 2026',
    items: [
      'Первый релиз: фиксация времени, отчёт за период, вход через Google',
    ],
  },
]

const version = 'v1.6.1'
// дата выпуска версии — меняется вручную при выпуске, а не каждый день
const releaseDate = '28 ноября 2026'
const brandIcon = `${import.meta.env.BASE_URL}icon.svg`

const error = ref('')
const toast = ref('')
const toastVisible = ref(false)
const toastTimer = ref<number | null>(null)

const askNote = ref(false)
const noteDialogOpen = ref(false)
const noteDraft = ref('')
const pendingRecord = ref<any>(null)
const recordLoading = ref(false)

const editLoading = ref(false)

// ── Computed ───────────────────────────────────────────


// ── Toast ──────────────────────────────────────────────
const showToast = (msg: string) => {
  toast.value = msg
  toastVisible.value = true
  if (toastTimer.value) clearTimeout(toastTimer.value)
  toastTimer.value = setTimeout(() => {
    toast.value = ''
    toastVisible.value = false
  }, 2500)
}

// ── Formatters ─────────────────────────────────────────
// «18.11.2026» → «18.11»
const displayShort = (dateStr: string) => {
  const parts = (dateStr || '').split('-')
  return parts.length === 3 ? `${parts[2]}.${parts[1]}` : dateStr
}

const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return '—'
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

const formatTime = (dateStr: string) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

const formatDuration = (minutes: number) => {
  if (!minutes) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

const printModal = () => {
  (window as any).print()
}

// ── Экспорт отчёта: CSV и «Поделиться» ─────────────────
const exportDialogOpen = ref(false)
const exportMode = ref<'csv' | 'share'>('csv')

const currentFilterLabel = computed(() => {
  const parts: string[] = []
  if (selectedBucket.value) parts.push(`промежуток ${selectedRangeLabel.value}`)
  if (reportMinMinutes.value) parts.push(`сверхнорма ${filterLabel.value}`)
  return parts.length ? parts.join(', ') : 'все записи за период'
})

const makeCsv = (withFilter: boolean) => {
  const logs = withFilter ? filteredLogs.value : workLogs.value
  return buildReportCsv({
    periodStart: periodStart.value,
    periodEnd: periodEnd.value,
    filterLabel: withFilter ? currentFilterLabel.value : 'все записи за период',
    logs: logs.map((log: any) => ({
      date: log.date,
      press_time: log.press_time,
      overtime_minutes: Number(log.overtime_minutes) || 0,
      note: log.note ?? '',
    })),
  })
}

const downloadCsv = (csv: string, name: string) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const runExport = async (mode: 'csv' | 'share', withFilter: boolean) => {
  const csv = makeCsv(withFilter)
  const name = reportFileName(periodStart.value, periodEnd.value)
  const logs = withFilter ? filteredLogs.value : workLogs.value
  const minutes = logs.reduce((sum: number, log: any) => sum + (Number(log.overtime_minutes) || 0), 0)
  const summary =
    `Отчёт NNTime за ${formatDateDisplay(periodStart.value)} — ${formatDateDisplay(periodEnd.value)}: ` +
    `${logs.length} записей, ${formatDuration(minutes)}`

  if (mode === 'share') {
    const file = new File([csv], name, { type: 'text/csv;charset=utf-8' })
    const nav = navigator as any
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      try {
        await nav.share({ files: [file], title: 'Отчёт NNTime', text: summary })
        return
      } catch (e: any) {
        if (e?.name === 'AbortError') return
      }
    }
    downloadCsv(csv, name)
    showToast('Файл сохранён — отправить можно из «Загрузок»')
    return
  }

  downloadCsv(csv, name)
  showToast('CSV сохранён, открывается в Excel и Google Таблицах')
}

const startExport = (mode: 'csv' | 'share') => {
  exportMode.value = mode
  if (reportMinMinutes.value) {
    exportDialogOpen.value = true
    return
  }
  void runExport(mode, false)
}

const confirmExport = (withFilter: boolean) => {
  exportDialogOpen.value = false
  void runExport(exportMode.value, withFilter)
}

// ── Data loading ───────────────────────────────────────
const loadSettings = async () => {
  try {
    let data = await getSettings()
    const startVal = data?.period_start && data.period_start.trim() ? data.period_start : formatDateForInput(startDefault)
    const endVal = data?.period_end && data.period_end.trim() ? data.period_end : formatDateForInput(endDefault)
    if (!data) {
      await updateSettings({
        end_of_shift_hour: 18,
        end_of_shift_minute: 0,
        period_start: startVal,
        period_end: endVal,
      })
      // перечитываем, чтобы получить реальный id и значения из БД
      data = await getSettings()
    }
    settings.value = data ?? null
    periodStart.value = data?.period_start && data.period_start.trim() ? data.period_start : startVal
    periodEnd.value = data?.period_end && data.period_end.trim() ? data.period_end : endVal
    overtimeHours.value = data?.end_of_shift_hour ?? 18
    overtimeMinutes.value = data?.end_of_shift_minute ?? 0
    askNote.value = !!(data as any)?.ask_note_on_record
  } catch (e: any) {
    error.value = e.message || 'Не удалось загрузить настройки'
  }
}

const loadPeriodOvertime = async () => {
  if (!periodStart.value || !periodEnd.value) return
  try {
    const res = await getPeriodOvertime(periodStart.value, periodEnd.value)
    totalMinutes.value = res.totalMinutes
    totalHours.value = res.totalHours
    totalMinLeft.value = res.totalMinLeft
    totalDays.value = res.totalDays
  } catch (e: any) {
    error.value = e.message || 'Не удалось загрузить данные'
  }
}

const loadWorkLogs = async () => {
  try {
    const logs = await getWorkLogs()
    workLogs.value = logs
  } catch (e: any) {
    error.value = e.message || 'Не удалось загрузить логи'
  }
}

// ── Actions ────────────────────────────────────────────
// Записать/перезаписать запись за дату с комментарием
const writeRecord = async (date: string, pressTime: Date, overtimeMins: number, existingId: string | null, note: string) => {
  const beforeTotal = totalMinutes.value
  if (existingId) {
    await updateWorkLog(existingId, date, pressTime, overtimeMins, note)
    console.info('[record] перезаписана запись:', existingId, 'минут:', overtimeMins, 'комментарий:', note)
    showToast('Сверхнорма перезаписана')
  } else {
    const res = await recordWorkSession(overtimeHours.value, overtimeMinutes.value, note)
    console.info('[record] вставлено в work_logs:', res.row)
    const mins = res.overtimeMinutes
    const msg = mins >= 60
      ? `Записано за ${formatDateDisplay(res.date)}: ${Math.floor(mins / 60)} ч ${mins % 60} м`
      : `Записано за ${formatDateDisplay(res.date)}: ${mins} м`
    showToast(msg)
  }
  await loadPeriodOvertime()
  await loadWorkLogs()
  const afterTotal = totalMinutes.value

  void finishRecordFx(afterTotal - beforeTotal, beforeTotal, afterTotal)
}

const emitRecord = async () => {
  error.value = ''
  try {
    recordLoading.value = true

    // 1. Проверка текущего времени
    const now = new Date()
    const currentTotalMinutes = now.getHours() * 60 + now.getMinutes()
    const overtimeTotalMinutes = overtimeHours.value * 60 + overtimeMinutes.value

    if (currentTotalMinutes < overtimeTotalMinutes) {
      const confirmed = window.confirm(
        'Текущее время меньше, чем время окончания работы в настройках.\nПереработка не возможна. Произвести запись?'
      )
      if (!confirmed) {
        return
      }
    }

    // анимация стартует сразу, не дожидаясь ответа базы
    startRecordFx()

    // 2. Ищем запись за эту дату ПРЯМО В БАЗЕ (список в памяти может быть пустым/устаревшим)
    const todayStr = formatDateForInput(now)
    const existingLog = await getWorkLogByDate(todayStr)
    const overtimeMins = Math.max(0, currentTotalMinutes - overtimeTotalMinutes)

    // 3. Если включена галочка — сначала спрашиваем комментарий
    if (askNote.value) {
      pendingRecord.value = {
        date: todayStr,
        pressTime: now,
        overtimeMins,
        existingId: existingLog?.id ?? null,
      }
      noteDraft.value = (existingLog as any)?.note ?? ''
      noteDialogOpen.value = true
      recordLoading.value = false
      return
    }

    await writeRecord(todayStr, now, overtimeMins, existingLog?.id ?? null, (existingLog as any)?.note ?? '')
  } catch (e: any) {
    error.value = e.message || 'Ошибка записи'
    showToast(e.message || 'Ошибка записи')
    abortRecordFx()
  } finally {
    if (!noteDialogOpen.value) {
      recordLoading.value = false
    }
  }
}

// Закрытие окна комментария: запись сохраняется в любом случае
const closeNoteDialog = async (note: string) => {
  const pending = pendingRecord.value
  noteDialogOpen.value = false
  pendingRecord.value = null
  if (!pending) {
    abortRecordFx()
    return
  }
  try {
    recordLoading.value = true
    startRecordFx()
    await writeRecord(pending.date, pending.pressTime, pending.overtimeMins, pending.existingId, note)
  } catch (e: any) {
    error.value = e.message || 'Ошибка записи'
    showToast(e.message || 'Ошибка записи')
  } finally {
    recordLoading.value = false
    noteDraft.value = ''
  }
}

// Esc в окне комментария — сохранить без комментария
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && noteDialogOpen.value) {
      closeNoteDialog('')
    }
  })
}

// записи только за период отчёта (одна точка загрузки)
const loadReportRows = async (start: string, end: string) => {
  const { data: { session } } = await supabase.auth.getSession()
  const uid = session?.user?.id ?? authStore.user?.id
  const { data, error } = await supabase
    .from('work_logs')
    .select('*')
    .eq('user_id', uid)
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: false })
  if (error) throw error
  return (data as any[]) ?? []
}

// перечитать строки отчёта, не выходя из выбранного периода
const reloadReportRows = async () => {
  const period = reportPeriod.value
  if (!period) {
    await loadWorkLogs()
    return
  }
  try {
    workLogs.value = await loadReportRows(period.start, period.end)
  } catch (e: any) {
    error.value = e.message || 'Не удалось обновить отчёт'
  }
}

const openReport = async () => {
  if (!periodStart.value || !periodEnd.value) {
    showToast('Сначала выберите период')
    return
  }
  const start = periodStart.value
  const end = periodEnd.value
  try {
    reportPeriod.value = { start, end }
    workLogs.value = await loadReportRows(start, end)
    showToast(
      workLogs.value.length
        ? `Найдено записей: ${workLogs.value.length} за ${formatDateDisplay(start)} — ${formatDateDisplay(end)}`
        : `За период ${formatDateDisplay(start)} — ${formatDateDisplay(end)} записей нет`
    )
  } catch (e: any) {
    error.value = e.message || 'Не удалось загрузить отчёт'
    showToast(e.message || 'Не удалось загрузить отчёт')
    workLogs.value = []
  }
  reportOpen.value = true
}

const closeReport = async () => {
  reportOpen.value = false
  editingId.value = null
  currentNote.value = ''
  selectedBucketKey.value = null
  exportDialogOpen.value = false
  reportPeriod.value = null
  showToast('Окно закрыто')

  // синхронизация с сервером: в отчёте могли удалить или изменить записи
  try {
    await loadPeriodOvertime()
    await loadWorkLogs()
  } catch (e: any) {
    console.warn('[sync] не удалось обновить данные после отчёта:', e?.message)
  }
}

const startEdit = (log: any) => {
  editingId.value = log.id
  currentNote.value = log.note ?? ''
}

const saveEdit = async () => {
  if (!editingId.value) return
  try {
    editLoading.value = true
    await updateNote(editingId.value, currentNote.value)
    await reloadReportRows()
    editingId.value = null
    currentNote.value = ''
    showToast('Комментарий сохранён')
  } catch (e: any) {
    error.value = e.message || 'Ошибка сохранения'
  } finally {
    editLoading.value = false
  }
}

const deleteLog = async (log: any) => {
  try {
    await deleteWorkLog(log.id)
    await reloadReportRows()
    showToast('Запись удалена')
  } catch (e: any) {
    error.value = e.message || 'Ошибка удаления'
  }
}

const logout = async () => {
  try {
    await authStore.signOut()
    router.push('/')
    showToast('Вы вышли из аккаунта')
  } catch (e) {
    showToast('Ошибка выхода')
  }
}

onMounted(async () => {
  await authStore.loadSession()
  if (!authStore.isAuthenticated) {
    router.push('/')
    return
  }
  await loadSettings()
  await loadPeriodOvertime()
  await loadWorkLogs()
})
</script>

<template>
  <div class="screen main">
    <!-- App brand -->
    <div class="app-header">
      <img class="app-logo" :src="brandIcon" alt="" width="26" height="26" />
      <span class="app-brand">NNTime</span>
      <span class="app-brand-sub">сверхнормативное время</span>
      <button class="settings-btn" @click="goSettings" title="Настройки: период, время смены, анимация и звук">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>

    <!-- User block -->
    <section class="user-block">
      <div class="user-avatar">{{ (authStore.user?.email ?? 'Пользователь').charAt(0) }}</div>
      <div class="user-info">
        <span class="user-name">{{ authStore.user?.email ?? 'Пользователь' }}</span>
        <span class="user-role">Администратор</span>
      </div>
      <button class="logout-btn" @click="logout" title="Нажмите чтобы выйти с данного аккаунта">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </section>

    <!-- Overtime total block -->
    <section class="overtime-block" :class="{ 'level-up-flash': levelUpFlash }">
      <div class="overtime-title">
        Сверхнормативно отработано за
        <span class="overtime-period">{{ periodLabel }}</span>
        <button class="period-edit" @click="goSettings" title="Открыть настройки и изменить период">изменить</button>
      </div>
      <div class="overtime-row">
        <div class="overtime-value">{{ totalHours }}:{{ String(totalMinLeft).padStart(2, '0') }}</div>
      </div>

      <!-- Полоска уровней: одна норма смены = один дополнительный день -->
      <div class="level-bar" ref="levelBarEl" :class="{ 'level-bar-flash': levelFreeze }">
        <div class="level-track"></div>
        <div v-if="daysEarned > 0" class="level-under" :style="underStyle"></div>
        <div class="level-fill" :style="barFillStyle"><span class="level-gloss"></span></div>
        <div class="level-ticks">
          <span v-for="t in hoursPerLevel - 1" :key="'t' + t" :style="{ left: (t * 100 / hoursPerLevel) + '%' }"></span>
        </div>
        <div class="level-ticks on-fill" :style="{ clipPath: 'inset(0 ' + (100 - barFillPct) + '% 0 0)' }">
          <span v-for="t in hoursPerLevel - 1" :key="'f' + t" :style="{ left: (t * 100 / hoursPerLevel) + '%' }"></span>
        </div>
        <span
          v-if="barDeltaText"
          class="level-delta"
          :class="{ 'level-delta-minus': deltaNegativeRef }"
          :style="barDeltaStyle"
        >{{ barDeltaText }}</span>
      </div>

      <div class="level-foot">
        <span class="level-days"><b>Дополнительные дни</b> · {{ daysLabel }}</span>
        <span class="level-rest">{{ restLabel }} из {{ normLabel }}</span>
      </div>

      <div v-if="levelUpBadge" class="level-up-big">
        <span class="level-up-big-num">+1</span>
        <span class="level-up-big-text">день</span>
      </div>
    </section>

    <!-- Fix button (circular) -->
    <div class="record-center">
      <button
        ref="recordBtnEl"
        class="main-record-btn"
        @click="emitRecord"
        :disabled="recordLoading"
        :class="{
          'main-record-btn-hidden': fxHidden,
          'main-record-btn-busy': effectBusy,
        }"
      >
        <span>Зафиксировать</span>
      </button>
    </div>

    <!-- Generate report button -->
    <div class="results-block">
      <button class="report-btn" @click="openReport">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span>Вывести отчёт за выбранный период</span>
      </button>
    </div>

    <!-- Version & Changes footer -->
    <div class="version-footer">
      <span class="version-label">Версия {{ version }} · {{ releaseDate }}</span>
      <button class="changes-btn" @click="changesOpen = true" title="История изменений">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12" y2="8"/>
        </svg>
      </button>
    </div>

    <!-- Changes modal -->
    <div v-if="changesOpen" class="changes-modal" @click.self="changesOpen = false">
      <div class="changes-modal-content">
        <div class="changes-modal-header">
          <h3>История изменений</h3>
          <button class="close-btn" @click="changesOpen = false" title="Закрыть">✕</button>
        </div>
        <div class="changes-list">
          <div v-for="entry in changelog" :key="entry.version" class="change-item">
            <div class="change-head">
              <span class="change-version">{{ entry.version }}</span>
              <span class="change-date">{{ entry.date }}</span>
              <span v-if="entry.version === version" class="change-current">текущая</span>
            </div>
            <ul class="change-list">
              <li v-for="(item, i) in entry.items" :key="i">{{ item }}</li>
            </ul>
          </div>
        </div>
        <div class="changes-footer">
          <button class="changes-close-btn" @click="changesOpen = false" title="Закрыть">Закрыть</button>
        </div>
      </div>
    </div>


    <!-- Окно комментария при фиксации -->
    <div v-if="noteDialogOpen" class="note-modal" @click.self="closeNoteDialog('')">
      <div class="note-modal-content">
        <div class="note-modal-header">
          <div>
            <h3 class="note-modal-title">Комментарий к записи</h3>
            <div class="note-modal-sub">
              {{ formatDateDisplay(pendingRecord?.date) }}<template v-if="pendingRecord"> · сверхнорма {{ formatDuration(pendingRecord.overtimeMins) }}</template>
            </div>
          </div>
          <button class="close-btn" @click="closeNoteDialog('')" title="Закрыть и сохранить без комментария">✕</button>
        </div>
        <div class="note-modal-body">
          <textarea
            v-model="noteDraft"
            class="note-textarea"
            maxlength="400"
            placeholder="Например: подготовка к совещанию по разработке"
            title="Комментарий сохранится вместе с записью"
          ></textarea>
          <div class="note-counter">{{ noteDraft.length }} / 400</div>
        </div>
        <div class="note-modal-footer">
          <button class="note-btn note-btn-ghost" @click="closeNoteDialog('')" title="Сохранить запись без комментария">Без комментария</button>
          <button class="note-btn note-btn-primary" @click="closeNoteDialog(noteDraft.trim())" title="Сохранить запись с комментарием">Сохранить</button>
        </div>
      </div>
    </div>

    <!-- Report modal -->
    <div v-if="reportOpen" class="report-modal" @click.self="closeReport">
      <div class="report-modal-content">
        <div class="report-modal-header">
          <div class="report-header-text">
            <h3>Отчёт за выбранный период</h3>
            <div class="report-header-meta">
              <span>{{ formatDateDisplay(periodStart) }} — {{ formatDateDisplay(periodEnd) }}</span>
              <span class="meta-sep">·</span>
              <span><b>{{ filteredLogs.length }}</b> {{ plural(filteredLogs.length, 'запись', 'записи', 'записей') }}</span>
              <span class="meta-sep">·</span>
              <span>всего <b>{{ formatDuration(filteredMinutes) }}</b></span>
            </div>
          </div>
          <button class="close-btn" @click="closeReport" title="Закрыть">✕</button>
        </div>
        <div class="print-only print-title">
          Отчёт за период {{ formatDateDisplay(periodStart) }} — {{ formatDateDisplay(periodEnd) }}<template v-if="reportMinMinutes || selectedBucket"> · фильтр: {{ currentFilterLabel }}</template>
        </div>

        <div class="report-filters">
          <button
            v-for="opt in filterOptions"
            :key="opt.m"
            class="filter-chip"
            :class="{ 'filter-chip-active': reportMinMinutes === opt.m }"
            @click="reportMinMinutes = opt.m"
            :title="opt.m ? `Показать записи со сверхнормой ${opt.label}` : 'Показать все записи за период'"
          >
            {{ opt.label }}
          </button>
          <button
            v-if="selectedBucket"
            class="filter-chip filter-chip-range"
            @click="selectedBucketKey = null"
            :title="`Сбросить промежуток и показать весь период`"
          >
            {{ selectedRangeLabel }} ✕
          </button>
          <span class="filter-summary">
            {{ filteredLogs.length }} из {{ workLogs.length }}
          </span>
        </div>

        <!-- График сверхнормы: реагирует на фильтр, на печать не выводится -->
        <div v-if="filteredLogs.length" class="report-chart">
          <div class="chart-head">
            <div class="chart-title">Сверхнорма {{ stepLabel }}</div>
          </div>

          <svg class="bar-chart" :viewBox="`0 0 ${CHART_W} ${CHART_H}`" role="img" aria-label="График сверхнормы по промежуткам">
            <line
              v-for="g in bars.grid"
              :key="`g-${g.y}`"
              :x1="PAD_L"
              :x2="CHART_W - PAD_R"
              :y1="g.y"
              :y2="g.y"
              class="grid-line"
            />
            <text
              v-for="g in bars.grid"
              :key="`gl-${g.y}`"
              :x="PAD_L - 8"
              :y="g.y + 4"
              class="axis-label"
              text-anchor="end"
            >{{ g.label }}</text>
            <rect
              v-for="(b, i) in bars.items"
              :key="`b-${i}`"
              :x="b.x"
              :y="b.y"
              :width="b.w"
              :height="b.h"
              rx="2"
              class="chart-bar"
              :class="{
                'chart-bar-clickable': !b.empty,
                'chart-bar-selected': selectedBucketKey === b.key,
                'chart-bar-dim': selectedBucketKey && selectedBucketKey !== b.key,
              }"
              @click="!b.empty && toggleBucket(b.key)"
            ><title>{{ b.title }}</title></rect>
            <text
              v-for="(l, i) in bars.xLabels"
              :key="`xl-${i}`"
              :x="l.x"
              :y="CHART_H - 8"
              class="axis-label x-label"
              :class="{ 'x-label-alt': l.alt }"
              text-anchor="middle"
            >{{ l.label }}</text>
          </svg>
          <div v-if="!selectedBucketKey" class="chart-hint">Нажмите на столбик, чтобы показать только этот промежуток</div>
        </div>

        <div class="report-table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Время выхода</th>
                <th>Сверхнорма</th>
                <th>Комментарий</th>
                <th class="col-actions">Действия</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="filteredLogs.length === 0">
                <td colspan="5" class="empty-cell">
                  {{ workLogs.length === 0 ? 'За выбранный период записей нет' : 'Нет записей с такой сверхнормой' }}
                </td>
              </tr>
              <tr v-for="(log, index) in filteredLogs" :key="index" :style="rowStyle(log.overtime_minutes)">
                <td data-label="Дата">{{ formatDateDisplay(log.date) }}</td>
                <td data-label="Время выхода">{{ formatTime(log.press_time) }}</td>
                <td data-label="Сверхнорма">{{ formatDuration(log.overtime_minutes) }}</td>
                <td class="comment-cell" data-label="Комментарий">
                  <template v-if="editingId === log.id">
                    <input v-model="currentNote" class="note-input" />
                    <button class="save-edit-btn" @click="saveEdit" title="Сохранить">Сохранить</button>
                  </template>
                  <template v-else>
                    <span class="note-text">{{ log.note ?? '—' }}</span>
                  </template>
                </td>
                                <td class="col-actions">
                                  <div class="actions-cell">
                                    <button class="edit-btn" @click="startEdit(log)" title="Редактировать запись">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
                                        <path d="M12 20h9"/>
                                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                                      </svg>
                                    </button>
                                    <button class="close-btn" @click="deleteLog(log)" title="Удалить запись">✕</button>
                                  </div>
                                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="report-footer">
          <button class="print-action-btn" @click="printModal()" title="Напечатать отчёт или сохранить в PDF через диалог печати">Печать</button>
          <button
            class="export-action-btn"
            @click="startExport('csv')"
            title="Скачать отчёт в CSV: откроется в Excel, Google Таблицах, Numbers, LibreOffice"
          >Скачать CSV</button>
          <button
            class="export-action-btn"
            @click="startExport('share')"
            title="Отправить отчёт в Telegram, WhatsApp, почту или «Файлы» через системное меню"
          >Поделиться</button>
          <button class="close-action-btn" @click="closeReport" title="Закрыть отчёт">Закрыть</button>
        </div>

        <!-- выбор, что выгрузить, если включён фильтр -->
        <div v-if="exportDialogOpen" class="export-dialog" @click.self="exportDialogOpen = false">
          <div class="export-dialog-box">
            <h4>Что выгрузить?</h4>
            <p>
              В отчёте включён фильтр <b>«{{ filterLabel }}»</b>.
              Выгрузить только эти записи или всё за период?
            </p>
            <div class="export-dialog-actions">
              <button
                class="export-btn export-btn-primary"
                @click="confirmExport(true)"
                title="Выгрузить только записи, попавшие под фильтр"
              >Только с фильтром</button>
              <button
                class="export-btn"
                @click="confirmExport(false)"
                title="Выгрузить все записи за выбранный период"
              >Все за период</button>
              <button
                class="export-btn export-btn-ghost"
                @click="exportDialogOpen = false"
                title="Отменить выгрузку"
              >Отмена</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.screen.main {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f0f4ff;
  padding: 24px 32px 40px;
  gap: 20px;
  max-width: 700px;
  margin: 0 auto;
}

/* ── App brand ──────────────────────────────────────── */
.app-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.settings-btn {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #dfe4ee;
  border-radius: 10px;
  background: #ffffff;
  color: #6b7280;
  cursor: pointer;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}

.settings-btn:hover {
  background: #eef3ff;
  border-color: #c7d7fb;
  color: #2563eb;
}

/* подпись периода под итогом */
.period-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 2px;
  font-size: 12.5px;
  color: #8b93a1;
}

.period-note-text {
  font-variant-numeric: tabular-nums;
}

.period-edit {
  border: none;
  background: none;
  padding: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: #2563eb;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-color: rgba(37, 99, 235, 0.35);
  text-underline-offset: 2px;
}

.period-edit:hover {
  text-decoration-color: #2563eb;
}

.app-logo {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  flex: 0 0 auto;
}

.app-brand {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: #2563eb;
}

.app-brand-sub {
  font-size: 12px;
  color: #8b93a1;
}

/* ── User block ─────────────────────────────────────── */
.user-block {
  display: flex;
  align-items: center;
  gap: 16px;
  background: #ffffff;
  border: 1px solid #e5e8ef;
  border-radius: 14px;
  padding: 16px 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  text-align: left;
}

.user-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #2563eb;
  color: #ffffff;
  font-size: 22px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-info {
  flex: 1;
  min-width: 0;
  text-align: left;
}

.user-name {
  font-size: 16px;
  font-weight: 700;
  color: #1a1d21;
  display: block;
}

.user-role {
  font-size: 13px;
  color: #6b7280;
}

.logout-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: #f3f4f6;
  color: #6b7280;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.logout-btn:hover {
  background: #e5e7eb;
  color: #1a1d21;
}

/* ── Overtime total block ─────────────────────────────── */
.overtime-block {
  position: relative;
  background: #ffffff;
  border: 1px solid #e5e8ef;
  border-radius: 14px;
  padding: 20px 24px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  text-align: center;
}

.overtime-block.impact {
  animation: overtime-shake 0.48s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

@keyframes overtime-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-4px); }
  40% { transform: translateX(4px); }
  60% { transform: translateX(-2px); }
  80% { transform: translateX(2px); }
}

.overtime-head {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 8px;
  position: relative;
}

.overtime-title {
  font-size: 13px;
  font-weight: 500;
  color: #8b93a1;
  margin-bottom: 2px;
  display: block;
  line-height: 1.7;
  padding-right: 34px;
}

.overtime-period {
  color: #3f4754;
  font-weight: 700;
  white-space: nowrap;
}

.overtime-block .period-edit {
  margin-left: 6px;
}

/* ── Полоска уровней ─────────────────────────────────── */
.level-bar {
  position: relative;
  height: 30px;
  margin: 4px 0 8px;
}

.level-track,
.level-under,
.level-fill {
  position: absolute;
  inset: 0;
  border-radius: 999px;
}

.level-track {
  background: linear-gradient(180deg, #eef1f7, #e2e7f0);
  box-shadow:
    inset 0 2px 5px rgba(16, 24, 40, 0.14),
    inset 0 -1px 0 rgba(255, 255, 255, 0.9),
    0 1px 0 #fff;
  overflow: hidden;
}

/* бледная подложка предыдущего (закрытого) уровня */
.level-under {
  opacity: 0.2;
  overflow: hidden;
}

.level-fill {
  right: auto;
  min-width: 12px;
  overflow: hidden;
  box-shadow:
    0 0 18px rgba(37, 99, 235, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.6),
    inset 0 -8px 12px rgba(4, 20, 60, 0.14);
  transition: width 0.55s cubic-bezier(0.22, 1, 0.36, 1), background 0.4s ease;
}

.level-gloss {
  position: absolute;
  left: 4px;
  right: 4px;
  top: 3px;
  height: 38%;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.06));
}

.level-ticks {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  overflow: hidden;
  pointer-events: none;
}

.level-ticks span {
  position: absolute;
  top: 3px;
  bottom: 3px;
  width: 1px;
  background: rgba(16, 24, 40, 0.12);
}

.level-ticks.on-fill span {
  background: rgba(255, 255, 255, 0.22);
}

.level-foot {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: #8b93a1;
  line-height: 1.4;
}

.level-foot b {
  color: #3f4754;
  font-weight: 700;
}

.level-rest {
  white-space: nowrap;
}

/* вспышка при закрытии уровня */
.level-up-flash {
  animation: level-flash 1.3s ease;
}

@keyframes level-flash {
  0% { box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04); background: #fff; border-color: #e5e8ef; }
  12% { box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.35), 0 10px 34px rgba(245, 158, 11, 0.3); background: #fffdf4; border-color: #fde68a; }
  60% { box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.28), 0 8px 28px rgba(245, 158, 11, 0.22); background: #fffdf6; border-color: #fde68a; }
  100% { box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04); background: #fff; border-color: #e5e8ef; }
}

.level-up-badge {
  position: absolute;
  top: 12px;
  right: 14px;
  padding: 4px 10px;
  border-radius: 999px;
  background: #fef3c7;
  color: #b45309;
  font-size: 12px;
  font-weight: 800;
  animation: level-badge 1.3s ease forwards;
}

@keyframes level-badge {
  0% { opacity: 0; transform: translateY(-6px) scale(0.9); }
  14% { opacity: 1; transform: translateY(0) scale(1.06); }
  24% { transform: scale(1); }
  82% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-4px); }
}

@media (prefers-reduced-motion: reduce) {
  .level-fill { transition: none; }
  .level-up-flash { animation: none; }
  .level-up-badge { animation: none; opacity: 1; }
}


/* надпись «+N добавлено» прямо в полоске */
.level-delta {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  color: #1f2937;
  font-size: 11.5px;
  font-weight: 800;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(16, 24, 40, 0.18);
  animation: level-delta-in 1.9s ease forwards;
  pointer-events: none;
  z-index: 3;
}

.level-delta-minus {
  color: #ea580c;
}

@keyframes level-delta-in {
  0% { opacity: 0; transform: translate(-50%, calc(-50% + 7px)) scale(0.9); }
  12% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  76% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, calc(-50% - 7px)) scale(0.98); }
}

/* вспышка полоски в момент закрытия уровня */
.level-bar-flash .level-fill {
  animation: bar-glow 1.05s ease-in-out 2;
}

@keyframes bar-glow {
  0%, 100% { filter: brightness(1) saturate(1); }
  50% { filter: brightness(1.22) saturate(1.15); }
}

.level-bar-flash::after {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: 999px;
  box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.4), 0 0 26px rgba(245, 158, 11, 0.5);
  animation: bar-ring 1.05s ease-out 2;
  pointer-events: none;
}

@keyframes bar-ring {
  0% { opacity: 0; transform: scale(0.98); }
  30% { opacity: 1; }
  100% { opacity: 0; transform: scale(1.03); }
}

/* крупная плашка «+1 день» по центру карточки */
.level-up-big {
  position: absolute;
  left: 50%;
  top: 71%;
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding: 10px 22px;
  border-radius: 16px;
  background: linear-gradient(135deg, #f59e0b, #fbbf24);
  color: #ffffff;
  box-shadow: 0 14px 40px rgba(245, 158, 11, 0.45);
  animation: level-up-pop 1.6s cubic-bezier(0.2, 1.2, 0.3, 1) forwards;
  pointer-events: none;
  z-index: 5;
}

.level-up-big-num {
  font-size: 36px;
  font-weight: 900;
  letter-spacing: -1px;
  line-height: 1;
}

.level-up-big-text {
  font-size: 18px;
  font-weight: 800;
}

@keyframes level-up-pop {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
  14% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
  24% { transform: translate(-50%, -50%) scale(1); }
  78% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.08); }
}

@media (prefers-reduced-motion: reduce) {
  .level-delta { animation: none; opacity: 1; }
  .level-bar-flash .level-fill { animation: none; }
  .level-bar-flash::after { animation: none; opacity: 0; }
  .level-up-big { animation: none; }
}

.sound-toggle {
  position: absolute;
  right: -8px;
  top: -2px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: #f3f5f9;
  color: #6b7280;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.sound-toggle:hover {
  background: #e8ecf4;
  color: #2563eb;
}

.overtime-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 12px;
}

.overtime-value {
  font-size: 42px;
  font-weight: 800;
  color: #2563eb;
  display: block;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.delta-badge {
  font-size: 15px;
  font-weight: 800;
  color: #16a34a;
  white-space: nowrap;
  animation: delta-pop 2.4s ease forwards;
}

.delta-badge-minus {
  color: #ea580c;
}

.delta-badge-zero {
  color: #6b7280;
}

@keyframes delta-pop {
  0% { opacity: 0; transform: translateY(10px) scale(0.8); }
  12% { opacity: 1; transform: translateY(0) scale(1.12); }
  22% { transform: translateY(0) scale(1); }
  80% { opacity: 1; transform: translateY(-2px) scale(1); }
  100% { opacity: 0; transform: translateY(-10px) scale(0.96); }
}

@media (prefers-reduced-motion: reduce) {
  .overtime-block.impact { animation: none; }
  .delta-badge { animation: none; opacity: 1; }
}

.overtime-value .value-unit {
  font-size: 20px;
  font-weight: 600;
  color: #6b7280;
}

/* ── Settings card: период + время + сохранить ────────── */
.settings-block {
  background: #ffffff;
  border: 1px solid #e5e8ef;
  border-radius: 14px;
  padding: 18px 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
  color: #555b66;
  line-height: 1.35;
}

.field-divider {
  height: 1px;
  background: #eef1f6;
  margin: 0 -20px;
}

/* период: два равных поля на всю ширину карточки */
.period-inputs-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.period-inputs-group input[type='date'] {
  flex: 1 1 0;
  min-width: 0;
  height: 46px;
  padding: 0 12px;
  border: 1px solid #d7dbe3;
  border-radius: 10px;
  background: #f8fafc;
  font-size: 15px;
  color: #111827;
  font-variant-numeric: tabular-nums;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}

.period-inputs-group input[type='date']:focus {
  outline: none;
  background: #ffffff;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.period-sep {
  color: #9ca3af;
  font-weight: 700;
  flex: 0 0 auto;
}

/* время + кнопка на одной строке */
.time-inline {
  display: flex;
  align-items: center;
  gap: 12px;
}

.time-field {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.time-field input {
  width: 72px;
  height: 46px;
  padding: 0;
  text-align: center;
  border: 1px solid #d7dbe3;
  border-radius: 10px;
  background: #f8fafc;
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  font-variant-numeric: tabular-nums;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  -moz-appearance: textfield;
}

.time-field input::-webkit-outer-spin-button,
.time-field input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.time-field input:focus {
  outline: none;
  background: #ffffff;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.time-colon {
  font-size: 18px;
  font-weight: 700;
  color: #6b7280;
}

.save-btn {
  margin-left: auto;
  flex: 0 0 auto;
  height: 46px;
  padding: 0 22px;
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, box-shadow 0.2s, transform 0.1s;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
}

.save-btn:hover:not(:disabled) {
  background: #1d4ed8;
}

.save-btn:active:not(:disabled) {
  transform: translateY(1px);
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.save-btn-green {
  background: #16a34a !important;
  color: #ffffff !important;
  box-shadow: 0 4px 12px rgba(22, 163, 74, 0.3) !important;
}

.save-btn-green:hover {
  background: #15803d !important;
}


/* ── Галочка «спрашивать комментарий» ─────────────────── */
.ask-note-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  padding: 2px 0;
}

.ask-note-row input[type="checkbox"] {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}

.ask-note-box {
  position: relative;
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  margin-top: 1px;
  border-radius: 6px;
  background: #ffffff;
  border: 1.5px solid #cbd5e1;
  transition: background .15s, border-color .15s;
}

.ask-note-box::after {
  content: "";
  position: absolute;
  left: 7px;
  top: 3px;
  width: 6px;
  height: 11px;
  border: solid #ffffff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg) scale(0);
  transition: transform .15s;
}

.ask-note-row input:checked ~ .ask-note-box {
  background: #2563eb;
  border-color: #2563eb;
}

.ask-note-row input:checked ~ .ask-note-box::after {
  transform: rotate(45deg) scale(1);
}

.ask-note-row input:focus-visible ~ .ask-note-box {
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
}

.ask-note-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ask-note-title {
  font-size: 14px;
  font-weight: 600;
  color: #1a1d21;
  line-height: 1.35;
}

.ask-note-hint {
  font-size: 12px;
  color: #8b93a1;
  line-height: 1.4;
}

/* ── Окно комментария ────────────────────────────────── */
.note-modal {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 1200;
}

.note-modal-content {
  width: 100%;
  max-width: 440px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.note-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 10px;
}

.note-modal-title {
  font-size: 17px;
  font-weight: 700;
  color: #1a1d21;
  margin: 0;
}

.note-modal-sub {
  font-size: 12px;
  color: #8b93a1;
  margin-top: 3px;
}

.note-modal-body {
  padding: 0 18px 4px;
}

.note-textarea {
  width: 100%;
  min-height: 96px;
  resize: vertical;
  padding: 12px 14px;
  border: 1px solid #d7dbe3;
  border-radius: 10px;
  background: #f8fafc;
  font-size: 14px;
  line-height: 1.5;
  color: #111827;
  font-family: inherit;
  outline: none;
  transition: border-color .2s, box-shadow .2s, background .2s;
}

.note-textarea:focus {
  background: #ffffff;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.note-counter {
  font-size: 11px;
  color: #a6adb9;
  text-align: right;
  margin-top: 6px;
}

.note-modal-footer {
  display: flex;
  gap: 10px;
  padding: 14px 18px 18px;
}

.note-btn {
  flex: 1;
  height: 44px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background .2s;
}

.note-btn-primary {
  background: #2563eb;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
}

.note-btn-primary:hover {
  background: #1d4ed8;
}

.note-btn-ghost {
  background: #f3f5f9;
  color: #4b5563;
}

.note-btn-ghost:hover {
  background: #e8ecf4;
}

/* ── Fix button (2x larger) ───────────────────────────── */
.record-center {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
}

.main-record-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: clamp(200px, 58vw, 240px);
  height: clamp(200px, 58vw, 240px);
  padding: 0 12px;
  text-align: center;
  line-height: 1.15;
  border: 3px solid #2563eb;
  border-radius: 50%;
  background: #ffffff;
  color: #2563eb;
  /* надпись должна влезать в круг: при 26px «Зафиксировать» шире диаметра */
  font-size: clamp(19px, 5vw, 22px);
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  flex: 0 0 auto;
}

.main-record-btn:hover {
  background: #2563eb;
  color: #ffffff;
}

.main-record-btn-hidden {
  opacity: 0 !important;
  pointer-events: none;
}

.main-record-btn-busy {
  pointer-events: none;
}

.main-record-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.main-record-btn-green {
  background: #16a34a !important;
  border-color: #16a34a !important;
  color: #ffffff !important;
  box-shadow: 0 6px 16px rgba(22, 163, 74, 0.3);
}

.main-record-btn-green:hover {
  background: #15803d !important;
  border-color: #15803d !important;
}

/* ── Generate report button ──────────────────────────── */
.results-block {
  text-align: center;
  margin-bottom: 12px;
}

.report-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  background: #ffffff;
  border: 1px solid #e5e8ef;
  border-radius: 12px;
  color: #1a1d21;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  max-width: 400px;
  width: 100%;
  margin: 0 auto;
}

.report-btn:hover {
  background: #f0f4ff;
  border-color: #2563eb;
  color: #2563eb;
}

.results-block .report-btn svg {
  flex-shrink: 0;
}

/* ── Install note ────────────────────────────────────── */
.hint-box {
  background: #f5f8ff;
  border: 1px solid #e2e9f7;
  border-radius: 14px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: left;
}

.hint-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hint-icon {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: #e6efff;
  color: #2563eb;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hint-title {
  font-size: 14px;
  font-weight: 700;
  color: #1a1d21;
  line-height: 1.3;
}

.hint-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: #ffffff;
  border: 1px solid #e8eefb;
  border-radius: 10px;
  padding: 10px 12px;
}

.hint-badge {
  flex: 0 0 auto;
  min-width: 62px;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: #2563eb;
  background: #eaf1ff;
  border-radius: 999px;
  padding: 4px 8px;
  margin-top: 1px;
}

.hint-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #4b5563;
}

.hint-text b {
  color: #1a1d21;
  font-weight: 600;
}

/* ── Version footer ──────────────────────────────────── */
.version-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 6px 0 2px;
}

.version-label {
  font-size: 12px;
  color: #8b93a1;
  letter-spacing: 0.2px;
}

.changes-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d7dbe3;
  border-radius: 999px;
  background: #ffffff;
  color: #6b7280;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}

.changes-btn:hover {
  color: #2563eb;
  border-color: #2563eb;
  background: #f5f8ff;
}

/* ── Changes modal ───────────────────────────────────── */
.changes-modal {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 1100;
}

.changes-modal-content {
  width: 100%;
  max-width: 520px;
  max-height: 85vh;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.changes-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid #eef1f6;
}

.changes-modal-header h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #1a1d21;
}

.changes-modal-header .close-btn {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: #f3f5f9;
  color: #6b7280;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.changes-modal-header .close-btn:hover {
  background: #e8ecf4;
  color: #1a1d21;
}

.changes-list {
  padding: 16px 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.changes-list::-webkit-scrollbar {
  width: 8px;
}

.changes-list::-webkit-scrollbar-thumb {
  background: #dde3ee;
  border-radius: 999px;
}

.changes-list::-webkit-scrollbar-track {
  background: transparent;
}

.change-item {
  border: 1px solid #eef1f6;
  border-radius: 12px;
  padding: 14px 16px;
  background: #fbfcfe;
}

.change-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.change-version {
  font-size: 12px;
  font-weight: 700;
  color: #2563eb;
  background: #eaf1ff;
  border-radius: 999px;
  padding: 3px 10px;
}

.change-date {
  font-size: 12px;
  color: #8b93a1;
}

.change-current {
  font-size: 11px;
  font-weight: 600;
  color: #16a34a;
  background: #e8f7ee;
  border-radius: 999px;
  padding: 2px 8px;
}

.change-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.change-list li {
  font-size: 13px;
  line-height: 1.5;
  color: #4b5563;
  list-style: disc;
}

.changes-footer {
  padding: 12px 18px 16px;
  border-top: 1px solid #eef1f6;
  display: flex;
  justify-content: flex-end;
}

.changes-close-btn {
  height: 40px;
  padding: 0 20px;
  border: none;
  border-radius: 10px;
  background: #2563eb;
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
}

.changes-close-btn:hover {
  background: #1d4ed8;
}

/* ── Report modal ────────────────────────────────────── */
.report-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
}

.report-modal-content {
  width: 100%;
  max-width: 670px;
  max-height: 90vh;
  background: #ffffff;
  border-radius: 16px 16px 0 0;
  overflow-y: auto;
  padding: 0;
}

.report-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e8ef;
}

.report-modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #1a1d21;
}

.close-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: #f3f4f6;
  border-radius: 50%;
  color: #6b7280;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.close-btn:hover {
  background: #e5e7eb;
  color: #1a1d21;
}

.report-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px 24px 0;
}

.filter-chip {
  height: 32px;
  padding: 0 14px;
  border: 1px solid #d7dbe3;
  border-radius: 999px;
  background: #ffffff;
  color: #4b5563;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}

.filter-chip:hover {
  border-color: #2563eb;
  color: #2563eb;
}

.filter-chip-active {
  background: #2563eb;
  border-color: #2563eb;
  color: #ffffff;
}

.filter-chip-active:hover {
  background: #1d4ed8;
  color: #ffffff;
}

.filter-summary {
  margin-left: auto;
  font-size: 12px;
  color: #8b93a1;
  white-space: nowrap;
}

/* ── шапка отчёта: период, количество записей, сумма часов ── */
.report-header-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.report-header-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12.5px;
  color: #6b7280;
}

.report-header-meta b {
  color: #1f2937;
  font-weight: 700;
}

.meta-sep {
  color: #c3c9d4;
}

/* ── график ── */
.report-chart {
  margin: 14px 24px 0;
  padding: 14px 16px 10px;
  border: 1px solid #e5e8ef;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
}

.chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.chart-title {
  font-size: 13px;
  font-weight: 600;
  color: #4b5563;
}

.bar-chart {
  display: block;
  width: 100%;
  height: 170px;
}

.grid-line {
  stroke: #eef1f6;
  stroke-width: 1;
}

.axis-label {
  font-size: 10px;
  fill: #8b93a1;
}

.chart-bar {
  fill: #2563eb;
  fill-opacity: 0.85;
  transition: fill-opacity 0.15s;
}

.chart-bar:hover {
  fill-opacity: 1;
}

.chart-bar-clickable {
  cursor: pointer;
}

.chart-bar-selected {
  fill-opacity: 1;
  fill: #1d4ed8;
}

.chart-bar-dim {
  fill: #c7d2fe;
  fill-opacity: 0.9;
}

.chart-hint {
  margin-top: 6px;
  text-align: center;
  font-size: 11px;
  color: #9aa3b2;
}

.filter-chip-range {
  background: #eef3ff;
  border-color: #b7cefb;
  color: #1d4ed8;
}

.filter-chip-range:hover {
  background: #dde8ff;
}

.report-table-wrap {
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 24px;
}

.report-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 14px;
}

.report-table th:nth-child(1) { width: 15%; }
.report-table th:nth-child(2) { width: 19%; }
.report-table th:nth-child(3) { width: 19%; }
.report-table th:nth-child(4) { width: 32%; }
.report-table th:nth-child(5) { width: 15%; }

.report-table th {
  text-align: left;
  padding: 12px 14px;
  font-size: 12px;
  font-weight: 600;
  color: #555b66;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: #f8fafc;
  border-bottom: 2px solid #e5e8ef;
}

.report-table td {
  padding: 12px 14px;
  border-bottom: 1px solid #eef1f5;
  color: #1a1d21;
  vertical-align: middle;
}

.report-table tbody tr:hover {
  background: #f8fafc;
}

.comment-cell {
  min-width: 0;
  overflow-wrap: anywhere;
}

.empty-cell {
  text-align: center;
  padding: 20px 12px;
  color: #6b7280;
  font-size: 14px;
}

.note-text {
  font-size: 14px;
  color: #6b7280;
  line-height: 1.6;
  word-wrap: break-word;
  overflow-wrap: anywhere;
  hyphens: auto;
  max-width: 200px;
}

.note-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
}

.save-edit-btn {
  margin-left: 8px;
  padding: 6px 12px;
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.save-edit-btn:hover {
  background: #1d4ed8;
}

.actions-cell {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.edit-btn {
  padding: 6px 12px;
  background: #f3f4f6;
  color: #6b7280;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.edit-btn:hover {
  background: #e5e7eb;
  color: #1a1d21;
}

.report-footer {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding: 16px 24px;
  border-top: 1px solid #e5e8ef;
}

.print-action-btn,
.export-action-btn,
.close-action-btn {
  flex: 1;
  padding: 12px 16px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.print-action-btn {
  background: #2563eb;
  color: #ffffff;
}

.print-action-btn:hover {
  background: #1d4ed8;
}

.export-action-btn {
  background: #ffffff;
  color: #2563eb;
  border: 1px solid #c7d7fb !important;
}

.export-action-btn:hover {
  background: #eef3ff;
  border-color: #2563eb !important;
}

/* диалог «что выгрузить» */
.export-dialog {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.45);
  z-index: 1200;
}

.export-dialog-box {
  width: 100%;
  max-width: 420px;
  background: #ffffff;
  border-radius: 16px;
  padding: 22px 24px;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.2);
}

.export-dialog-box h4 {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 700;
  color: #1a1d21;
}

.export-dialog-box p {
  margin: 0 0 18px;
  font-size: 13.5px;
  line-height: 1.5;
  color: #6b7280;
}

.export-dialog-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.export-btn {
  padding: 11px 14px;
  border: 1px solid #dfe4ee;
  border-radius: 10px;
  background: #ffffff;
  color: #374151;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.export-btn:hover {
  background: #f5f8ff;
  border-color: #2563eb;
}

.export-btn-primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #ffffff;
}

.export-btn-primary:hover {
  background: #1d4ed8;
}

.export-btn-ghost {
  background: #f8fafc;
  color: #6b7280;
}

.close-action-btn {
  background: #f3f4f6;
  color: #6b7280;
}

.close-action-btn:hover {
  background: #e5e7eb;
  color: #1a1d21;
}

/* ── Responsive ──────────────────────────────────────── */
@media (max-width: 768px) {
  .screen.main {
    padding: 16px 16px 28px;
    gap: 16px;
  }

  .user-block {
    flex-wrap: nowrap;
    gap: 10px;
    padding: 14px 16px;
    text-align: left;
  }

  .user-avatar {
    width: 42px;
    height: 42px;
    font-size: 18px;
    flex: 0 0 auto;
  }

  .user-info {
    width: auto;
    order: 0;
    flex: 1 1 auto;
    min-width: 0;
    text-align: left;
  }

  .user-name {
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-role {
    font-size: 12px;
  }

  .logout-btn {
    flex: 0 0 auto;
    width: 34px;
    height: 34px;
  }

  .period-time-block {
    padding: 16px;
  }

  .period-time-row {
    flex-direction: column;
    gap: 16px;
  }

  .period-control,
  .time-control {
    flex: 1 1 100%;
  }

  .save-action {
    flex: 0 0 auto;
    justify-content: flex-start;
  }

  .main-record-btn {
    width: clamp(220px, 70vw, 270px);
    height: clamp(220px, 70vw, 270px);
    font-size: clamp(20px, 5.6vw, 24px);
  }

  .results-block {
    margin-top: 16px;
    text-align: center;
  }

  .report-btn {
    padding: 14px 18px;
    font-size: 15px;
  }

  .report-modal-content {
    max-height: 95vh;
  }

  .report-table-wrap {
    padding: 12px 16px;
  }

  .report-table th,
  .report-table td {
    padding: 10px;
    font-size: 13px;
  }

  .report-footer {
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 14px;

  }

  .report-footer > button {
    flex: 1 1 calc(50% - 4px);
    gap: 10px;
    padding: 12px 16px;
  }

  .print-action-btn,
  .close-action-btn {
    padding: 12px 16px;
    font-size: 14px;
  }
}

@media (max-width: 480px) {
  .screen.main {
    padding: 12px 12px 20px;
    gap: 12px;
  }

  .user-block {
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    text-align: left;
  }

  .user-avatar {
    width: 44px;
    height: 44px;
    font-size: 20px;
  }

  .user-info {
    flex: 1 1 auto;
    min-width: 0;
    text-align: left;
  }

  .user-name {
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-role {
    font-size: 12px;
  }

  .settings-block {
    padding: 14px 16px;
    gap: 12px;
  }

  .field-divider {
    margin: 0 -16px;
  }

  .period-inputs-group {
    gap: 8px;
  }

  .period-inputs-group input[type='date'] {
    height: 44px;
    padding: 0 10px;
    font-size: 14px;
  }

  /* на узком экране кнопка «Сохранить» уходит под поля на всю ширину */
  .time-inline {
    flex-wrap: wrap;
    gap: 10px;
  }

  .time-field {
    flex: 1 1 auto;
  }

  .time-field input {
    width: 100%;
    min-width: 64px;
    height: 44px;
  }

  .save-btn {
    margin-left: 0;
    width: 100%;
    height: 44px;
  }

  .hint-box {
    padding: 14px;
  }

  .hint-item {
    flex-direction: column;
    gap: 6px;
    padding: 10px;
  }

  .hint-badge {
    min-width: 0;
    align-self: flex-start;
  }

  .changes-modal {
    padding: 12px;
  }

  .changes-modal-content {
    max-height: 90vh;
  }

  .period-time-block {
    padding: 14px;
  }

  .period-inputs {
    flex-direction: column;
  }

  .period-inputs input {
    width: 100%;
  }

  .time-inputs {
    flex-direction: column;
  }

  .time-inputs input {
    width: 100%;
  }

  .time-colon {
    text-align: center;
    padding-bottom: 8px;
  }

  .save-btn {
    width: 100%;
  }

  .main-record-btn {
    width: clamp(200px, 62vw, 240px);
    height: clamp(200px, 62vw, 240px);
    font-size: clamp(18px, 5vw, 22px);
    padding: 0 8px;
  }

  .results-block {
    margin-top: 16px;
    text-align: center;
  }

  .report-btn {
    padding: 12px 16px;
    font-size: 14px;
  }

  .report-modal-content {
    max-width: 100%;
    border-radius: 12px;
  }

  .report-table th,
  .report-table td {
    padding: 8px;
    font-size: 12px;
  }

  .report-modal-header {
    padding: 16px 18px;
  }

  .report-footer {
    padding: 10px 16px;
  }
}

/* Отчёт на телефоне: таблица превращается в карточки */
@media screen and (max-width: 600px) {
  /* шестерёнка не должна перекрывать подзаголовок */
  .app-header {
    padding-right: 46px;
  }

  .app-brand-sub {
    display: none;
  }

  .report-filters {
    padding: 10px 14px 0;
    gap: 6px;
  }

  .report-chart {
    margin: 10px 14px 0;
    padding: 10px 12px 8px;
  }

  .bar-chart {
    height: 150px;
  }

  .axis-label {
    font-size: 9px;
  }

  .chart-title {
    font-size: 12px;
  }

  /* на узком экране половина подписей скрывается, чтобы не наезжали */
  .x-label-alt {
    display: none;
  }

  .filter-chip {
    height: 28px;
    padding: 0 11px;
    font-size: 12px;
  }

  .filter-summary {
    font-size: 11px;
  }

  .report-table-wrap {
    padding: 8px 14px 4px;
    overflow-x: hidden;
  }

  .report-table {
    display: block;
    width: 100%;
    font-size: 14px;
  }

  .report-table thead {
    display: none;
  }

  .report-table tbody,
  .report-table tr,
  .report-table td {
    display: block;
    width: 100%;
  }

  .report-table tr {
    border: 1px solid #e8ecf4;
    border-radius: 12px;
    padding: 10px 12px;
    margin-bottom: 10px;
    background: #ffffff;
  }

  .report-table tr:hover {
    background: #ffffff;
  }

  .report-table td {
    border: none;
    padding: 3px 0;
    display: flex;
    align-items: baseline;
    gap: 10px;
    overflow-wrap: anywhere;
  }

  .report-table td::before {
    content: attr(data-label);
    flex: 0 0 104px;
    color: #8b93a1;
    font-size: 12px;
    line-height: 1.4;
  }

  .report-table td.empty-cell {
    display: block;
    text-align: center;
    padding: 12px 0;
  }

  .report-table td.empty-cell::before {
    content: none;
  }

  .report-table td.comment-cell {
    display: block;
    padding-top: 4px;
  }

  .report-table td.comment-cell::before {
    display: block;
    margin-bottom: 2px;
  }

  .report-table td.col-actions {
    justify-content: flex-end;
    padding-top: 8px;
  }

  .report-table td.col-actions::before {
    content: none;
  }

  .note-text {
    max-width: none;
  }
}
</style>

<!-- Печать отчёта: печатается вся таблица, а не видимая часть модального окна -->
<style>
.print-only {
  display: none;
}

@media print {
  @page {
    size: A4 portrait;
    margin: 12mm 10mm;
  }

  html,
  body {
    background: #fff !important;
    height: auto !important;
    overflow: visible !important;
  }

  /* скрываем всё, кроме модального окна отчёта */
  .screen.main > *:not(.report-modal) {
    display: none !important;
  }

  .screen.main {
    display: block !important;
    padding: 0 !important;
    margin: 0 !important;
    max-width: none !important;
    min-height: 0 !important;
    background: #fff !important;
    gap: 0 !important;
  }

  .report-modal {
    position: static !important;
    inset: auto !important;
    display: block !important;
    background: #fff !important;
    padding: 0 !important;
    overflow: visible !important;
    width: 100% !important;
  }

  .report-modal-content {
    position: static !important;
    display: block !important;
    width: 100% !important;
    max-width: none !important;
    max-height: none !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    overflow: visible !important;
    background: #fff !important;
  }

  .report-modal-header {
    display: block !important;
    padding: 0 0 8px !important;
    border-bottom: 1px solid #000 !important;
  }

  .report-modal-header h3 {
    font-size: 14pt !important;
    margin: 0 !important;
    color: #000 !important;
  }

  /* кнопки и колонка действий на печати не нужны */
  .report-modal-header .close-btn,
  .report-footer,
  .report-filters,
  .report-chart,
  .export-dialog,
  .col-actions,
  .actions-cell,
  .empty-cell {
    display: none !important;
  }

  /* подкраску строк на печати убираем */
  .report-table tr,
  .report-table td {
    background: #fff !important;
  }

  .print-only {
    display: block !important;
    font-size: 10pt !important;
    margin: 6px 0 10px !important;
    color: #000 !important;
  }

  .report-table-wrap {
    max-height: none !important;
    overflow: visible !important;
    padding: 0 !important;
    border: none !important;
    box-shadow: none !important;
  }

  .report-table {
    width: 100% !important;
    border-collapse: collapse !important;
    font-size: 10pt !important;
  }

  /* заголовок таблицы повторяется на каждой странице */
  .report-table thead {
    display: table-header-group !important;
  }

  .report-table tfoot {
    display: table-footer-group !important;
  }

  /* строки не разрываются между страницами */
  .report-table tr {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }

  .report-table th,
  .report-table td {
    border: 1px solid #666 !important;
    padding: 6px 8px !important;
    color: #000 !important;
    background: #fff !important;
  }

  .report-table th {
    background: #eee !important;
    font-weight: 700 !important;
  }

  /* комментарий переносится, колонка не растягивает таблицу */
  .note-text {
    max-width: none !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
    color: #000 !important;
  }

  .comment-cell {
    min-width: 0 !important;
  }

  .note-input,
  .save-edit-btn,
  .edit-btn {
    display: none !important;
  }
}
</style>
