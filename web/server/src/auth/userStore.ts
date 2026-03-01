import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import bcrypt from 'bcryptjs';
import { LAYOUT_FILE_DIR, USERS_FILE_NAME } from '../constants.js';

const userDir = path.join(os.homedir(), LAYOUT_FILE_DIR);

interface StoredUser {
	id: string;
	username: string;
	passwordHash: string;
	createdAt: string;
}

interface UsersData {
	users: StoredUser[];
}

function getUsersFilePath(): string {
	return path.join(userDir, USERS_FILE_NAME);
}

function readUsersData(): UsersData {
	try {
		const filePath = getUsersFilePath();
		if (!fs.existsSync(filePath)) return { users: [] };
		return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as UsersData;
	} catch {
		return { users: [] };
	}
}

function writeUsersData(data: UsersData): void {
	const filePath = getUsersFilePath();
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	const tmpPath = filePath + '.tmp';
	fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
	fs.renameSync(tmpPath, filePath);
}

function generateId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function createUser(username: string, password: string): Promise<StoredUser> {
	const data = readUsersData();
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
	};
	data.users.push(user);
	writeUsersData(data);
	return user;
}

export async function verifyUser(username: string, password: string): Promise<StoredUser | null> {
	const data = readUsersData();
	const user = data.users.find(u => u.username === username);
	if (!user) return null;
	const valid = await bcrypt.compare(password, user.passwordHash);
	return valid ? user : null;
}

export function getUserByUsername(username: string): StoredUser | null {
	const data = readUsersData();
	return data.users.find(u => u.username === username) || null;
}

export function getUserCount(): number {
	return readUsersData().users.length;
}

/** 首次啟動時若無使用者，建立預設 admin 帳號 */
export async function ensureDefaultUser(): Promise<void> {
	if (getUserCount() > 0) return;
	console.log('[Pixel Agents] No users found, creating default admin account');
	await createUser('admin', 'admin');
}
