import {
  DAY_NIGHT_DAWN_HOUR,
  DAY_NIGHT_DAY_HOUR,
  DAY_NIGHT_DUSK_HOUR,
  DAY_NIGHT_NIGHT_HOUR,
  DAY_NIGHT_MAX_ALPHA_NIGHT,
  DAY_NIGHT_MAX_ALPHA_TRANSITION,
} from '../../constants.js'
import type { DayPhase } from '../types.js'

/** 根據小時判斷日夜階段 */
export function getDayPhase(hour: number): DayPhase {
  if (hour >= DAY_NIGHT_DAWN_HOUR && hour < DAY_NIGHT_DAY_HOUR) return 'dawn'
  if (hour >= DAY_NIGHT_DAY_HOUR && hour < DAY_NIGHT_DUSK_HOUR) return 'day'
  if (hour >= DAY_NIGHT_DUSK_HOUR && hour < DAY_NIGHT_NIGHT_HOUR) return 'dusk'
  return 'night'
}

/** 根據時間計算平滑插值的色溫覆蓋層 */
export function getDayNightOverlay(hour: number, minute: number): { color: string; alpha: number } {
  const t = hour + minute / 60

  // 白天：無覆蓋
  if (t >= DAY_NIGHT_DAY_HOUR && t < DAY_NIGHT_DUSK_HOUR) {
    return { color: 'rgba(0,0,0,0)', alpha: 0 }
  }

  // 黎明過渡：dawn → day（暖色漸弱）
  if (t >= DAY_NIGHT_DAWN_HOUR && t < DAY_NIGHT_DAY_HOUR) {
    const progress = (t - DAY_NIGHT_DAWN_HOUR) / (DAY_NIGHT_DAY_HOUR - DAY_NIGHT_DAWN_HOUR)
    const alpha = DAY_NIGHT_MAX_ALPHA_TRANSITION * (1 - progress)
    return { color: `rgba(255, 180, 100, ${alpha})`, alpha }
  }

  // 黃昏過渡：day → dusk → night（暖色漸強再轉冷色）
  if (t >= DAY_NIGHT_DUSK_HOUR && t < DAY_NIGHT_NIGHT_HOUR) {
    const progress = (t - DAY_NIGHT_DUSK_HOUR) / (DAY_NIGHT_NIGHT_HOUR - DAY_NIGHT_DUSK_HOUR)
    if (progress < 0.5) {
      // 前半段：暖色漸強
      const p = progress * 2
      const alpha = DAY_NIGHT_MAX_ALPHA_TRANSITION * p
      return { color: `rgba(255, 120, 50, ${alpha})`, alpha }
    } else {
      // 後半段：暖色轉冷色
      const p = (progress - 0.5) * 2
      const r = Math.round(255 * (1 - p) + 20 * p)
      const g = Math.round(120 * (1 - p) + 20 * p)
      const b = Math.round(50 * (1 - p) + 60 * p)
      const alpha = DAY_NIGHT_MAX_ALPHA_TRANSITION + (DAY_NIGHT_MAX_ALPHA_NIGHT - DAY_NIGHT_MAX_ALPHA_TRANSITION) * p
      return { color: `rgba(${r}, ${g}, ${b}, ${alpha})`, alpha }
    }
  }

  // 夜間 → 黎明前過渡
  if (t >= 0 && t < DAY_NIGHT_DAWN_HOUR) {
    // 接近黎明時逐漸減弱
    if (t >= DAY_NIGHT_DAWN_HOUR - 1) {
      const progress = t - (DAY_NIGHT_DAWN_HOUR - 1) // 0 → 1
      const nightAlpha = DAY_NIGHT_MAX_ALPHA_NIGHT * (1 - progress)
      const dawnAlpha = DAY_NIGHT_MAX_ALPHA_TRANSITION * progress
      // 從冷色逐漸轉暖色
      const r = Math.round(20 * (1 - progress) + 255 * progress)
      const g = Math.round(20 * (1 - progress) + 180 * progress)
      const b = Math.round(60 * (1 - progress) + 100 * progress)
      const alpha = nightAlpha + dawnAlpha
      return { color: `rgba(${r}, ${g}, ${b}, ${alpha})`, alpha }
    }
    return { color: `rgba(20, 20, 60, ${DAY_NIGHT_MAX_ALPHA_NIGHT})`, alpha: DAY_NIGHT_MAX_ALPHA_NIGHT }
  }

  // 深夜（19-24）
  return { color: `rgba(20, 20, 60, ${DAY_NIGHT_MAX_ALPHA_NIGHT})`, alpha: DAY_NIGHT_MAX_ALPHA_NIGHT }
}

/** 是否應該亮燈 */
export function shouldLampsBeOn(phase: DayPhase): boolean {
  return phase === 'dusk' || phase === 'night'
}
