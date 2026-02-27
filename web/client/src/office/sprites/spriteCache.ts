import type { SpriteData } from '../types.js'
import { SPRITE_CACHE_MAX_ZOOM_LEVELS } from '../../constants.js'

const zoomCaches = new Map<number, WeakMap<SpriteData, HTMLCanvasElement>>()

// ── 輪廓精靈圖生成 ─────────────────────────────────

const outlineCache = new WeakMap<SpriteData, SpriteData>()

/** 生成 1px 白色輪廓 SpriteData（每個維度大 2px） */
export function getOutlineSprite(sprite: SpriteData): SpriteData {
  const cached = outlineCache.get(sprite)
  if (cached) return cached

  const rows = sprite.length
  const cols = sprite[0].length
  // 擴展網格：每個維度 +2 以容納 1px 邊框
  const outline: string[][] = []
  for (let r = 0; r < rows + 2; r++) {
    outline.push(new Array<string>(cols + 2).fill(''))
  }

  // 對每個不透明像素，將其 4 個基本方向鄰居標記為白色
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (sprite[r][c] === '') continue
      const er = r + 1
      const ec = c + 1
      if (outline[er - 1][ec] === '') outline[er - 1][ec] = '#FFFFFF'
      if (outline[er + 1][ec] === '') outline[er + 1][ec] = '#FFFFFF'
      if (outline[er][ec - 1] === '') outline[er][ec - 1] = '#FFFFFF'
      if (outline[er][ec + 1] === '') outline[er][ec + 1] = '#FFFFFF'
    }
  }

  // 清除與原始不透明像素重疊的像素
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (sprite[r][c] !== '') {
        outline[r + 1][c + 1] = ''
      }
    }
  }

  outlineCache.set(sprite, outline)
  return outline
}

/** 清除所有縮放快取 */
export function clearSpriteCaches(): void {
  zoomCaches.clear()
  tintCache = new WeakMap()
}

// ── 著色覆蓋 ───────────────────────────────────────

let tintCache = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>()

/** 以 source-atop 混合模式將 canvas 中的不透明像素著色為指定顏色，結果快取 */
export function tintCanvas(source: HTMLCanvasElement, color: string): HTMLCanvasElement {
  let colorMap = tintCache.get(source)
  if (!colorMap) {
    colorMap = new Map()
    tintCache.set(source, colorMap)
  }
  const cached = colorMap.get(color)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const c = canvas.getContext('2d')!
  c.drawImage(source, 0, 0)
  c.globalCompositeOperation = 'source-atop'
  c.fillStyle = color
  c.fillRect(0, 0, canvas.width, canvas.height)
  colorMap.set(color, canvas)
  return canvas
}

export function getCachedSprite(sprite: SpriteData, zoom: number): HTMLCanvasElement {
  let cache = zoomCaches.get(zoom)
  if (!cache) {
    cache = new WeakMap()
    zoomCaches.set(zoom, cache)
    // 超過最大 zoom levels 時，刪除最舊的
    if (zoomCaches.size > SPRITE_CACHE_MAX_ZOOM_LEVELS) {
      const oldest = zoomCaches.keys().next().value!
      zoomCaches.delete(oldest)
    }
  }

  const cached = cache.get(sprite)
  if (cached) return cached

  const rows = sprite.length
  const cols = sprite[0].length
  const canvas = document.createElement('canvas')
  canvas.width = cols * zoom
  canvas.height = rows * zoom
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const color = sprite[r][c]
      if (color === '') continue
      ctx.fillStyle = color
      ctx.fillRect(c * zoom, r * zoom, zoom, zoom)
    }
  }

  cache.set(sprite, canvas)
  return canvas
}
