import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LAYOUT_FILE_DIR } from './constants.js';

const STATS_FILE_NAME = 'dashboard-stats.json';

interface DashboardStatsData {
	totalToolCalls: number;
	toolDistribution: Record<string, number>;
}

let stats: DashboardStatsData = { totalToolCalls: 0, toolDistribution: {} };
let dirty = false;

function getStatsPath(): string {
	return path.join(os.homedir(), LAYOUT_FILE_DIR, STATS_FILE_NAME);
}

/** 載入統計（啟動時呼叫一次） */
export function loadDashboardStats(): void {
	try {
		const filePath = getStatsPath();
		if (fs.existsSync(filePath)) {
			stats = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DashboardStatsData;
		}
	} catch {
		// 忽略讀取錯誤
	}
}

/** 儲存統計至磁碟 */
function saveDashboardStats(): void {
	if (!dirty) return;
	try {
		const filePath = getStatsPath();
		const dir = path.dirname(filePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		fs.writeFileSync(filePath, JSON.stringify(stats, null, 2), 'utf-8');
		dirty = false;
	} catch {
		// 忽略寫入錯誤
	}
}

/** 記錄工具完成（由 transcriptParser 呼叫） */
export function incrementToolCall(toolName: string): void {
	stats.totalToolCalls++;
	stats.toolDistribution[toolName] = (stats.toolDistribution[toolName] || 0) + 1;
	dirty = true;
	// 每 10 次呼叫存檔一次（避免過於頻繁 I/O）
	if (stats.totalToolCalls % 10 === 0) {
		saveDashboardStats();
	}
}

/** 取得當前統計資料（用於儀表板回應） */
export function getDashboardStats(): DashboardStatsData {
	return stats;
}

/** 在關機時確保統計已儲存 */
export function flushDashboardStats(): void {
	saveDashboardStats();
}
