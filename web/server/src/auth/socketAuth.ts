import type { Socket } from 'socket.io';
import { verifyToken } from './jwt.js';
import type { UserRole } from '../types.js';

/** Socket 上附帶的認證資料介面 */
export interface SocketAuthData {
	role: UserRole;
	userId?: string;
	username?: string;
}

/**
 * Socket.IO 認證中間件 — 驗證 handshake auth 中的 token。
 * 無 token 或 token 無效時降級為 anonymous（不拒絕連線）。
 */
export function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void): void {
	const token = socket.handshake.auth?.token as string | undefined;
	if (!token) {
		// 無 token → anonymous（允許連入）
		socket.data.role = 'anonymous' as UserRole;
		socket.data.userId = undefined;
		socket.data.username = undefined;
		return next();
	}
	try {
		const payload = verifyToken(token);
		socket.data.role = (payload.role ?? 'member') as UserRole;
		socket.data.userId = payload.userId;
		socket.data.username = payload.username;
		return next();
	} catch {
		// token 無效 → 降級為 anonymous（不拒絕連線）
		socket.data.role = 'anonymous' as UserRole;
		socket.data.userId = undefined;
		socket.data.username = undefined;
		return next();
	}
}

/**
 * 處理 auth:upgrade — 已連線的 socket 升級身份。
 * 回傳升級結果（成功時包含角色與使用者名稱）。
 */
export function handleAuthUpgrade(
	socket: Socket,
	token: string,
): { success: boolean; role?: UserRole; username?: string; error?: string } {
	try {
		const payload = verifyToken(token);
		socket.data.role = (payload.role ?? 'member') as UserRole;
		socket.data.userId = payload.userId;
		socket.data.username = payload.username;
		return { success: true, role: socket.data.role as UserRole, username: payload.username };
	} catch {
		return { success: false, error: 'Invalid or expired token' };
	}
}
