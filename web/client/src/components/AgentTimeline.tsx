import { memo } from 'react'
import type { ToolActivity } from '../office/types.js'
import { extractToolName } from '../office/toolUtils.js'
import { TOOL_TYPE_COLORS_HEX } from '../constants.js'

interface AgentTimelineProps {
  tools: ToolActivity[]
}

const TIMELINE_WINDOW_MS = 5 * 60 * 1000
const BAR_HEIGHT = 12
const ROW_GAP = 2
const MAX_TOOLS = 20

function getHexColor(toolName: string): string {
  for (const [key, color] of Object.entries(TOOL_TYPE_COLORS_HEX)) {
    if (key === 'default') continue
    if (toolName.includes(key)) return color
  }
  return TOOL_TYPE_COLORS_HEX.default
}

export const AgentTimeline = memo(function AgentTimeline({ tools }: AgentTimelineProps) {
  const now = Date.now()
  const windowStart = now - TIMELINE_WINDOW_MS
  const recentTools = tools
    .filter(tool => (tool.endTime ?? now) > windowStart)
    .slice(-MAX_TOOLS)

  if (recentTools.length === 0) return null

  const totalHeight = recentTools.length * (BAR_HEIGHT + ROW_GAP)

  return (
    <div style={{ position: 'relative', height: totalHeight, overflow: 'hidden' }}>
      {recentTools.map((tool, i) => {
        const name = extractToolName(tool.status) || tool.status
        const start = Math.max(tool.startTime, windowStart)
        const end = tool.endTime ?? now
        const left = ((start - windowStart) / TIMELINE_WINDOW_MS) * 100
        const width = Math.max(1, ((end - start) / TIMELINE_WINDOW_MS) * 100)
        const color = getHexColor(name)
        const elapsed = ((end - tool.startTime) / 1000).toFixed(1)
        const isActive = !tool.done

        return (
          <div
            key={tool.toolId}
            title={`${name} (${elapsed}s)`}
            style={{
              position: 'absolute',
              left: `${left}%`,
              width: `${width}%`,
              top: i * (BAR_HEIGHT + ROW_GAP),
              height: BAR_HEIGHT,
              background: color,
              border: '1px solid var(--pixel-border)',
              opacity: isActive ? 1 : 0.7,
              animation: isActive ? 'chatPulse 1s ease-in-out infinite' : undefined,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              fontSize: '9px',
              lineHeight: `${BAR_HEIGHT}px`,
              paddingLeft: 2,
              color: '#fff',
            }}
          >
            {name}
          </div>
        )
      })}
    </div>
  )
})
