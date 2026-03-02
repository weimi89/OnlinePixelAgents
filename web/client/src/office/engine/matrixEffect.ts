import type { Character, SpriteData } from '../types.js'
import { MATRIX_EFFECT_DURATION } from '../types.js'
import {
  MATRIX_TRAIL_LENGTH,
  MATRIX_SPRITE_COLS,
  MATRIX_SPRITE_ROWS,
  MATRIX_FLICKER_FPS,
  MATRIX_FLICKER_VISIBILITY_THRESHOLD,
  MATRIX_COLUMN_STAGGER_RANGE,
  MATRIX_HEAD_COLOR,
  MATRIX_TRAIL_OVERLAY_ALPHA,
  MATRIX_TRAIL_EMPTY_ALPHA,
  MATRIX_TRAIL_MID_THRESHOLD,
  MATRIX_TRAIL_DIM_THRESHOLD,
} from '../../constants.js'

/** 基於雜湊的閃爍：~70% 可見以產生微光效果 */
function flickerVisible(col: number, row: number, time: number): boolean {
  const t = Math.floor(time * MATRIX_FLICKER_FPS)
  const hash = ((col * 7 + row * 13 + t * 31) & 0xff)
  return hash < MATRIX_FLICKER_VISIBILITY_THRESHOLD
}

function generateSeeds(): number[] {
  const seeds: number[] = []
  for (let i = 0; i < MATRIX_SPRITE_COLS; i++) {
    seeds.push(Math.random())
  }
  return seeds
}

export { generateSeeds as matrixEffectSeeds }

/** 量化 alpha 至 0.05 精度，減少 Map 鍵碎片化 */
function quantizeAlpha(alpha: number): number {
  return Math.round(alpha * 20) / 20
}

/** 選取拖尾綠色 RGB 通道 */
function trailRGB(trailPos: number): string {
  if (trailPos < MATRIX_TRAIL_MID_THRESHOLD) return '0,255,65'
  if (trailPos < MATRIX_TRAIL_DIM_THRESHOLD) return '0,170,40'
  return '0,85,20'
}

/**
 * 以 Matrix 風格數位雨生成/消散特效渲染角色。
 * 按顏色批次繪製以減少 fillStyle 切換次數。
 */
export function renderMatrixEffect(
  ctx: CanvasRenderingContext2D,
  ch: Character,
  spriteData: SpriteData,
  drawX: number,
  drawY: number,
  zoom: number,
): void {
  const progress = ch.matrixEffectTimer / MATRIX_EFFECT_DURATION
  const isSpawn = ch.matrixEffect === 'spawn'
  const time = ch.matrixEffectTimer
  const totalSweep = MATRIX_SPRITE_ROWS + MATRIX_TRAIL_LENGTH

  // 階段 1：蒐集像素至顏色批次（避免頻繁 fillStyle 切換）
  const batches = new Map<string, Array<number>>()
  function emit(color: string, px: number, py: number) {
    let arr = batches.get(color)
    if (!arr) { arr = []; batches.set(color, arr) }
    arr.push(px, py)
  }

  for (let col = 0; col < MATRIX_SPRITE_COLS; col++) {
    const stagger = (ch.matrixEffectSeeds[col] ?? 0) * MATRIX_COLUMN_STAGGER_RANGE
    const colProgress = Math.max(0, Math.min(1, (progress - stagger) / (1 - MATRIX_COLUMN_STAGGER_RANGE)))
    const headRow = colProgress * totalSweep

    for (let row = 0; row < MATRIX_SPRITE_ROWS; row++) {
      const pixel = spriteData[row]?.[col]
      const hasPixel = pixel && pixel !== ''
      const distFromHead = headRow - row
      const px = drawX + col * zoom
      const py = drawY + row * zoom

      if (isSpawn) {
        if (distFromHead < 0) {
          continue
        } else if (distFromHead < 1) {
          emit(MATRIX_HEAD_COLOR, px, py)
        } else if (distFromHead < MATRIX_TRAIL_LENGTH) {
          const trailPos = distFromHead / MATRIX_TRAIL_LENGTH
          if (hasPixel) {
            emit(pixel, px, py)
            if (flickerVisible(col, row, time)) {
              const greenAlpha = quantizeAlpha((1 - trailPos) * MATRIX_TRAIL_OVERLAY_ALPHA)
              emit(`rgba(0,255,65,${greenAlpha})`, px, py)
            }
          } else {
            if (flickerVisible(col, row, time)) {
              const alpha = quantizeAlpha((1 - trailPos) * MATRIX_TRAIL_EMPTY_ALPHA)
              emit(`rgba(${trailRGB(trailPos)},${alpha})`, px, py)
            }
          }
        } else {
          if (hasPixel) {
            emit(pixel, px, py)
          }
        }
      } else {
        if (distFromHead < 0) {
          if (hasPixel) {
            emit(pixel, px, py)
          }
        } else if (distFromHead < 1) {
          emit(MATRIX_HEAD_COLOR, px, py)
        } else if (distFromHead < MATRIX_TRAIL_LENGTH) {
          if (flickerVisible(col, row, time)) {
            const trailPos = distFromHead / MATRIX_TRAIL_LENGTH
            const alpha = quantizeAlpha((1 - trailPos) * MATRIX_TRAIL_EMPTY_ALPHA)
            emit(`rgba(${trailRGB(trailPos)},${alpha})`, px, py)
          }
        }
      }
    }
  }

  // 階段 2：按顏色批次繪製
  for (const [color, coords] of batches) {
    ctx.fillStyle = color
    for (let i = 0; i < coords.length; i += 2) {
      ctx.fillRect(coords[i], coords[i + 1], zoom, zoom)
    }
  }
}
