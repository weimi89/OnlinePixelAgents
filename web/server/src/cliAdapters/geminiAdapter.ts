import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import type { CLIAdapter } from './index.js';

const binaryPath = (() => {
	try {
		return execSync('which gemini', { encoding: 'utf-8' }).trim();
	} catch {
		return 'gemini';
	}
})();

export const geminiAdapter: CLIAdapter = {
	name: 'gemini',

	getProjectsRoot() {
		return path.join(os.homedir(), '.gemini', 'tmp');
	},

	isAvailable() {
		try {
			execSync('which gemini', { stdio: 'ignore' });
			return true;
		} catch {
			return false;
		}
	},

	getBinaryPath() {
		return binaryPath;
	},

	buildResumeArgs(sessionId: string) {
		return ['--resume', sessionId];
	},

	buildCleanEnv() {
		const cleanEnv = { ...process.env };
		for (const key of Object.keys(cleanEnv)) {
			if (key.startsWith('GEMINI') || key.startsWith('GOOGLE')) {
				delete cleanEnv[key];
			}
		}
		return cleanEnv;
	},

	ignoredDirPatterns() {
		return [];
	},

	sessionFileExtension() {
		return '.json';
	},

	readMode() {
		return 'full-reload';
	},

	scanSessionFiles() {
		const root = path.join(os.homedir(), '.gemini', 'tmp');
		const results: Array<{ dir: string; files: string[] }> = [];

		let projectDirs: string[];
		try {
			projectDirs = fs.readdirSync(root, { withFileTypes: true })
				.filter(e => e.isDirectory() && !e.name.startsWith('.'))
				.map(e => path.join(root, e.name));
		} catch {
			return results;
		}

		for (const projDir of projectDirs) {
			const chatsDir = path.join(projDir, 'chats');
			try {
				const files = fs.readdirSync(chatsDir)
					.filter(f => f.startsWith('session-') && f.endsWith('.json'))
					.map(f => path.join(chatsDir, f));
				if (files.length > 0) {
					results.push({ dir: projDir, files });
				}
			} catch {
				// chats/ 不存在 — 跳過
			}
		}

		return results;
	},
};
