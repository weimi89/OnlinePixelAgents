import type { ToolActivity } from '../types.js'
import type { OfficeState } from '../engine/officeState.js'
import type { SubagentCharacter, TranscriptEntry } from '../../hooks/useExtensionMessages.js'

interface ToolOverlayProps {
  officeState: OfficeState
  agents: number[]
  agentTools: Record<number, ToolActivity[]>
  agentModels: Record<number, string>
  subagentCharacters: SubagentCharacter[]
  containerRef: React.RefObject<HTMLDivElement | null>
  zoom: number
  panRef: React.RefObject<{ x: number; y: number }>
  onCloseAgent: (id: number) => void
  agentProjects: Record<number, string>
  remoteAgents: Record<number, { owner: string }>
  agentTranscripts: Record<number, TranscriptEntry[]>
  agentGitBranches?: Record<number, string>
  agentTeams?: Record<number, string>
  agentCliTypes?: Record<number, string>
}

/**
 * ToolOverlay — 已停用。
 * 選取代理的詳細資訊現在統一由右側 AgentDetailPanel 顯示。
 * 保留組件介面以免上游引用報錯。
 */
export function ToolOverlay(_props: ToolOverlayProps) {
  return null
}
