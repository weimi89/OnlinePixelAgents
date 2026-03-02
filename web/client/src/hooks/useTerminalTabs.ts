import { useState, useCallback } from 'react'
import { t } from '../i18n.js'

export interface TerminalTabsState {
  terminalTabs: Array<{ agentId: number; label: string }>
  activeTerminalTabId: number | null
  setActiveTerminalTabId: React.Dispatch<React.SetStateAction<number | null>>
  handleOpenTerminal: (agentId: number) => void
  handleCloseTerminalTab: (agentId: number) => void
  handleCloseTerminalPanel: () => void
}

/**
 * 終端分頁管理 hook — 管理開啟的終端分頁及活躍分頁。
 */
export function useTerminalTabs(agentProjects: Record<number, string>): TerminalTabsState {
  const [terminalTabs, setTerminalTabs] = useState<Array<{ agentId: number; label: string }>>([])
  const [activeTerminalTabId, setActiveTerminalTabId] = useState<number | null>(null)

  const handleOpenTerminal = useCallback((agentId: number) => {
    const label = agentProjects[agentId] || t.agent(agentId)
    setTerminalTabs((prev) => {
      if (prev.some((tab) => tab.agentId === agentId)) return prev
      return [...prev, { agentId, label }]
    })
    setActiveTerminalTabId(agentId)
  }, [agentProjects])

  const handleCloseTerminalTab = useCallback((agentId: number) => {
    setTerminalTabs((prev) => prev.filter((tab) => tab.agentId !== agentId))
    setActiveTerminalTabId((prev) => {
      if (prev !== agentId) return prev
      const remaining = terminalTabs.filter((tab) => tab.agentId !== agentId)
      return remaining.length > 0 ? remaining[remaining.length - 1].agentId : null
    })
  }, [terminalTabs])

  const handleCloseTerminalPanel = useCallback(() => {
    setTerminalTabs([])
    setActiveTerminalTabId(null)
  }, [])

  return {
    terminalTabs,
    activeTerminalTabId,
    setActiveTerminalTabId,
    handleOpenTerminal,
    handleCloseTerminalTab,
    handleCloseTerminalPanel,
  }
}
