import { io, type Socket } from 'socket.io-client';
import type { AgentNodeEvent, ServerNodeMessage } from 'pixel-agents-shared';

export interface ConnectionOptions {
	serverUrl: string;
	token: string;
	onAuthenticated?: (userId: string) => void;
	onError?: (message: string) => void;
	onAgentRegistered?: (sessionId: string, agentId: number) => void;
	onDisconnect?: (reason: string) => void;
	onReconnect?: () => void;
}

export class AgentNodeConnection {
	private socket: Socket | null = null;
	private options: ConnectionOptions;

	constructor(options: ConnectionOptions) {
		this.options = options;
	}

	connect(): void {
		const url = this.options.serverUrl.replace(/\/$/, '') + '/agent-node';
		this.socket = io(url, {
			auth: { token: this.options.token },
			reconnection: true,
			reconnectionDelay: 2000,
			reconnectionDelayMax: 10000,
		});

		this.socket.on('connect', () => {
			console.log('[Agent Node] Connected to server');
		});

		this.socket.on('message', (msg: ServerNodeMessage) => {
			switch (msg.type) {
				case 'authenticated':
					this.options.onAuthenticated?.(msg.userId);
					break;
				case 'error':
					this.options.onError?.(msg.message);
					break;
				case 'agentRegistered':
					this.options.onAgentRegistered?.(msg.sessionId, msg.agentId);
					break;
			}
		});

		this.socket.on('disconnect', (reason) => {
			console.log(`[Agent Node] Disconnected: ${reason}`);
			this.options.onDisconnect?.(reason);
		});

		this.socket.on('connect_error', (err) => {
			console.error(`[Agent Node] Connection error: ${err.message}`);
		});

		this.socket.io.on('reconnect', () => {
			console.log('[Agent Node] Reconnected to server');
			this.options.onReconnect?.();
		});
	}

	sendEvent(event: AgentNodeEvent): void {
		this.socket?.emit('event', event);
	}

	disconnect(): void {
		this.socket?.disconnect();
		this.socket = null;
	}

	get connected(): boolean {
		return this.socket?.connected ?? false;
	}
}
