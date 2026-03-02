import { spawnSync, spawn } from 'child_process';

export const TMUX_SESSION_PREFIX = 'pixel-agents';

let tmuxAvailable: boolean | null = null;

export function isTmuxAvailable(): boolean {
	if (tmuxAvailable !== null) return tmuxAvailable;
	const result = spawnSync('which', ['tmux'], { encoding: 'utf-8', stdio: 'pipe' });
	tmuxAvailable = result.status === 0;
	return tmuxAvailable;
}

/** 從會話 UUID 建構 tmux 會話名稱 */
export function tmuxSessionName(sessionUuid: string): string {
	return `${TMUX_SESSION_PREFIX}-${sessionUuid}`;
}

/** 從 tmux 會話名稱解析會話 UUID，無法解析則返回 null */
export function parseSessionUuid(name: string): string | null {
	if (!name.startsWith(`${TMUX_SESSION_PREFIX}-`)) return null;
	return name.slice(TMUX_SESSION_PREFIX.length + 1);
}

/** 建立一個在背景執行指定命令的 tmux 會話 */
export function createTmuxSession(
	sessionName: string,
	bin: string,
	args: string[],
	cwd: string,
	env: Record<string, string | undefined>,
): void {
	// 建構要在 tmux 中執行的 shell 命令
	const shellCmd = [bin, ...args].map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
	const tmux = spawn('tmux', [
		'new-session', '-d',
		'-s', sessionName,
		'-c', cwd,
		shellCmd,
	], {
		cwd,
		env: env as NodeJS.ProcessEnv,
		stdio: 'ignore',
		shell: true,
	});
	tmux.on('error', (err) => {
		console.error(`[Pixel Agents] Failed to create tmux session ${sessionName}:`, err);
	});
	tmux.unref();
}

/** 依名稱終止 tmux 會話 */
export function killTmuxSession(sessionName: string): void {
	const result = spawnSync('tmux', ['kill-session', '-t', sessionName], {
		encoding: 'utf-8',
		stdio: 'pipe',
	});
	if (result.status !== 0) {
		console.warn(`[Pixel Agents] Failed to kill tmux session ${sessionName}: ${(result.stderr || '').trim()}`);
	}
}

/** 檢查 tmux 會話是否仍然存活 */
export function isTmuxSessionAlive(sessionName: string): boolean {
	const result = spawnSync('tmux', ['has-session', '-t', sessionName], {
		encoding: 'utf-8',
		stdio: 'pipe',
	});
	return result.status === 0;
}

/** 列出所有目前存活的 pixel-agents tmux 會話 */
export function listPixelAgentSessions(): string[] {
	const result = spawnSync('tmux', ['list-sessions', '-F', '#{session_name}'], {
		encoding: 'utf-8',
		stdio: 'pipe',
	});
	if (result.status !== 0) return [];
	return (result.stdout || '')
		.split('\n')
		.map(s => s.trim())
		.filter(s => s.startsWith(`${TMUX_SESSION_PREFIX}-`));
}
