import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import type { CLIAdapter } from './index.js';

const binaryPath = (() => {
	try {
		return execSync('which codex', { encoding: 'utf-8' }).trim();
	} catch {
		return 'codex';
	}
})();

export const codexAdapter: CLIAdapter = {
	name: 'codex',

	getProjectsRoot() {
		return path.join(os.homedir(), '.codex', 'sessions');
	},

	isAvailable() {
		try {
			execSync('which codex', { stdio: 'ignore' });
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
			if (key.startsWith('CODEX') || key.startsWith('OPENAI')) {
				delete cleanEnv[key];
			}
		}
		return cleanEnv;
	},

	ignoredDirPatterns() {
		return [];
	},

	/** 從 Codex JSONL 第一行的 session_meta 提取 cwd 作為專案名稱 */
	extractProjectName(filePath: string): string | null {
		try {
			// Codex 第一行 session_meta 可能很大（包含完整系統提示），
			// 用正則直接從原始文字中提取 cwd，避免需要解析整行 JSON
			const fd = fs.openSync(filePath, 'r');
			try {
				const buf = Buffer.alloc(512);
				const bytesRead = fs.readSync(fd, buf, 0, 512, 0);
				const text = buf.toString('utf-8', 0, bytesRead);
				const cwdMatch = /"cwd"\s*:\s*"([^"]+)"/.exec(text);
				if (cwdMatch) {
					return path.basename(cwdMatch[1]);
				}
			} finally {
				fs.closeSync(fd);
			}
		} catch { /* 忽略 */ }
		return null;
	},
};
