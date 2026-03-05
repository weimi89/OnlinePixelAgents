import type { AgentContext } from './types.js';
import {
	cancelWaitingTimer,
	startWaitingTimer,
	clearAgentActivity,
	startPermissionTimer,
	cancelPermissionTimer,
	restartPermissionTimerOnProgress,
} from './timerManager.js';
import {
	TOOL_DONE_DELAY_MS,
	TEXT_IDLE_DELAY_MS,
	MAX_TRANSCRIPT_LOG,
	MAX_STATUS_HISTORY,
	THINKING_DEPTH_THRESHOLD,
} from './constants.js';

/** Git branch 偵測正則：匹配 'On branch xxx' 或 '* branch-name' 模式 */
const GIT_BRANCH_ON_RE = /On branch\s+(\S+)/;
const GIT_BRANCH_STAR_RE = /^\*\s+(\S+)/m;
import { formatToolStatus, PERMISSION_EXEMPT_TOOLS } from 'pixel-agents-shared';
import { incrementToolCall } from './dashboardStats.js';
import { recordToolCall, recordTurnComplete } from './growthSystem.js';

export { formatToolStatus, PERMISSION_EXEMPT_TOOLS };

/** 追加一筆精簡轉錄記錄到代理的 transcriptLog，並推送至客戶端 */
function appendTranscript(
	agentId: number,
	agent: { transcriptLog: Array<{ ts: number; role: 'user' | 'assistant' | 'system'; summary: string }> },
	role: 'user' | 'assistant' | 'system',
	summary: string,
	sender: import('./types.js').MessageSender | undefined,
): void {
	const entry = { ts: Date.now(), role, summary };
	agent.transcriptLog.push(entry);
	if (agent.transcriptLog.length > MAX_TRANSCRIPT_LOG) {
		agent.transcriptLog.splice(0, agent.transcriptLog.length - MAX_TRANSCRIPT_LOG);
	}
	sender?.postMessage({ type: 'agentTranscript', id: agentId, log: agent.transcriptLog });
}

/** 追加一筆狀態變更記錄到代理的 statusHistory，保留最近 MAX_STATUS_HISTORY 條 */
export function appendStatusHistory(
	agent: { statusHistory: Array<{ ts: number; status: string; detail?: string }> },
	status: string,
	detail?: string,
): void {
	const entry: { ts: number; status: string; detail?: string } = { ts: Date.now(), status };
	if (detail !== undefined) entry.detail = detail;
	agent.statusHistory.push(entry);
	if (agent.statusHistory.length > MAX_STATUS_HISTORY) {
		agent.statusHistory.splice(0, agent.statusHistory.length - MAX_STATUS_HISTORY);
	}
}

/** 解析單行轉錄記錄，根據 CLI 類型分派到對應的解析函式 */
export function processTranscriptLine(
	agentId: number,
	line: string,
	ctx: AgentContext,
): void {
	const { agents } = ctx;
	const agent = agents.get(agentId);
	if (!agent) return;
	try {
		const record = JSON.parse(line);

		// CLI 特定分派
		if (agent.cliType === 'codex') {
			processCodexLine(agentId, record, ctx);
			return;
		}
		if (agent.cliType === 'gemini') {
			processGeminiMessage(agentId, record, ctx);
			return;
		}

		processClaudeLine(agentId, record, ctx);
	} catch {
		// 忽略格式錯誤的行
	}
}

