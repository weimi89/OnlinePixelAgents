import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, execSync } from 'child_process';
import type { AgentState, PersistedAgent, MessageSender } from './types.js';
import { cancelWaitingTimer, cancelPermissionTimer } from './timerManager.js';
import { startFileWatching, readNewLines } from './fileWatcher.js';
import { JSONL_POLL_INTERVAL_MS, LAYOUT_FILE_DIR, AGENTS_FILE_NAME } from './constants.js';
import {
	isTmuxAvailable,
	tmuxSessionName as buildTmuxName,
	createTmuxSession,
	killTmuxSession,
	isTmuxSessionAlive,
	listPixelAgentSessions,
	parseSessionUuid,
} from './tmuxManager.js';

// Resolve full path to claude binary at startup
const CLAUDE_BIN = (() => {
	try {
		return execSync('which claude', { encoding: 'utf-8' }).trim();
	} catch {
		return 'claude'; // fallback
	}
})();

export function getProjectDirPath(cwd: string): string {
	const dirName = cwd.replace(/[^a-zA-Z0-9-]/g, '-');
	return path.join(os.homedir(), '.claude', 'projects', dirName);
}

export function getAllProjectDirs(): string[] {
	const projectsRoot = path.join(os.homedir(), '.claude', 'projects');
	try {
		const entries = fs.readdirSync(projectsRoot, { withFileTypes: true });
		return entries
			.filter(e => e.isDirectory())
			.map(e => path.join(projectsRoot, e.name));
	} catch {
		return [];
	}
}

// ── Persistence ─────────────────────────────────────────────

function getAgentsFilePath(): string {
	return path.join(os.homedir(), LAYOUT_FILE_DIR, AGENTS_FILE_NAME);
}

