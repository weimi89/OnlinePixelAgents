/** Agent Node 向伺服器推送的事件（遠端 → 中央） */
export type AgentNodeEvent =
	| { type: 'agentStarted'; sessionId: string; projectName: string; projectDir: string }
	| { type: 'agentStopped'; sessionId: string }
	| { type: 'toolStart'; sessionId: string; toolId: string; toolName: string; toolStatus: string }
	| { type: 'toolDone'; sessionId: string; toolId: string }
	| { type: 'agentThinking'; sessionId: string }
	| { type: 'agentEmote'; sessionId: string; emoteType: string }
	| { type: 'subtaskStart'; sessionId: string; parentToolId: string; toolId: string; toolName: string; toolStatus: string }
	| { type: 'subtaskDone'; sessionId: string; parentToolId: string; toolId: string }
	| { type: 'subtaskClear'; sessionId: string; parentToolId: string }
	| { type: 'modelDetected'; sessionId: string; model: string }
	| { type: 'turnComplete'; sessionId: string }
	| { type: 'statusChange'; sessionId: string; status: 'waiting' | 'permission' | 'idle' }
	| { type: 'transcript'; sessionId: string; role: 'user' | 'assistant' | 'system'; summary: string };

/** 伺服器向 Agent Node 回傳的訊息（中央 → 遠端） */
export type ServerNodeMessage =
	| { type: 'authenticated'; userId: string }
	| { type: 'error'; message: string }
	| { type: 'agentRegistered'; sessionId: string; agentId: number };