/** 解析 Claude JSONL 轉錄記錄 */
function processClaudeLine(
	agentId: number,
	record: Record<string, unknown>,
	ctx: AgentContext,
): void {
	const { agents, waitingTimers, permissionTimers, progressExtensions } = ctx;
	const agent = agents.get(agentId);
	if (!agent) return;
	const sender = ctx.floorSender(agent.floorId);
		const msg = record.message as Record<string, unknown> | undefined;

		if (record.type === 'assistant' && Array.isArray(msg?.content)) {
			// 從助手記錄中提取模型名稱
			const model = msg?.model as string | undefined;
			if (model && agent.model !== model) {
				agent.model = model;
				sender?.postMessage({ type: 'agentModel', id: agentId, model });
			}

			const blocks = msg.content as Array<{
				type: string; id?: string; name?: string; input?: Record<string, unknown>;
			}>;

			// 偵測 thinking 區塊
			const thinkingBlocks = blocks.filter(b => b.type === 'thinking');
			if (thinkingBlocks.length > 0) {
				sender?.postMessage({ type: 'agentThinking', id: agentId, thinking: true });
				// 深度思考：計算 thinking 文字總長度，超過閾值觸發 idea 表情
				const thinkingLength = thinkingBlocks.reduce((sum, b) => {
					const text = (b as Record<string, unknown>).thinking as string | undefined;
					return sum + (text?.length ?? 0);
				}, 0);
				if (thinkingLength > THINKING_DEPTH_THRESHOLD) {
					sender?.postMessage({ type: 'agentEmote', id: agentId, emote: 'idea' });
				}
			}
			const hasThinking = thinkingBlocks.length > 0;

			// 偵測 image 區塊 → 相機表情
			const hasImage = blocks.some(b => b.type === 'image');
			if (hasImage) {
				sender?.postMessage({ type: 'agentEmote', id: agentId, emote: 'camera' });
			}

			const hasToolUse = blocks.some(b => b.type === 'tool_use');

			if (hasToolUse) {
				cancelWaitingTimer(agentId, waitingTimers);
				agent.isWaiting = false;
				agent.hadToolsInTurn = true;
				// 工具使用開始時清除思考狀態
				sender?.postMessage({ type: 'agentThinking', id: agentId, thinking: false });
				sender?.postMessage({ type: 'agentStatus', id: agentId, status: 'active' });
				appendStatusHistory(agent, 'active', 'tool_use');
				let hasNonExemptTool = false;
				for (const block of blocks) {
					if (block.type === 'tool_use' && block.id) {
						const toolName = block.name || '';
						const status = formatToolStatus(toolName, block.input || {});
						console.log(`[Pixel Agents] Agent ${agentId} tool start: ${block.id} ${status}`);
						agent.activeToolIds.add(block.id);
						agent.activeToolStatuses.set(block.id, status);
						agent.activeToolNames.set(block.id, toolName);
						if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
							hasNonExemptTool = true;
						}
						sender?.postMessage({
							type: 'agentToolStart',
							id: agentId,
							toolId: block.id,
							status,
						});
					}
				}
				if (hasNonExemptTool) {
					progressExtensions.delete(agentId); // 新工具開始，重設進度延長計數
					startPermissionTimer(agentId, agents, permissionTimers, PERMISSION_EXEMPT_TOOLS, sender);
				}
				// 成長系統：記錄每個工具呼叫
				for (const block of blocks) {
					if (block.type === "tool_use" && block.id) {
						recordToolCall(agentId, agent, block.name || "", sender);
					}
				}
				// 轉錄：記錄工具呼叫
				const lastStatus = agent.activeToolStatuses.size > 0 ? [...agent.activeToolStatuses.values()].pop()! : 'Using tools';
				appendTranscript(agentId, agent, 'assistant', lastStatus, sender);
			} else if (hasThinking) {
				appendStatusHistory(agent, 'thinking');
				appendTranscript(agentId, agent, 'assistant', '[thinking]', sender);
			} else if (blocks.some(b => b.type === 'text') && !agent.hadToolsInTurn) {
				startWaitingTimer(agentId, TEXT_IDLE_DELAY_MS, agents, waitingTimers, sender);
				appendTranscript(agentId, agent, 'assistant', 'Responding...', sender);
			}
		} else if (record.type === 'progress') {
			processProgressRecord(agentId, record, ctx);
		} else if (record.type === 'user') {
			const content = msg?.content;
			if (Array.isArray(content)) {
				const blocks = content as Array<{ type: string; tool_use_id?: string }>;
				const hasToolResult = blocks.some(b => b.type === 'tool_result');
				if (hasToolResult) {
					for (const block of blocks) {
						if (block.type === 'tool_result' && block.tool_use_id) {
							console.log(`[Pixel Agents] Agent ${agentId} tool done: ${block.tool_use_id}`);
							const completedToolId = block.tool_use_id as string;
							// Git branch 偵測：從 Bash tool_result 的輸出中搜尋
							const completedName = agent.activeToolNames.get(completedToolId);
							if (completedName === 'Bash') {
								const resultContent = (block as Record<string, unknown>).content;
								const text = typeof resultContent === 'string'
									? resultContent
									: Array.isArray(resultContent)
										? (resultContent as Array<{ text?: string }>).map(c => c.text || '').join('')
										: '';
								if (text) {
									const m1 = GIT_BRANCH_ON_RE.exec(text);
									const m2 = !m1 ? GIT_BRANCH_STAR_RE.exec(text) : null;
									const branch = m1?.[1] || m2?.[1];
									if (branch && branch !== agent.gitBranch) {
										agent.gitBranch = branch;
										sender?.postMessage({ type: 'agentGitBranch', id: agentId, branch });
									}
								}
							}
							if (agent.activeToolNames.get(completedToolId) === 'Task') {
								agent.activeSubagentToolIds.delete(completedToolId);
								agent.activeSubagentToolNames.delete(completedToolId);
								sender?.postMessage({
									type: 'subagentClear',
									id: agentId,
									parentToolId: completedToolId,
								});
							}
							const completedToolName = agent.activeToolNames.get(completedToolId);
							if (completedToolName) {
								incrementToolCall(completedToolName);
								appendStatusHistory(agent, 'tool_done', completedToolName);
							}
							agent.activeToolIds.delete(completedToolId);
							agent.activeToolStatuses.delete(completedToolId);
							agent.activeToolNames.delete(completedToolId);
							const toolId = completedToolId;
							setTimeout(() => {
								sender?.postMessage({
									type: 'agentToolDone',
									id: agentId,
									toolId,
								});
							}, TOOL_DONE_DELAY_MS);
						}
					}
					if (agent.activeToolIds.size === 0) {
						agent.hadToolsInTurn = false;
					}
					appendTranscript(agentId, agent, 'user', `Result: ${blocks.filter(b => b.type === 'tool_result').map(b => (b.tool_use_id || '').slice(0, 8)).join(', ')}`, sender);
				} else {
					cancelWaitingTimer(agentId, waitingTimers);
					clearAgentActivity(agent, agentId, permissionTimers, sender, progressExtensions);
					agent.hadToolsInTurn = false;
				}
			} else if (typeof content === 'string' && content.trim()) {
				cancelWaitingTimer(agentId, waitingTimers);
				clearAgentActivity(agent, agentId, permissionTimers, sender, progressExtensions);
				agent.hadToolsInTurn = false;
				appendStatusHistory(agent, 'user_prompt');
				const trimmed = content.trim();
				appendTranscript(agentId, agent, 'user', trimmed.length > 60 ? trimmed.slice(0, 60) + '\u2026' : trimmed, sender);
			}
		} else if (record.type === 'system' && record.subtype === 'compact_boundary') {
			sender?.postMessage({ type: 'agentEmote', id: agentId, emote: 'compress' });
			appendStatusHistory(agent, 'compact');
			appendTranscript(agentId, agent, 'system', 'Context compacted', sender);
		} else if (record.type === 'system' && record.subtype === 'turn_duration') {
			cancelWaitingTimer(agentId, waitingTimers);
			cancelPermissionTimer(agentId, permissionTimers);
			// 回合結束時清除思考狀態
			sender?.postMessage({ type: 'agentThinking', id: agentId, thinking: false });

			if (agent.activeToolIds.size > 0) {
				agent.activeToolIds.clear();
				agent.activeToolStatuses.clear();
				agent.activeToolNames.clear();
				agent.activeSubagentToolIds.clear();
				agent.activeSubagentToolNames.clear();
				sender?.postMessage({ type: 'agentToolsClear', id: agentId });
			}

			agent.isWaiting = true;
			agent.permissionSent = false;
			agent.hadToolsInTurn = false;
			sender?.postMessage({
				type: 'agentStatus',
				id: agentId,
				status: 'waiting',
			});
			recordTurnComplete(agentId, agent, sender);
			appendStatusHistory(agent, 'waiting', 'turn_complete');
			appendTranscript(agentId, agent, 'system', 'Turn complete', sender);
		}
}

