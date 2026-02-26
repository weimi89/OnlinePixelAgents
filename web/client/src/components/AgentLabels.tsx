import { useState, useEffect } from 'react'
import type { OfficeState } from '../office/engine/officeState.js'
import type { SubagentCharacter } from '../hooks/useExtensionMessages.js'
import { TILE_SIZE, CharacterState } from '../office/types.js'
import { t } from '../i18n.js'

/** Format raw model ID to short display name, e.g. "claude-opus-4-6" → "Opus" */
function formatModelName(model: string): string {
  const m = model.match(/^claude-(\w+)/)
  if (m) {
    return m[1].charAt(0).toUpperCase() + m[1].slice(1)
  }
  return model.replace(/^claude-/, '')
}

interface AgentLabelsProps {
  officeState: OfficeState
  agents: number[]
  agentStatuses: Record<number, string>
  agentModels: Record<number, string>
  containerRef: React.RefObject<HTMLDivElement | null>
  zoom: number
  panRef: React.RefObject<{ x: number; y: number }>
  subagentCharacters: SubagentCharacter[]
}

export function AgentLabels({
  officeState,
  agents,
  agentStatuses,
  agentModels,
  containerRef,
  zoom,
  panRef,
  subagentCharacters,
}: AgentLabelsProps) {
  const [, setTick] = useState(0)
  useEffect(() => {
    let rafId = 0
    const tick = () => {
      setTick((n) => n + 1)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  const el = containerRef.current
  if (!el) return null
  const rect = el.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  // Compute device pixel offset (same math as renderFrame, including pan)
  const canvasW = Math.round(rect.width * dpr)
  const canvasH = Math.round(rect.height * dpr)
  const layout = officeState.getLayout()
  const mapW = layout.cols * TILE_SIZE * zoom
  const mapH = layout.rows * TILE_SIZE * zoom
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x)
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y)

  // Build sub-agent label lookup
  const subLabelMap = new Map<number, string>()
  for (const sub of subagentCharacters) {
    subLabelMap.set(sub.id, sub.label)
  }

  // All character IDs to render labels for (regular agents + sub-agents)
  const allIds = [...agents, ...subagentCharacters.map((s) => s.id)]

  return (
    <>
      {allIds.map((id) => {
        const ch = officeState.characters.get(id)
        if (!ch) return null

        // Character position: device pixels → CSS pixels (follow sitting offset)
        const sittingOffset = ch.state === CharacterState.TYPE ? 14 : 0
        // Hide label when a non-detached speech bubble is showing (let the bubble be visible alone)
        // Detached bubble is persistent — show the label alongside it
        if (ch.bubbleType && ch.bubbleType !== 'detached') return null

        const screenX = (deviceOffsetX + ch.x * zoom) / dpr
        const screenY = (deviceOffsetY + (ch.y + sittingOffset - 46) * zoom) / dpr

        const status = agentStatuses[id]
        const isWaiting = status === 'waiting'
        const isActive = ch.isActive
        const isSub = ch.isSubagent
        const isDetached = ch.isDetached

        let dotColor: string | null = null
        if (isDetached) {
          dotColor = 'var(--pixel-status-detached)'
        } else if (isWaiting) {
          dotColor = '#cca700'
        } else if (isActive) {
          dotColor = '#3794ff'
        }

        const modelDisplay = agentModels[id] ? formatModelName(agentModels[id]) : null
        const labelText = isDetached
          ? t.detached
          : (subLabelMap.get(id) || (modelDisplay ? `${modelDisplay}` : t.agent(id)))

        return (
          <div
            key={id}
            style={{
              position: 'absolute',
              left: screenX,
              top: screenY,
              transform: 'translateX(-50%)',
              pointerEvents: 'none',
              zIndex: 40,
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: isSub ? '16px' : '18px',
                fontStyle: isSub ? 'italic' : undefined,
                color: 'var(--pixel-text)',
                background: 'rgba(30,30,46,0.7)',
                padding: '1px 5px',
                borderRadius: 2,
                whiteSpace: 'nowrap',
                maxWidth: isSub ? 120 : undefined,
                overflow: isSub ? 'hidden' : undefined,
                textOverflow: isSub ? 'ellipsis' : undefined,
              }}
            >
              {dotColor && (
                <span
                  className={isActive && !isWaiting ? 'pixel-agents-pulse' : undefined}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: dotColor,
                    flexShrink: 0,
                  }}
                />
              )}
              {labelText}
            </span>
          </div>
        )
      })}
    </>
  )
}
