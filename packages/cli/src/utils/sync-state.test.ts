import { beforeEach, expect, test } from "bun:test";
import { unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { getSyncStateBySessionId, updateSessionState } from "./sync-state";

const SYNC_STATE_FILE = join(homedir(), ".config", "moon", "sync-state.json");

beforeEach(async () => {
	try {
		await unlink(SYNC_STATE_FILE);
	} catch {}
});

test("getSyncStateBySessionId finds session by agent and sessionId", async () => {
	const agent = "claude-code";
	const filePath = "/tmp/test-session.jsonl";
	const sessionId = "test-session-456";

	// Create session
	await updateSessionState({ agent, filePath, sessionId });

	// Find by session ID
	const found = await getSyncStateBySessionId(agent, sessionId);
	expect(found).not.toBeNull();
	expect(found?.sessionId).toBe(sessionId);
	expect(found?.filePath).toBe(filePath);
});

test("getSyncStateBySessionId returns null for non-existent session", async () => {
	const found = await getSyncStateBySessionId("claude-code", "non-existent");
	expect(found).toBeNull();
});

test("sync state supports openclaw agent namespace", async () => {
	await updateSessionState({
		agent: "openclaw",
		filePath: "/tmp/openclaw-session.jsonl",
		sessionId: "openclaw-session-1",
	});

	const found = await getSyncStateBySessionId("openclaw", "openclaw-session-1");
	expect(found).not.toBeNull();
	expect(found?.agent).toBe("openclaw");
});
