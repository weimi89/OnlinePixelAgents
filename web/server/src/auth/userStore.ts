import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { LAYOUT_FILE_DIR, USERS_FILE_NAME } from '../constants.js';
import { atomicWriteJson } from '../atomicWrite.js';
import { db } from '../db/database.js';

const userDir = path.join(os.homedir(), LAYOUT_FILE_DIR);

export interface StoredUser {
	id: string;
	username: string;
	passwordHash: string;
	createdAt: string;
	mustChangePassword?: boolean;
	role?: 'admin' | 'member';
	apiKey: string;
}

/** 對外公開的使用者資訊（不含密碼雜湊） */
export interface PublicUser {
	id: string;
	username: string;
	role: 'admin' | 'member';
	createdAt: string;
	mustChangePassword: boolean;
	apiKey: string;
}

interface UsersData {
	users: StoredUser[];
}

function getUsersFilePath(): string {
	return path.join(userDir, USERS_FILE_NAME);
}

/** 產生 API Key：pa_ + 32 字元隨機英數字串 */
export function generateApiKey(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	const randomBytes = crypto.randomBytes(32);
	let result = 'pa_';
	for (let i = 0; i < 32; i++) {
		result += chars.charAt(randomBytes[i] % chars.length);
	}
	return result;
}

/** 讀取時自動補全缺失欄位（向下相容舊格式） */
function migrateUser(user: StoredUser): StoredUser {
	// viewer 角色自動遷移為 member
	const role = user.role === ('viewer' as string) ? 'member' : (user.role ?? 'admin');
	return {
		...user,
		role,
		mustChangePassword: user.mustChangePassword ?? false,
		// 若無 apiKey 則自動生成
		apiKey: user.apiKey || generateApiKey(),
	};
}

/** 從 JSON 檔案讀取（回退路徑） */
function readUsersDataFromJson(): UsersData {
	try {
		const filePath = getUsersFilePath();
		if (!fs.existsSync(filePath)) return { users: [] };
		const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as UsersData;
		return { users: raw.users.map(migrateUser) };
	} catch {
		return { users: [] };
	}
}

function writeUsersData(data: UsersData): void {
	atomicWriteJson(getUsersFilePath(), data);
}

function generateId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 將 DB UserRow 轉換為 StoredUser */
function dbRowToStoredUser(row: { id: string; username: string; password_hash: string; role: string; must_change_password: number; created_at: string; api_key?: string | null }): StoredUser {
	// viewer 角色自動遷移為 member
	const role = row.role === 'viewer' ? 'member' : row.role;
	return {
		id: row.id,
		username: row.username,
		passwordHash: row.password_hash,
		createdAt: row.created_at,
		role: role as 'admin' | 'member',
		mustChangePassword: row.must_change_password === 1,
		apiKey: row.api_key || generateApiKey(),
	};
}

export async function createUser(
	username: string,
	password: string,
	options?: { mustChangePassword?: boolean; role?: 'admin' | 'member' },
): Promise<StoredUser> {
	const apiKey = generateApiKey();

	if (db) {
		const existing = db.getUserByUsername(username);
		if (existing) {
			throw new Error('Username already exists');
		}
		const passwordHash = await bcrypt.hash(password, 10);
		const id = generateId();
		const role = options?.role ?? 'admin';
		const mustChangePassword = options?.mustChangePassword ?? false;
		db.createUser({ id, username, passwordHash, role, mustChangePassword, apiKey });
		const row = db.getUserByUsername(username);
		return row ? dbRowToStoredUser(row) : {
			id, username, passwordHash,
			createdAt: new Date().toISOString(),
			mustChangePassword, role, apiKey,
		};
	}

	const data = readUsersDataFromJson();
	const existing = data.users.find(u => u.username === username);
	if (existing) {
		throw new Error('Username already exists');
	}
	const passwordHash = await bcrypt.hash(password, 10);
	const user: StoredUser = {
		id: generateId(),
		username,
		passwordHash,
		createdAt: new Date().toISOString(),
		mustChangePassword: options?.mustChangePassword ?? false,
		role: options?.role ?? 'admin',
		apiKey,
	};
	data.users.push(user);
	writeUsersData(data);
	return user;
}

export async function verifyUser(username: string, password: string): Promise<StoredUser | null> {
	if (db) {
		const row = db.getUserByUsername(username);
		if (!row) return null;
		const valid = await bcrypt.compare(password, row.password_hash);
		if (!valid) return null;
		db.updateLastLogin(username);
		return dbRowToStoredUser(row);
	}

	const data = readUsersDataFromJson();
	const user = data.users.find(u => u.username === username);
	if (!user) return null;
	const valid = await bcrypt.compare(password, user.passwordHash);
	return valid ? user : null;
}

