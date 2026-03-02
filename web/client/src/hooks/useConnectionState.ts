import { useState, useEffect } from 'react'
import { onConnectionChange, isConnected } from '../socketApi.js'

/**
 * Socket.IO 連線狀態 hook。
 * 訂閱連線/斷線事件，回傳目前連線狀態。
 */
export function useConnectionState(): boolean {
  const [connected, setConnected] = useState(isConnected)
  useEffect(() => onConnectionChange(setConnected), [])
  return connected
}
