import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { LAYOUT_FILE_DIR, JWT_SECRET_FILE_NAME, AUTH_TOKEN_EXPIRY_DAYS } from '../constants.js';

const userDir = path.join(os.homedir(), LAYOUT_FILE_DIR);

function getSecretFilePath(): string {
	return path.join(userDir, JWT_SECRET_FILE_NAME);
}

/** 取得或自動生成 JWT 密鑰 */
function getSecret(): string {
	const filePath = getSecretFilePath();
	try {
		if (fs.existsSync(filePath)) {
			return fs.readFileSync(filePath, 'utf-8').trim();
		}
	} catch { /* 讀取失敗就重新生成 */ }

	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	const secret = crypto.randomBytes(32).toString('hex');
	fs.writeFileSync(filePath, secret, { mode: 0o600 });
	console.log('[Pixel Agents] Generated new JWT secret');
	return secret;
}

// 啟動時快取密鑰
let cachedSecret: string | null = null;

function secret(): string {
	if (!cachedSecret) {
		cachedSecret = getSecret();
	}
	return cachedSecret;
}

export interface TokenPayload {
	userId: string;
	username: string;
}

export function signToken(userId: string, username: string): string {
	return jwt.sign(
		{ userId, username } satisfies TokenPayload,
		secret(),
		{ expiresIn: `${AUTH_TOKEN_EXPIRY_DAYS}d` },
	);
}

export function verifyToken(token: string): TokenPayload {
	const decoded = jwt.verify(token, secret());
	const payload = decoded as TokenPayload;
	if (!payload.userId || !payload.username) {
		throw new Error('Invalid token payload');
	}
	return payload;
}
