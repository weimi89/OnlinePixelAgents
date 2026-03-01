#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { AgentNodeConnection } from './connection.js';
import { AgentTracker } from './agentTracker.js';
import { Scanner } from './scanner.js';

const CONFIG_DIR = path.join(os.homedir(), '.pixel-agents');
const CONFIG_FILE = path.join(CONFIG_DIR, 'node-config.json');

interface NodeConfig {
	server: string;
	token: string;
}

function readConfig(): NodeConfig | null {
	try {
		if (!fs.existsSync(CONFIG_FILE)) return null;
		return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) as NodeConfig;
	} catch {
		return null;
	}
}

function writeConfig(config: NodeConfig): void {
	if (!fs.existsSync(CONFIG_DIR)) {
		fs.mkdirSync(CONFIG_DIR, { recursive: true });
	}
	fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

function prompt(question: string): Promise<string> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

async function login(serverUrl: string): Promise<void> {
	const username = await prompt('Username: ');
	const password = await prompt('Password: ');

	try {
		const res = await fetch(`${serverUrl}/api/auth/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username, password }),
		});
		if (!res.ok) {
			const body = await res.json() as { error?: string };
			console.error(`Login failed: ${body.error || res.statusText}`);
			process.exit(1);
		}
		const data = await res.json() as { token: string; username: string };
		writeConfig({ server: serverUrl, token: data.token });
		console.log(`Logged in as ${data.username}. Config saved to ${CONFIG_FILE}`);
	} catch (err) {
		console.error('Login failed:', err instanceof Error ? err.message : err);
		process.exit(1);
	}
}

function start(serverUrl: string, token: string): void {
	const connection = new AgentNodeConnection({
		serverUrl,
		token,
		onAuthenticated(userId) {
			console.log(`[Agent Node] Authenticated as user ${userId}`);
		},
		onError(message) {
			console.error(`[Agent Node] Server error: ${message}`);
		},
		onAgentRegistered(sessionId, agentId) {
			console.log(`[Agent Node] Agent registered: session=${sessionId} → id=${agentId}`);
		},
		onReconnect() {
			// 重連後重新啟動掃描器（讓它重新偵測活躍的代理）
			console.log('[Agent Node] Reconnected — re-scanning...');
		},
	});

	const tracker = new AgentTracker((event) => {
		connection.sendEvent(event);
	});

	const scanner = new Scanner(tracker);

	connection.connect();
	scanner.start();

	// Graceful shutdown
	function shutdown(): void {
		console.log('\n[Agent Node] Shutting down...');
		scanner.stop();
		tracker.destroy();
		connection.disconnect();
		process.exit(0);
	}
	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);

	console.log('[Agent Node] Running. Press Ctrl+C to stop.');
}

// ── CLI 解析 ─────────────────────────────────────────
async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const command = args[0];

	if (command === 'login') {
		const serverUrl = args[1];
		if (!serverUrl) {
			console.error('Usage: pixel-agents-node login <server-url>');
			console.error('Example: pixel-agents-node login http://192.168.1.100:3000');
			process.exit(1);
		}
		await login(serverUrl.replace(/\/$/, ''));
		return;
	}

	if (command === 'start' || !command) {
		// 從參數或配置檔讀取
		let serverUrl: string | undefined;
		let token: string | undefined;

		for (let i = 1; i < args.length; i++) {
			if (args[i] === '--server' && args[i + 1]) {
				serverUrl = args[++i];
			} else if (args[i] === '--token' && args[i + 1]) {
				token = args[++i];
			}
		}

		if (!serverUrl || !token) {
			const config = readConfig();
			if (config) {
				serverUrl = serverUrl || config.server;
				token = token || config.token;
			}
		}

		if (!serverUrl || !token) {
			console.error('No server/token configured. Run:');
			console.error('  pixel-agents-node login <server-url>');
			console.error('Or:');
			console.error('  pixel-agents-node start --server <url> --token <jwt>');
			process.exit(1);
		}

		start(serverUrl, token);
		return;
	}

	console.error(`Unknown command: ${command}`);
	console.error('Usage:');
	console.error('  pixel-agents-node login <server-url>    Login and save token');
	console.error('  pixel-agents-node start                  Start scanning');
	console.error('  pixel-agents-node start --server <url> --token <jwt>');
	process.exit(1);
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