/** 處理 progress 類型記錄（子代理工具啟動/完成、bash/mcp 進度） */
function processProgressRecord(
	agentId: number,
	record: Record<string, unknown>,
	ctx: AgentContext,
): void {
	const { agents, permissionTimers, progressExtensions } = ctx;
	const agent = agents.get(agentId);
	if (!agent) return;
	const sender = ctx.floorSender(agent.floorId);

	const parentToolId = record.parentToolUseID as string | undefined;
	if (!parentToolId) return;

	const data = record.data as Record<string, unknown> | undefined;
	if (!data) return;

	const dataType = data.type as string | undefined;
	if (dataType === 'waiting_for_task') {
		sender?.postMessage({ type: 'agentEmote', id: agentId, emote: 'eye' });
		return;
	}
	if (dataType === 'bash_progress' || dataType === 'mcp_progress') {
		if (agent.activeToolIds.has(parentToolId)) {
			restartPermissionTimerOnProgress(agentId, agents, permissionTimers, PERMISSION_EXEMPT_TOOLS, sender, progressExtensions);
		}
		return;
	}

	if (agent.activeToolNames.get(parentToolId) !== 'Task') return;

	const msg = data.message as Record<string, unknown> | undefined;
	if (!msg) return;

	const msgType = msg.type as string;
	const innerMsg = msg.message as Record<string, unknown> | undefined;
	const content = innerMsg?.content;
	if (!Array.isArray(content)) return;

	if (msgType === 'assistant') {
		let hasNonExemptSubTool = false;
		for (const block of content) {
			if (block.type === 'tool_use' && block.id) {
				const toolName = block.name || '';
				const status = formatToolStatus(toolName, block.input || {});
				console.log(`[Pixel Agents] Agent ${agentId} subagent tool start: ${block.id} ${status} (parent: ${parentToolId})`);

				let subTools = agent.activeSubagentToolIds.get(parentToolId);
				if (!subTools) {
					subTools = new Set();
					agent.activeSubagentToolIds.set(parentToolId, subTools);
				}
				subTools.add(block.id);

				let subNames = agent.activeSubagentToolNames.get(parentToolId);
				if (!subNames) {
					subNames = new Map();
					agent.activeSubagentToolNames.set(parentToolId, subNames);
				}
				subNames.set(block.id, toolName);

				if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
					hasNonExemptSubTool = true;
				}

				sender?.postMessage({
					type: 'subagentToolStart',
					id: agentId,
					parentToolId,
					toolId: block.id,
					status,
				});
			}
		}
		if (hasNonExemptSubTool) {
			progressExtensions.delete(agentId); // 子代理新工具開始，重設進度延長計數
			startPermissionTimer(agentId, agents, permissionTimers, PERMISSION_EXEMPT_TOOLS, sender);
		}
	} else if (msgType === 'user') {
		for (const block of content) {
			if (block.type === 'tool_result' && block.tool_use_id) {
				console.log(`[Pixel Agents] Agent ${agentId} subagent tool done: ${block.tool_use_id} (parent: ${parentToolId})`);

				const subTools = agent.activeSubagentToolIds.get(parentToolId);
				if (subTools) {
					subTools.delete(block.tool_use_id);
				}
				const subNames = agent.activeSubagentToolNames.get(parentToolId);
				if (subNames) {
					subNames.delete(block.tool_use_id);
				}

				const toolId = block.tool_use_id;
				setTimeout(() => {
					sender?.postMessage({
						type: 'subagentToolDone',
						id: agentId,
						parentToolId,
						toolId,
					});
				}, TOOL_DONE_DELAY_MS);
			}
		}
		let stillHasNonExempt = false;
		for (const [, subNames] of agent.activeSubagentToolNames) {
			for (const [, toolName] of subNames) {
				if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
					stillHasNonExempt = true;
					break;
				}
			}
			if (stillHasNonExempt) break;
		}
		if (stillHasNonExempt) {
			startPermissionTimer(agentId, agents, permissionTimers, PERMISSION_EXEMPT_TOOLS, sender);
		}
	}
}

