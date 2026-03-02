import { useState, useCallback } from 'react'
import { vscode } from '../socketApi.js'

export interface DisplaySettings {
  uiScale: number
  isDebugMode: boolean
  dayNightEnabled: boolean
  dayNightTimeOverride: number | null
  handleUiScaleLoaded: (scale: number) => void
  handleUiScaleChange: (scale: number) => void
  handleToggleDebugMode: () => void
  handleToggleDayNight: () => void
  handleDayNightTimeOverrideChange: (h: number | null) => void
}

/**
 * 顯示設定 hook — UI 縮放、日夜循環、除錯模式。
 */
export function useDisplaySettings(): DisplaySettings {
  const [uiScale, setUiScale] = useState(1)
  const [isDebugMode, setIsDebugMode] = useState(false)
  const [dayNightEnabled, setDayNightEnabled] = useState(true)
  const [dayNightTimeOverride, setDayNightTimeOverride] = useState<number | null>(null)

  const handleUiScaleLoaded = useCallback((scale: number) => setUiScale(scale), [])
  const handleUiScaleChange = useCallback((scale: number) => {
    setUiScale(scale)
    vscode.postMessage({ type: 'setUiScale', scale })
  }, [])
  const handleToggleDebugMode = useCallback(() => setIsDebugMode((prev) => !prev), [])
  const handleToggleDayNight = useCallback(() => setDayNightEnabled((v) => !v), [])
  const handleDayNightTimeOverrideChange = useCallback((h: number | null) => setDayNightTimeOverride(h), [])

  return {
    uiScale,
    isDebugMode,
    dayNightEnabled,
    dayNightTimeOverride,
    handleUiScaleLoaded,
    handleUiScaleChange,
    handleToggleDebugMode,
    handleToggleDayNight,
    handleDayNightTimeOverrideChange,
  }
}