export function savePersistedAgents(agents: Map<number, AgentState>): void {
	const data: PersistedAgent[] = [];
	for (const agent of agents.values()) {
		// Extract session ID from JSONL filename
		const sessionId = path.basename(agent.jsonlFile, '.jsonl');
		data.push({
			id: agent.id,
			sessionId,
			jsonlFile: agent.jsonlFile,
			projectDir: agent.projectDir,
			tmuxSessionName: agent.tmuxSessionName ?? undefined,
		});
	}
	try {
		const filePath = getAgentsFilePath();
		const dir = path.dirname(filePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
	} catch (err) {
		console.error('[Pixel Agents] Failed to persist agents:', err);
	}
}

export function loadPersistedAgents(): PersistedAgent[] {
	try {
		const filePath = getAgentsFilePath();
		if (!fs.existsSync(filePath)) return [];
		return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as PersistedAgent[];
	} catch {
		return [];
	}
}

// ── Helper: build a clean env without CLAUDE* vars ──────────

function buildCleanEnv(): Record<string, string | undefined> {
	const cleanEnv = { ...process.env };
	for (const key of Object.keys(cleanEnv)) {
		if (key.startsWith('CLAUDE')) {
			delete cleanEnv[key];
		}
	}
	return cleanEnv;
}

// ── Helper: create agent state and start file polling ───────

function createAgentState(
	id: number,
	expectedFile: string,
	projectDir: string,
	tmuxName: string | null,
	isDetached: boolean,
): AgentState {
	let fileOffset = 0;
	try {
		if (fs.existsSync(expectedFile)) {
			fileOffset = fs.statSync(expectedFile).size;
		}
	} catch { /* ignore */ }

	return {
		id,
		process: null,
		projectDir,
		jsonlFile: expectedFile,
		fileOffset,
		lineBuffer: '',
		activeToolIds: new Set(),
		activeToolStatuses: new Map(),
		activeToolNames: new Map(),
		activeSubagentToolIds: new Map(),
		activeSubagentToolNames: new Map(),
		isWaiting: false,
		permissionSent: false,
		hadToolsInTurn: false,
		model: null,
		tmuxSessionName: tmuxName,
		isDetached,
	};
}

// ── Shared spawn logic ──────────────────────────────────────

function spawnClaudeAgent(
	args: string[],
	cwd: string,
	expectedFile: string,
	label: string,
	sessionUuid: string,
	nextAgentIdRef: { current: number },
	agents: Map<number, AgentState>,
	activeAgentIdRef: { current: number | null },
	knownJsonlFiles: Set<string>,
	fileWatchers: Map<number, fs.FSWatcher>,
	pollingTimers: Map<number, ReturnType<typeof setInterval>>,
	waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
	permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
	jsonlPollTimers: Map<number, ReturnType<typeof setInterval>>,
	sender: MessageSender | undefined,
	persistAgents: () => void,
): void {
	const projectDir = path.dirname(expectedFile);
	knownJsonlFiles.add(expectedFile);

	const cleanEnv = buildCleanEnv();
	const id = nextAgentIdRef.current++;

	const useTmux = isTmuxAvailable();
	let tmuxName: string | null = null;

	if (useTmux) {
		// Spawn inside tmux for persistence
		tmuxName = buildTmuxName(sessionUuid);
		console.log(`[Pixel Agents] Using tmux session: ${tmuxName}`);
		createTmuxSession(tmuxName, CLAUDE_BIN, args, cwd, cleanEnv);
	} else {
		console.log(`[Pixel Agents] tmux not available, using direct spawn`);
	}

	const agent = createAgentState(id, expectedFile, projectDir, tmuxName, false);

	if (!useTmux) {
		// Direct spawn — track the process
		console.log(`[Pixel Agents] Using claude binary: ${CLAUDE_BIN}`);
		const proc = spawn(CLAUDE_BIN, args, {
			cwd,
			stdio: ['pipe', 'pipe', 'pipe'],
			env: cleanEnv,
		});

		proc.stdout?.on('data', (data: Buffer) => {
			const text = data.toString().replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
			if (text) console.log(`[Pixel Agents] Agent stdout: ${text.slice(0, 200)}`);
		});
		proc.stderr?.on('data', (data: Buffer) => {
			const text = data.toString().replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
			if (text) console.log(`[Pixel Agents] Agent stderr: ${text.slice(0, 200)}`);
		});

		agent.process = proc;

		proc.on('exit', (code) => {
			console.log(`[Pixel Agents] Agent ${id}: process exited with code ${code}`);
			removeAgent(
				id, agents,
				fileWatchers, pollingTimers, waitingTimers, permissionTimers,
				jsonlPollTimers, knownJsonlFiles, persistAgents,
			);
			sender?.postMessage({ type: 'agentClosed', id });
		});
	}

	agents.set(id, agent);
	activeAgentIdRef.current = id;
	persistAgents();
	console.log(`[Pixel Agents] Agent ${id}: ${label}`);
	sender?.postMessage({ type: 'agentCreated', id });

	const pollTimer = setInterval(() => {
		try {
			if (fs.existsSync(agent.jsonlFile)) {
				console.log(`[Pixel Agents] Agent ${id}: found JSONL file ${path.basename(agent.jsonlFile)}`);
				clearInterval(pollTimer);
				jsonlPollTimers.delete(id);
				startFileWatching(id, agent.jsonlFile, agents, fileWatchers, pollingTimers, waitingTimers, permissionTimers, sender);
				readNewLines(id, agents, waitingTimers, permissionTimers, sender);
			}
		} catch { /* file may not exist yet */ }
	}, JSONL_POLL_INTERVAL_MS);
	jsonlPollTimers.set(id, pollTimer);
}

export function launchNewAgent(
	cwd: string,
	nextAgentIdRef: { current: number },
	agents: Map<number, AgentState>,
	activeAgentIdRef: { current: number | null },
	knownJsonlFiles: Set<string>,
	fileWatchers: Map<number, fs.FSWatcher>,
	pollingTimers: Map<number, ReturnType<typeof setInterval>>,
	waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
	permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
	jsonlPollTimers: Map<number, ReturnType<typeof setInterval>>,
	sender: MessageSender | undefined,
	persistAgents: () => void,
): void {
	const sessionId = crypto.randomUUID();
	const projectDir = getProjectDirPath(cwd);
	const expectedFile = path.join(projectDir, `${sessionId}.jsonl`);

	spawnClaudeAgent(
		['--session-id', sessionId], cwd, expectedFile,
		`spawned claude --session-id ${sessionId}`,
		sessionId,
		nextAgentIdRef, agents, activeAgentIdRef, knownJsonlFiles,
		fileWatchers, pollingTimers, waitingTimers, permissionTimers,
		jsonlPollTimers, sender, persistAgents,
	);
}

export function resumeSession(
	sessionId: string,
	sessionProjectDir: string,
	cwd: string,
	nextAgentIdRef: { current: number },
	agents: Map<number, AgentState>,
	activeAgentIdRef: { current: number | null },
	knownJsonlFiles: Set<string>,
	fileWatchers: Map<number, fs.FSWatcher>,
	pollingTimers: Map<number, ReturnType<typeof setInterval>>,
	waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
	permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
	jsonlPollTimers: Map<number, ReturnType<typeof setInterval>>,
	sender: MessageSender | undefined,
	persistAgents: () => void,
): void {
	const expectedFile = path.join(sessionProjectDir, `${sessionId}.jsonl`);

	spawnClaudeAgent(
		['--resume', sessionId], cwd, expectedFile,
		`resumed session ${sessionId}`,
		sessionId,
		nextAgentIdRef, agents, activeAgentIdRef, knownJsonlFiles,
		fileWatchers, pollingTimers, waitingTimers, permissionTimers,
		jsonlPollTimers, sender, persistAgents,
	);
}

export function removeAgent(
	agentId: number,
	agents: Map<number, AgentState>,
	fileWatchers: Map<number, fs.FSWatcher>,
	pollingTimers: Map<number, ReturnType<typeof setInterval>>,
	waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
	permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
	jsonlPollTimers: Map<number, ReturnType<typeof setInterval>>,
	knownJsonlFiles: Set<string>,
	persistAgents: () => void,
): void {
	const agent = agents.get(agentId);
	if (!agent) return;

	// Allow re-adoption if this session becomes active again
	knownJsonlFiles.delete(agent.jsonlFile);

	const jpTimer = jsonlPollTimers.get(agentId);
	if (jpTimer) { clearInterval(jpTimer); }
	jsonlPollTimers.delete(agentId);

	fileWatchers.get(agentId)?.close();
	fileWatchers.delete(agentId);
	const pt = pollingTimers.get(agentId);
	if (pt) { clearInterval(pt); }
	pollingTimers.delete(agentId);

	cancelWaitingTimer(agentId, waitingTimers);
	cancelPermissionTimer(agentId, permissionTimers);

	agents.delete(agentId);
	persistAgents();
}

export function closeAgent(
	agentId: number,
	agents: Map<number, AgentState>,
	fileWatchers: Map<number, fs.FSWatcher>,
	pollingTimers: Map<number, ReturnType<typeof setInterval>>,
	waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
	permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
	jsonlPollTimers: Map<number, ReturnType<typeof setInterval>>,
	knownJsonlFiles: Set<string>,
	sender: MessageSender | undefined,
	persistAgents: () => void,
): void {
	const agent = agents.get(agentId);
	if (!agent) return;

	// Kill the tmux session if present
	if (agent.tmuxSessionName) {
		killTmuxSession(agent.tmuxSessionName);
	}

	// Kill the direct process if present
	if (agent.process && !agent.process.killed) {
		agent.process.kill('SIGTERM');
	}

	removeAgent(agentId, agents, fileWatchers, pollingTimers, waitingTimers, permissionTimers, jsonlPollTimers, knownJsonlFiles, persistAgents);
	sender?.postMessage({ type: 'agentClosed', id: agentId });
}

// ── tmux recovery on server restart ─────────────────────────

export function recoverTmuxAgents(
	nextAgentIdRef: { current: number },
	agents: Map<number, AgentState>,
	knownJsonlFiles: Set<string>,
	fileWatchers: Map<number, fs.FSWatcher>,
	pollingTimers: Map<number, ReturnType<typeof setInterval>>,
	waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
	permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
	sender: MessageSender | undefined,
	persistAgents: () => void,
): number {
	if (!isTmuxAvailable()) return 0;

	// Find all live pixel-agents tmux sessions
	const liveSessions = listPixelAgentSessions();
	if (liveSessions.length === 0) return 0;

	// Load persisted agent data to match tmux sessions with JSONL files
	const persisted = loadPersistedAgents();
	const persistedMap = new Map<string, PersistedAgent>();
	for (const p of persisted) {
		if (p.tmuxSessionName) {
			persistedMap.set(p.tmuxSessionName, p);
		}
	}

	let recovered = 0;
	for (const sessionName of liveSessions) {
		// Try to find this session in persisted data
		let jsonlFile: string | null = null;
		let projectDir: string | null = null;

		const match = persistedMap.get(sessionName);
		if (match) {
			jsonlFile = match.jsonlFile;
			projectDir = match.projectDir;
		} else {
			// Fallback: try to find JSONL by UUID extracted from session name
			const uuid = parseSessionUuid(sessionName);
			if (uuid) {
				const allDirs = getAllProjectDirs();
				for (const dir of allDirs) {
					const candidate = path.join(dir, `${uuid}.jsonl`);
					if (fs.existsSync(candidate)) {
						jsonlFile = candidate;
						projectDir = dir;
						break;
					}
				}
			}
		}

		if (!jsonlFile || !projectDir) {
			console.log(`[Pixel Agents] tmux session ${sessionName}: no matching JSONL found, skipping`);
			continue;
		}

		// Skip if already adopted
		if (knownJsonlFiles.has(jsonlFile)) continue;
		knownJsonlFiles.add(jsonlFile);

		const id = nextAgentIdRef.current++;
		const agent = createAgentState(id, jsonlFile, projectDir, sessionName, false);
		// Read from beginning to rebuild state
		agent.fileOffset = 0;
		agents.set(id, agent);

		console.log(`[Pixel Agents] Recovered tmux agent ${id}: ${sessionName}`);
		sender?.postMessage({ type: 'agentCreated', id });

		// Start file watching
		startFileWatching(id, jsonlFile, agents, fileWatchers, pollingTimers, waitingTimers, permissionTimers, sender);
		readNewLines(id, agents, waitingTimers, permissionTimers, sender);

		recovered++;
	}

	if (recovered > 0) {
		persistAgents();
		console.log(`[Pixel Agents] Recovered ${recovered} tmux agent(s)`);
	}

	return recovered;
}

// ── tmux health check ───────────────────────────────────────

export function checkTmuxHealth(
	agents: Map<number, AgentState>,
	fileWatchers: Map<number, fs.FSWatcher>,
	pollingTimers: Map<number, ReturnType<typeof setInterval>>,
	waitingTimers: Map<number, ReturnType<typeof setTimeout>>,
	permissionTimers: Map<number, ReturnType<typeof setTimeout>>,
	jsonlPollTimers: Map<number, ReturnType<typeof setInterval>>,
	knownJsonlFiles: Set<string>,
	sender: MessageSender | undefined,
	persistAgents: () => void,
): void {
	for (const [agentId, agent] of agents) {
		if (!agent.tmuxSessionName) continue;
		if (!isTmuxSessionAlive(agent.tmuxSessionName)) {
			console.log(`[Pixel Agents] tmux session ${agent.tmuxSessionName} died, removing agent ${agentId}`);
			removeAgent(agentId, agents, fileWatchers, pollingTimers, waitingTimers, permissionTimers, jsonlPollTimers, knownJsonlFiles, persistAgents);
			sender?.postMessage({ type: 'agentClosed', id: agentId });
		}
	}
}

export function sendExistingAgents(
	agents: Map<number, AgentState>,
	agentMeta: Record<string, { palette?: number; hueShift?: number; seatId?: string }>,
	sender: MessageSender | undefined,
): void {
	if (!sender) return;
	const agentIds: number[] = [];
	for (const id of agents.keys()) {
		agentIds.push(id);
	}
	agentIds.sort((a, b) => a - b);

	sender.postMessage({
		type: 'existingAgents',
		agents: agentIds,
		agentMeta,
	});

	// Re-send current states
	for (const [agentId, agent] of agents) {
		if (agent.model) {
			sender.postMessage({
				type: 'agentModel',
				id: agentId,
				model: agent.model,
			});
		}
		for (const [toolId, status] of agent.activeToolStatuses) {
			sender.postMessage({
				type: 'agentToolStart',
				id: agentId,
				toolId,
				status,
			});
		}
		if (agent.isWaiting) {
			sender.postMessage({
				type: 'agentStatus',
				id: agentId,
				status: 'waiting',
			});
		}
	}
}
