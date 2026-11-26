// ВРЕМЕННЫЙ модуль для подбора параметров анимации.
// После настройки значения переносятся в код, а этот файл и ползунки удаляются.

export type FxTune = {
  speed: number
  size: number
  count: number
}

export const FX_DEFAULT: FxTune = { speed: 1.3, size: 18, count: 80 }

const KEY = 'nntime_fx_tune'

export function loadFxTune(): FxTune {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...FX_DEFAULT }
    const parsed = JSON.parse(raw) as Partial<FxTune>
    return {
      speed: clamp(Number(parsed.speed) || FX_DEFAULT.speed, 0.4, 3),
      size: clamp(Number(parsed.size) || FX_DEFAULT.size, 4, 28),
      count: Math.round(clamp(Number(parsed.count) || FX_DEFAULT.count, 6, 80)),
    }
  } catch {
    return { ...FX_DEFAULT }
  }
}

export function saveFxTune(tune: FxTune) {
  localStorage.setItem(KEY, JSON.stringify(tune))
}

export function resetFxTune() {
  localStorage.removeItem(KEY)
  return { ...FX_DEFAULT }
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}