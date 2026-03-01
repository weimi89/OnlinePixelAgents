import * as path from 'path';

/** 顯示截斷長度 — Bash 指令 */
export const BASH_COMMAND_DISPLAY_MAX_LENGTH = 30;
/** 顯示截斷長度 — 子任務描述 */
export const TASK_DESCRIPTION_DISPLAY_MAX_LENGTH = 40;

/** 工具權限豁免清單 — 這些工具不會觸發權限等待偵測 */
export const PERMISSION_EXEMPT_TOOLS = new Set(['Task', 'AskUserQuestion']);

/** 依照工具名稱與輸入參數，格式化可讀的工具狀態文字 */
export function formatToolStatus(toolName: string, input: Record<string, unknown>): string {
	const base = (p: unknown) => typeof p === 'string' ? path.basename(p) : '';
	switch (toolName) {
		case 'Read': return `Reading ${base(input.file_path)}`;
		case 'Edit': return `Editing ${base(input.file_path)}`;
		case 'Write': return `Writing ${base(input.file_path)}`;
		case 'Bash': {
			const cmd = (input.command as string) || '';
			return `Running: ${cmd.length > BASH_COMMAND_DISPLAY_MAX_LENGTH ? cmd.slice(0, BASH_COMMAND_DISPLAY_MAX_LENGTH) + '\u2026' : cmd}`;
		}
		case 'Glob': return 'Searching files';
		case 'Grep': return 'Searching code';
		case 'WebFetch': return 'Fetching web content';
		case 'WebSearch': return 'Searching the web';
		case 'Task': {
			const desc = typeof input.description === 'string' ? input.description : '';
			const agentType = typeof input.subagent_type === 'string' ? input.subagent_type : '';
			const typeTag = agentType ? `[${agentType}] ` : '';
			return desc ? `Subtask: ${typeTag}${desc.length > TASK_DESCRIPTION_DISPLAY_MAX_LENGTH ? desc.slice(0, TASK_DESCRIPTION_DISPLAY_MAX_LENGTH) + '\u2026' : desc}` : 'Running subtask';
		}
		case 'AskUserQuestion': return 'Waiting for your answer';
		case 'EnterPlanMode': return 'Planning';
		case 'NotebookEdit': return `Editing notebook`;
		default: return `Using ${toolName}`;
	}
}
