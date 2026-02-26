import { useState, useEffect } from 'react'

/**
 * Shared requestAnimationFrame loop for React overlay components.
 * Multiple components using this hook share a single rAF callback,
 * reducing overhead compared to each running its own independent loop.
 */
const callbacks = new Set<() => void>()
let rafId = 0

function tick() {
  for (const cb of callbacks) cb()
  if (callbacks.size > 0) {
    rafId = requestAnimationFrame(tick)
  }
}

export function useRenderTick(): void {
  const [, setTick] = useState(0)
  useEffect(() => {
    const cb = () => setTick((n) => n + 1)
    callbacks.add(cb)
    if (callbacks.size === 1) {
      rafId = requestAnimationFrame(tick)
    }
    return () => {
      callbacks.delete(cb)
      if (callbacks.size === 0) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [])
}