// ── Codex 解析器 ─────────────────────────────────────────────

/** 解析 Codex JSONL 記錄，映射至標準代理事件 */
function processCodexLine(
	agentId: number,
	record: Record<string, unknown>,
	ctx: AgentContext,
): void {
	const { agents, waitingTimers, permissionTimers, progressExtensions } = ctx;
	const agent = agents.get(agentId);
	if (!agent) return;
	const sender = ctx.floorSender(agent.floorId);

	const recordType = record.type as string;
	const payload = record.payload as Record<string, unknown> | undefined;
	if (!payload) return;

	const payloadType = payload.type as string | undefined;

	// 模型偵測：從 turn_context 中提取
	if (recordType === 'turn_context') {
		const model = payload.model as string | undefined;
		if (model && agent.model !== model) {
			agent.model = model;
			sender?.postMessage({ type: 'agentModel', id: agentId, model });
		}
		return;
	}

	// 也從 session_meta 取得模型資訊
	if (recordType === 'session_meta') {
		const model = payload.model_provider as string | undefined;
		if (model && !agent.model) {
			agent.model = model;
			sender?.postMessage({ type: 'agentModel', id: agentId, model });
		}
		return;
	}

	// 工具呼叫：function_call
	if (recordType === 'response_item' && payloadType === 'function_call') {
		const toolName = payload.name as string || '';
		const callId = payload.call_id as string || '';
		if (!callId) return;

		cancelWaitingTimer(agentId, waitingTimers);
		agent.isWaiting = false;
		agent.hadToolsInTurn = true;
		sender?.postMessage({ type: 'agentThinking', id: agentId, thinking: false });
		sender?.postMessage({ type: 'agentStatus', id: agentId, status: 'active' });
		appendStatusHistory(agent, 'active', 'tool_use');

		// 解析 arguments（Codex 用 JSON 字串）
		let toolInput: Record<string, unknown> = {};
		if (typeof payload.arguments === 'string') {
			try { toolInput = JSON.parse(payload.arguments as string); } catch { /* 忽略 */ }
		} else if (typeof payload.arguments === 'object' && payload.arguments) {
			toolInput = payload.arguments as Record<string, unknown>;
		}

		const status = formatToolStatus(toolName, toolInput);
		console.log(`[Pixel Agents] Agent ${agentId} (codex) tool start: ${callId} ${status}`);
		agent.activeToolIds.add(callId);
		agent.activeToolStatuses.set(callId, status);
		agent.activeToolNames.set(callId, toolName);

		if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
			progressExtensions.delete(agentId);
			startPermissionTimer(agentId, agents, permissionTimers, PERMISSION_EXEMPT_TOOLS, sender);
		}

		sender?.postMessage({ type: 'agentToolStart', id: agentId, toolId: callId, status });
		recordToolCall(agentId, agent, toolName, sender);
		appendTranscript(agentId, agent, 'assistant', status, sender);
		return;
	}

	// 工具結果：function_call_output
	if (recordType === 'response_item' && payloadType === 'function_call_output') {
		const callId = payload.call_id as string || '';
		if (!callId || !agent.activeToolIds.has(callId)) return;

		console.log(`[Pixel Agents] Agent ${agentId} (codex) tool done: ${callId}`);
		const completedName = agent.activeToolNames.get(callId);
		if (completedName) {
			incrementToolCall(completedName);
			appendStatusHistory(agent, 'tool_done', completedName);
		}
		agent.activeToolIds.delete(callId);
		agent.activeToolStatuses.delete(callId);
		agent.activeToolNames.delete(callId);

		const toolId = callId;
		setTimeout(() => {
			sender?.postMessage({ type: 'agentToolDone', id: agentId, toolId });
		}, TOOL_DONE_DELAY_MS);

		if (agent.activeToolIds.size === 0) {
			agent.hadToolsInTurn = false;
		}
		return;
	}

	// 推理（thinking）
	if (recordType === 'response_item' && payloadType === 'reasoning') {
		sender?.postMessage({ type: 'agentThinking', id: agentId, thinking: true });
		appendStatusHistory(agent, 'thinking');
		appendTranscript(agentId, agent, 'assistant', '[thinking]', sender);
		return;
	}

	// 使用者訊息（新回合開始）
	if (recordType === 'event_msg' && payloadType === 'user_message') {
		cancelWaitingTimer(agentId, waitingTimers);
		clearAgentActivity(agent, agentId, permissionTimers, sender, progressExtensions);
		agent.hadToolsInTurn = false;
		appendStatusHistory(agent, 'user_prompt');
		return;
	}

	// 任務完成（回合結束）
	if (recordType === 'event_msg' && payloadType === 'task_complete') {
		cancelWaitingTimer(agentId, waitingTimers);
		cancelPermissionTimer(agentId, permissionTimers);
		sender?.postMessage({ type: 'agentThinking', id: agentId, thinking: false });

		if (agent.activeToolIds.size > 0) {
			agent.activeToolIds.clear();
			agent.activeToolStatuses.clear();
			agent.activeToolNames.clear();
			sender?.postMessage({ type: 'agentToolsClear', id: agentId });
		}

		agent.isWaiting = true;
		agent.permissionSent = false;
		agent.hadToolsInTurn = false;
		sender?.postMessage({ type: 'agentStatus', id: agentId, status: 'waiting' });
		recordTurnComplete(agentId, agent, sender);
		appendStatusHistory(agent, 'waiting', 'turn_complete');
		appendTranscript(agentId, agent, 'system', 'Turn complete', sender);
		return;
	}
}

