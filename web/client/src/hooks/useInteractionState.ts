import { useState, useCallback } from 'react'
import { vscode } from '../socketApi.js'
import type { OfficeState } from '../office/engine/officeState.js'

export interface InteractionState {
  contextMenu: { agentId: number; x: number; y: number } | null
  detailPanelAgentId: number | null
  editorTickForKeyboard: number
  handleContextMenu: (agentId: number, x: number, y: number) => void
  handleCloseContextMenu: () => void
  handleClick: (agentId: number) => void
  handleCloseDetailPanel: () => void
  handleSelectAgent: (id: number) => void
  handleCloseAgent: (id: number) => void
  triggerEditorTickForKeyboard: () => void
}

/**
 * 互動狀態 hook — 右鍵選單、代理詳情面板、編輯器鍵盤 tick。
 */
export function useInteractionState(getOfficeState: () => OfficeState): InteractionState {
  const [contextMenu, setContextMenu] = useState<{ agentId: number; x: number; y: number } | null>(null)
  const [detailPanelAgentId, setDetailPanelAgentId] = useState<number | null>(null)
  const [editorTickForKeyboard, setEditorTickForKeyboard] = useState(0)

  const handleContextMenu = useCallback((agentId: number, x: number, y: number) => {
    setContextMenu({ agentId, x, y })
  }, [])

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const handleClick = useCallback((agentId: number) => {
    // 若點擊的是子代理，改為聚焦父代理的終端
    const os = getOfficeState()
    const meta = os.subagentMeta.get(agentId)
    const focusId = meta ? meta.parentAgentId : agentId
    vscode.postMessage({ type: 'focusAgent', id: focusId })
    // 切換代理詳情面板（點擊同一代理則關閉，不同代理則切換）
    setDetailPanelAgentId((prev) => prev === focusId ? null : focusId)
  }, [getOfficeState])

  const handleCloseDetailPanel = useCallback(() => {
    setDetailPanelAgentId(null)
  }, [])

  const handleSelectAgent = useCallback((id: number) => {
    vscode.postMessage({ type: 'focusAgent', id })
  }, [])

  const handleCloseAgent = useCallback((id: number) => {
    vscode.postMessage({ type: 'closeAgent', id })
  }, [])

  const triggerEditorTickForKeyboard = useCallback(() => setEditorTickForKeyboard((n) => n + 1), [])

  return {
    contextMenu,
    detailPanelAgentId,
    editorTickForKeyboard,
    handleContextMenu,
    handleCloseContextMenu,
    handleClick,
    handleCloseDetailPanel,
    handleSelectAgent,
    handleCloseAgent,
    triggerEditorTickForKeyboard,
  }
}
