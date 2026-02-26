import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'

const socket: Socket = io(window.location.origin, {
  transports: ['websocket', 'polling'],
})

// 暴露與 vscodeApi.ts 相同的介面，使所有現有程式碼只需最小修改即可運作
export const vscode = {
  postMessage(msg: unknown): void {
    socket.emit('message', msg)
  },
}

/**
 * 監聽來自伺服器的訊息。
 * @returns 取消訂閱函式。
 */
export function onServerMessage(handler: (data: unknown) => void): () => void {
  socket.on('message', handler)
  return () => { socket.off('message', handler) }
}

/**
 * 監聽 Socket.IO 連線狀態變更。
 * @returns 取消訂閱函式。
 */
export function onConnectionChange(handler: (connected: boolean) => void): () => void {
  const onConnect = () => handler(true)
  const onDisconnect = () => handler(false)
  socket.on('connect', onConnect)
  socket.on('disconnect', onDisconnect)
  return () => {
    socket.off('connect', onConnect)
    socket.off('disconnect', onDisconnect)
  }
}

/** 取得目前的連線狀態 */
export function isConnected(): boolean {
  return socket.connected
}
