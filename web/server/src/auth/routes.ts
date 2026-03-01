import { Router } from 'express';
import { createUser, verifyUser, ensureDefaultUser } from './userStore.js';
import { signToken } from './jwt.js';

const router = Router();

router.post('/register', async (req, res) => {
	try {
		const { username, password } = req.body as { username?: string; password?: string };
		if (!username || !password) {
			res.status(400).json({ error: 'Username and password are required' });
			return;
		}
		if (username.length < 2 || username.length > 32) {
			res.status(400).json({ error: 'Username must be 2-32 characters' });
			return;
		}
		if (password.length < 4) {
			res.status(400).json({ error: 'Password must be at least 4 characters' });
			return;
		}
		const user = await createUser(username, password);
		const token = signToken(user.id, user.username);
		res.json({ token, username: user.username });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Registration failed';
		res.status(409).json({ error: message });
	}
});

router.post('/login', async (req, res) => {
	try {
		const { username, password } = req.body as { username?: string; password?: string };
		if (!username || !password) {
			res.status(400).json({ error: 'Username and password are required' });
			return;
		}
		const user = await verifyUser(username, password);
		if (!user) {
			res.status(401).json({ error: 'Invalid credentials' });
			return;
		}
		const token = signToken(user.id, user.username);
		res.json({ token, username: user.username });
	} catch {
		res.status(500).json({ error: 'Login failed' });
	}
});

/** 初始化認證路由（確保預設使用者存在） */
export async function initAuthRoutes(): Promise<Router> {
	await ensureDefaultUser();
	return router;
}
