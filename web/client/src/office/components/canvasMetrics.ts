import { TILE_SIZE } from '../types.js'

export interface CanvasMetrics {
  deviceOffsetX: number
  deviceOffsetY: number
  dpr: number
}

/** 計算 canvas 裝置像素偏移（地圖置中 + 平移），供 AgentLabels 和 ToolOverlay 共用 */
export function computeCanvasMetrics(
  containerEl: HTMLDivElement,
  cols: number,
  rows: number,
  zoom: number,
  pan: { x: number; y: number },
): CanvasMetrics {
  const dpr = window.devicePixelRatio || 1
  const rect = containerEl.getBoundingClientRect()
  const canvasW = Math.round(rect.width * dpr)
  const canvasH = Math.round(rect.height * dpr)
  const mapW = cols * TILE_SIZE * zoom
  const mapH = rows * TILE_SIZE * zoom
  return {
    deviceOffsetX: Math.floor((canvasW - mapW) / 2) + Math.round(pan.x),
    deviceOffsetY: Math.floor((canvasH - mapH) / 2) + Math.round(pan.y),
    dpr,
  }
}
