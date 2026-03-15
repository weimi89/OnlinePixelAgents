/**
 * 訊息權限過濾 — 控制 anonymous 用戶不應收到的敏感訊息類型。
 * admin/member 可接收所有訊息；anonymous 僅接收非敏感訊息。
 */

/** anonymous 用戶不應收到的敏感訊息類型 */
export const SENSITIVE_MESSAGE_TYPES = new Set([
	'agentToolStart',
	'agentToolDone',
	'agentToolClear',
	'agentToolPermission',
	'agentToolPermissionClear',
	'subagentToolStart',
	'subagentToolDone',
	'subagentClear',
	'agentModel',
	'agentTranscript',
	'agentThinking',
	'agentGrowth',
]);

/** 檢查訊息是否應發送給該角色的 socket */
export function shouldSendMessage(socketRole: string, msgType: string): boolean {
	if (socketRole === 'admin' || socketRole === 'member') return true;
	// anonymous 不收敏感訊息
	return !SENSITIVE_MESSAGE_TYPES.has(msgType);
}
