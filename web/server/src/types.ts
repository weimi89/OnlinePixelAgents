import type { ChildProcess } from 'child_process';

export interface MessageSender {
	postMessage(msg: unknown): void;
}

export interface AgentState {
	id: number;
	process: ChildProcess | null;
	projectDir: string;
	jsonlFile: string;
	fileOffset: number;
	lineBuffer: string;
	activeToolIds: Set<string>;
	activeToolStatuses: Map<string, string>;
	activeToolNames: Map<string, string>;
	activeSubagentToolIds: Map<string, Set<string>>;
	activeSubagentToolNames: Map<string, Map<string, string>>;
	isWaiting: boolean;
	permissionSent: boolean;
	hadToolsInTurn: boolean;
	model: string | null;
	/** tmux session name, or null if running as direct child process */
	tmuxSessionName: string | null;
	/** Whether this agent's tmux session is alive but server just restarted (not yet reattached) */
	isDetached: boolean;
}

export interface PersistedAgent {
	id: number;
	sessionId: string;
	jsonlFile: string;
	projectDir: string;
	palette?: number;
	hueShift?: number;
	seatId?: string;
	tmuxSessionName?: string;
}
