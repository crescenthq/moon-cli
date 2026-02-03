import { FetchError, fetch } from "./api";
import { getSessionState, updateSessionState } from "./sync-state";

const APP_BASE_URL = "https://moon.page";

export type SyncResult = {
	success: boolean;
	sessionId: string;
	url: string;
	newMessages: number;
	totalMessages: number;
	isNew: boolean;
};

type SyncProgress = "analyzing" | "creating" | "syncing" | "done";
export type ProgressCallback = (progress: { phase: SyncProgress }) => void;

type CreateSessionResponse = {
	status: string;
	data: {
		sessionId: string;
		messageCount: number;
	};
};

type SyncResponse = {
	status: string;
	data: {
		success: boolean;
		newMessages: number;
		totalMessages: number;
	};
};

type SessionStatusResponse = {
	status: string;
	data: {
		sessionId: string;
		messageCount: number;
	};
};

type SyncChunkOptions = {
	sessionId: string;
	content: string;
	offset: number;
	isFinal: boolean;
};

type CreateSessionOptions = {
	agent: string;
	agentVersion: string;

	projectName: string;
	filePath: string;
	title: string;
	visibility: string;
	gitBranch: string;
	gitRemoteUrl: string;
};

async function createSession({
	agent,
	agentVersion,
	projectName,
	filePath,
	title,
	visibility,
	gitBranch,
	gitRemoteUrl,
}: CreateSessionOptions): Promise<CreateSessionResponse["data"]> {
	const result = await fetch<CreateSessionResponse>("/sessions", {
		method: "POST",
		body: {
			agent,
			agentVersion,
			projectName,
			filePath,
			title,
			visibility,
			gitBranch,
			gitRemoteUrl,
		},
	});
	return result.data;
}

async function getSessionStatus(
	sessionId: string,
): Promise<SessionStatusResponse["data"] | null> {
	try {
		const result = await fetch<SessionStatusResponse>(
			`/sessions/${sessionId}/status`,
		);
		return result.data;
	} catch (error) {
		if (error instanceof FetchError && error.status === 404) {
			return null;
		}
		throw error;
	}
}

// 20MB
const MAX_CHUNK_SIZE = 20 * 1024 * 1024;

async function syncContent(
	sessionId: string,
	content: string,
): Promise<SyncResponse["data"]> {
	const contentBytes = new TextEncoder().encode(content);

	if (contentBytes.length <= MAX_CHUNK_SIZE) {
		return syncContentChunk({ sessionId, content, offset: 0, isFinal: true });
	}

	// Split content into chunks
	let offset = 0;
	let lastResult: SyncResponse["data"] | null = null;

	while (offset < contentBytes.length) {
		const end = Math.min(offset + MAX_CHUNK_SIZE, contentBytes.length);
		const chunk = new TextDecoder().decode(contentBytes.slice(offset, end));
		const isFinal = end >= contentBytes.length;

		lastResult = await syncContentChunk({
			sessionId,
			content: chunk,
			offset,
			isFinal,
		});
		offset = end;
	}

	if (!lastResult) {
		throw new Error("No content to sync");
	}

	return lastResult;
}

async function syncContentChunk({
	sessionId,
	content,
	offset,
	isFinal,
}: SyncChunkOptions): Promise<SyncResponse["data"]> {
	const result = await fetch<SyncResponse>(`/sessions/${sessionId}/sync`, {
		method: "POST",
		body: content,
		headers: {
			"X-Chunk-Offset": String(offset),
			"X-Chunk-Final": String(isFinal),
		},
	});
	return result.data;
}

export async function syncSession(
	agent: "claude-code",
	filePath: string,
	content: string,
	metadata: {
		title?: string;
		visibility?: string;
		agentVersion?: string;
		projectName?: string;
		gitBranch?: string;
		gitRemoteUrl?: string;
	},
	onProgress?: ProgressCallback,
): Promise<SyncResult> {
	onProgress?.({ phase: "analyzing" });

	const existingState = await getSessionState(agent, filePath);
	const existingSessionId = existingState?.sessionId;

	let sessionId: string;
	let isNew: boolean;

	// Check if existing session still exists on server
	if (existingSessionId && (await getSessionStatus(existingSessionId))) {
		sessionId = existingSessionId;
		isNew = false;
	} else {
		onProgress?.({ phase: "creating" });
		const created = await createSession({
			agent,
			agentVersion: metadata.agentVersion || "",
			projectName: metadata.projectName || "",
			filePath,
			title: metadata.title ?? "Untitled",
			visibility: metadata.visibility ?? "private",
			gitBranch: metadata.gitBranch,
			gitRemoteUrl: metadata.gitRemoteUrl,
		});
		sessionId = created.sessionId;
		isNew = true;
	}

	onProgress?.({ phase: "syncing" });

	// Send full content - server handles parsing and deduplication
	const result = await syncContent(sessionId, content);
	const url = `${APP_BASE_URL}/sessions/${sessionId}`;

	onProgress?.({ phase: "done" });

	await updateSessionState({
		agent,
		filePath,
		sessionId,
		url,
		isSharing: true,
	});

	return {
		success: true,
		sessionId,
		url,
		newMessages: result.newMessages,
		totalMessages: result.totalMessages,
		isNew,
	};
}
