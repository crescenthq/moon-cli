import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "moon");
const SYNC_STATE_FILE = join(CONFIG_DIR, "sync-state.json");

export type SessionSyncState = {
	sessionId: string;
	agent: string;
	filePath: string;
	updatedAt: string;
};

type SyncStateStore = {
	version: number;
	sessions: Record<string, SessionSyncState>;
};

function getSessionKey(agent: string, filePath: string): string {
	return `${agent}:${filePath}`;
}

async function ensureConfigDir(): Promise<void> {
	await mkdir(CONFIG_DIR, { recursive: true });
}

async function loadSyncState(): Promise<SyncStateStore> {
	try {
		const content = await readFile(SYNC_STATE_FILE, "utf-8");
		return JSON.parse(content);
	} catch {
		return { version: 1, sessions: {} };
	}
}

async function saveSyncState(state: SyncStateStore): Promise<void> {
	await ensureConfigDir();
	await writeFile(SYNC_STATE_FILE, JSON.stringify(state, null, 2));
}

export async function getSessionState(
	agent: string,
	filePath: string,
): Promise<SessionSyncState | null> {
	const state = await loadSyncState();
	return state.sessions[getSessionKey(agent, filePath)] || null;
}

export async function updateSessionState(
	agent: string,
	filePath: string,
	sessionId: string,
): Promise<SessionSyncState> {
	const state = await loadSyncState();
	const key = getSessionKey(agent, filePath);

	state.sessions[key] = {
		sessionId,
		agent,
		filePath,
		updatedAt: new Date().toISOString(),
	};

	await saveSyncState(state);
	return state.sessions[key];
}