// ── Gemini 解析器 ────────────────────────────────────────────

/** 解析 Gemini JSON 會話訊息，映射至標準代理事件 */
function processGeminiMessage(
	agentId: number,
	record: Record<string, unknown>,
	ctx: AgentContext,
): void {
	const { agents, waitingTimers, permissionTimers, progressExtensions } = ctx;
	const agent = agents.get(agentId);
	if (!agent) return;
	const sender = ctx.floorSender(agent.floorId);

	const msgType = record.type as string;

	// Gemini 回覆
	if (msgType === 'gemini') {
		const model = record.model as string | undefined;
		if (model && agent.model !== model) {
			agent.model = model;
			sender?.postMessage({ type: 'agentModel', id: agentId, model });
		}

		// 先清除前一輪的活躍 toolCalls（Gemini 沒有明確的 tool_result）
		if (agent.activeToolIds.size > 0) {
			for (const toolId of agent.activeToolIds) {
				const completedName = agent.activeToolNames.get(toolId);
				if (completedName) {
					incrementToolCall(completedName);
					appendStatusHistory(agent, 'tool_done', completedName);
				}
				sender?.postMessage({ type: 'agentToolDone', id: agentId, toolId });
			}
			agent.activeToolIds.clear();
			agent.activeToolStatuses.clear();
			agent.activeToolNames.clear();
		}

		// 處理 thoughts（thinking）
		const thoughts = record.thoughts as Array<Record<string, unknown>> | undefined;
		if (thoughts && thoughts.length > 0) {
			sender?.postMessage({ type: 'agentThinking', id: agentId, thinking: true });
			const totalLength = thoughts.reduce((sum, t) => {
				const desc = t.description as string | undefined;
				return sum + (desc?.length ?? 0);
			}, 0);
			if (totalLength > THINKING_DEPTH_THRESHOLD) {
				sender?.postMessage({ type: 'agentEmote', id: agentId, emote: 'idea' });
			}
		}

		// 處理 toolCalls
		const toolCalls = record.toolCalls as Array<Record<string, unknown>> | undefined;
		if (toolCalls && toolCalls.length > 0) {
			cancelWaitingTimer(agentId, waitingTimers);
			agent.isWaiting = false;
			agent.hadToolsInTurn = true;
			sender?.postMessage({ type: 'agentThinking', id: agentId, thinking: false });
			sender?.postMessage({ type: 'agentStatus', id: agentId, status: 'active' });
			appendStatusHistory(agent, 'active', 'tool_use');

			let hasNonExempt = false;
			for (const tc of toolCalls) {
				const toolName = tc.name as string || '';
				const callId = tc.id as string || `gemini_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
				const toolInput = (tc.args || {}) as Record<string, unknown>;

				const status = formatToolStatus(toolName, toolInput);
				console.log(`[Pixel Agents] Agent ${agentId} (gemini) tool start: ${callId} ${status}`);
				agent.activeToolIds.add(callId);
				agent.activeToolStatuses.set(callId, status);
				agent.activeToolNames.set(callId, toolName);

				if (!PERMISSION_EXEMPT_TOOLS.has(toolName)) {
					hasNonExempt = true;
				}

				sender?.postMessage({ type: 'agentToolStart', id: agentId, toolId: callId, status });
				recordToolCall(agentId, agent, toolName, sender);
			}

			if (hasNonExempt) {
				progressExtensions.delete(agentId);
				startPermissionTimer(agentId, agents, permissionTimers, PERMISSION_EXEMPT_TOOLS, sender);
			}

			const lastStatus = [...agent.activeToolStatuses.values()].pop() || 'Using tools';
			appendTranscript(agentId, agent, 'assistant', lastStatus, sender);
		} else {
			// 無 toolCalls — 純文字回覆，代表回合可能結束
			sender?.postMessage({ type: 'agentThinking', id: agentId, thinking: false });
			const content = record.content as string | undefined;
			if (content) {
				agent.isWaiting = true;
				agent.hadToolsInTurn = false;
				sender?.postMessage({ type: 'agentStatus', id: agentId, status: 'waiting' });
				recordTurnComplete(agentId, agent, sender);
				appendStatusHistory(agent, 'waiting', 'turn_complete');
				const trimmed = content.trim();
				appendTranscript(agentId, agent, 'assistant', trimmed.length > 60 ? trimmed.slice(0, 60) + '\u2026' : trimmed, sender);
			}
		}
		return;
	}

	// 使用者訊息
	if (msgType === 'user') {
		cancelWaitingTimer(agentId, waitingTimers);
		clearAgentActivity(agent, agentId, permissionTimers, sender, progressExtensions);
		agent.hadToolsInTurn = false;
		appendStatusHistory(agent, 'user_prompt');

		const contentArr = record.content as Array<Record<string, unknown>> | undefined;
		if (contentArr && contentArr.length > 0) {
			const text = contentArr.map(c => (c.text as string) || '').join(' ').trim();
			if (text) {
				appendTranscript(agentId, agent, 'user', text.length > 60 ? text.slice(0, 60) + '\u2026' : text, sender);
			}
		}
		return;
	}

	// 錯誤訊息
	if (msgType === 'error') {
		appendStatusHistory(agent, 'error');
		return;
	}
}
