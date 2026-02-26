import { execSync, spawn } from 'child_process';

export const TMUX_SESSION_PREFIX = 'pixel-agents';

let tmuxAvailable: boolean | null = null;

export function isTmuxAvailable(): boolean {
	if (tmuxAvailable !== null) return tmuxAvailable;
	try {
		execSync('which tmux', { encoding: 'utf-8', stdio: 'pipe' });
		tmuxAvailable = true;
	} catch {
		tmuxAvailable = false;
	}
	return tmuxAvailable;
}

/** Build a tmux session name from a session UUID */
export function tmuxSessionName(sessionUuid: string): string {
	return `${TMUX_SESSION_PREFIX}-${sessionUuid}`;
}

/** Parse a session UUID from a tmux session name, or null */
export function parseSessionUuid(name: string): string | null {
	if (!name.startsWith(`${TMUX_SESSION_PREFIX}-`)) return null;
	return name.slice(TMUX_SESSION_PREFIX.length + 1);
}

/** Create a detached tmux session running the given command */
export function createTmuxSession(
	sessionName: string,
	bin: string,
	args: string[],
	cwd: string,
	env: Record<string, string | undefined>,
): void {
	// Build the shell command to run inside tmux
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
	tmux.unref();
}

/** Kill a tmux session by name */
export function killTmuxSession(sessionName: string): void {
	try {
		execSync(`tmux kill-session -t ${JSON.stringify(sessionName)}`, {
			encoding: 'utf-8',
			stdio: 'pipe',
		});
	} catch {
		// Session may already be dead
	}
}

/** Check if a tmux session is still alive */
export function isTmuxSessionAlive(sessionName: string): boolean {
	try {
		execSync(`tmux has-session -t ${JSON.stringify(sessionName)}`, {
			encoding: 'utf-8',
			stdio: 'pipe',
		});
		return true;
	} catch {
		return false;
	}
}

/** List all pixel-agents tmux sessions that are currently alive */
export function listPixelAgentSessions(): string[] {
	try {
		const output = execSync('tmux list-sessions -F "#{session_name}"', {
			encoding: 'utf-8',
			stdio: 'pipe',
		});
		return output
			.split('\n')
			.map(s => s.trim())
			.filter(s => s.startsWith(`${TMUX_SESSION_PREFIX}-`));
	} catch {
		return [];
	}
}