/** 透過 API Key 驗證使用者 */
export function verifyApiKey(apiKey: string): StoredUser | null {
	if (db) {
		const row = db.getUserByApiKey(apiKey);
		if (!row) return null;
		return dbRowToStoredUser(row);
	}
	const data = readUsersDataFromJson();
	return data.users.find(u => u.apiKey === apiKey) || null;
}

export function getUserByUsername(username: string): StoredUser | null {
	if (db) {
		const row = db.getUserByUsername(username);
		return row ? dbRowToStoredUser(row) : null;
	}
	const data = readUsersDataFromJson();
	return data.users.find(u => u.username === username) || null;
}

export function getUserById(id: string): StoredUser | null {
	if (db) {
		const row = db.getUserById(id);
		return row ? dbRowToStoredUser(row) : null;
	}
	const data = readUsersDataFromJson();
	return data.users.find(u => u.id === id) || null;
}

export function getUserCount(): number {
	if (db) {
		return db.listUsers().length;
	}
	return readUsersDataFromJson().users.length;
}

/** 更新使用者密碼雜湊 */
export function updateUserPassword(username: string, newPasswordHash: string): void {
	if (db) {
		const row = db.getUserByUsername(username);
		if (!row) throw new Error('User not found');
		db.updateUserPassword(username, newPasswordHash);
		return;
	}
	const data = readUsersDataFromJson();
	const user = data.users.find(u => u.username === username);
	if (!user) throw new Error('User not found');
	user.passwordHash = newPasswordHash;
	writeUsersData(data);
}

/** 清除強制變更密碼標記 */
export function clearMustChangePassword(username: string): void {
	if (db) {
		db.clearMustChangePassword(username);
		return;
	}
	const data = readUsersDataFromJson();
	const user = data.users.find(u => u.username === username);
	if (!user) throw new Error('User not found');
	user.mustChangePassword = false;
	writeUsersData(data);
}

/** 更新使用者角色 */
export function updateUserRole(id: string, role: 'admin' | 'member'): void {
	if (db) {
		const row = db.getUserById(id);
		if (!row) throw new Error('User not found');
		db.updateUserRole(id, role);
		return;
	}
	const data = readUsersDataFromJson();
	const user = data.users.find(u => u.id === id);
	if (!user) throw new Error('User not found');
	user.role = role;
	writeUsersData(data);
}

/** 重新生成使用者的 API Key，回傳新 key */
export function regenerateApiKey(userId: string): string {
	const newKey = generateApiKey();
	if (db) {
		const row = db.getUserById(userId);
		if (!row) throw new Error('User not found');
		db.updateApiKey(userId, newKey);
		return newKey;
	}
	const data = readUsersDataFromJson();
	const user = data.users.find(u => u.id === userId);
	if (!user) throw new Error('User not found');
	user.apiKey = newKey;
	writeUsersData(data);
	return newKey;
}

/** 刪除使用者 */
export function deleteUser(id: string): void {
	if (db) {
		const row = db.getUserById(id);
		if (!row) throw new Error('User not found');
		db.deleteUser(id);
		return;
	}
	const data = readUsersDataFromJson();
	const idx = data.users.findIndex(u => u.id === id);
	if (idx === -1) throw new Error('User not found');
	data.users.splice(idx, 1);
	writeUsersData(data);
}

/** 列出所有使用者（不含密碼雜湊） */
export function listUsers(): PublicUser[] {
	if (db) {
		return db.listUsers().map(u => {
			// viewer 角色自動遷移為 member
			const role = u.role === 'viewer' ? 'member' : u.role;
			return {
				id: u.id,
				username: u.username,
				role: role as 'admin' | 'member',
				createdAt: u.created_at,
				mustChangePassword: u.must_change_password === 1,
				apiKey: u.api_key || generateApiKey(),
			};
		});
	}
	const data = readUsersDataFromJson();
	return data.users.map(u => ({
		id: u.id,
		username: u.username,
		role: u.role ?? 'admin',
		createdAt: u.createdAt,
		mustChangePassword: u.mustChangePassword ?? false,
		apiKey: u.apiKey,
	}));
}

/** 首次啟動時若無使用者，建立預設 admin 帳號（標記須變更密碼） */
export async function ensureDefaultUser(): Promise<void> {
	if (getUserCount() > 0) return;
	console.log('[Pixel Agents] No users found, creating default admin account');
	await createUser('admin', 'admin', { mustChangePassword: true, role: 'admin' });
}
