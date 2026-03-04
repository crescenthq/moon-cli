import { execFileSync, spawn } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const MOON_CLI = process.env.MOON_CLI ?? "moon";
const DEBUG = process.env.MOON_DEBUG === "1";
const OPENCLAW_AGENTS_PATH = join(homedir(), ".openclaw", "agents");
const seenInitialTrigger = new Set();

function debug(...args) {
	if (DEBUG) {
		console.log("[hook:moon-openclaw-sync]", ...args);
	}
}

function parseCommandSpec(commandSpec) {
	const parts = commandSpec.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) {
		return { command: "moon", baseArgs: [] };
	}

	return {
		command: parts[0],
		baseArgs: parts.slice(1),
	};
}

const parsedMoonCli = parseCommandSpec(MOON_CLI);

function runMoon(args, options = {}) {
	try {
		return execFileSync(
			parsedMoonCli.command,
			[...parsedMoonCli.baseArgs, ...args],
			{
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			},
		).trim();
	} catch (error) {
		if (options.ignoreErrors) {
			return "";
		}
		throw error;
	}
}

function spawnMoonBackground(args) {
	try {
		const child = spawn(
			parsedMoonCli.command,
			[...parsedMoonCli.baseArgs, ...args],
			{
				detached: true,
				stdio: "ignore",
			},
		);
		child.unref();
	} catch (error) {
		debug(
			"Failed to spawn background sync:",
			error instanceof Error ? error.message : String(error),
		);
	}
}

function getSharingMode() {
	try {
		const mode = runMoon(["config", "get", "sharing.mode", "--quiet"], {
			ignoreErrors: true,
		});
		if (mode === "off" || mode === "prompt" || mode === "auto") {
			return mode;
		}
	} catch {}
	return "off";
}

function getShareStatus(sessionId) {
	try {
		const url = runMoon(
			["share", "status", sessionId, "--agent", "openclaw", "--quiet"],
			{ ignoreErrors: true },
		);
		return { sharing: Boolean(url), url: url || undefined };
	} catch {
		return { sharing: false };
	}
}

function runShareForeground(sessionId) {
	return runMoon([
		"share",
		"--agent",
		"openclaw",
		`--sessionId=${sessionId}`,
		"--quiet",
	]);
}

function runShareBackground(sessionId) {
	spawnMoonBackground([
		"share",
		"--agent",
		"openclaw",
		`--sessionId=${sessionId}`,
		"--quiet",
	]);
}

function pushMessage(event, message) {
	if (Array.isArray(event.messages)) {
		event.messages.push(message);
	}
}

function toStringValue(input) {
	if (typeof input !== "string") {
		return undefined;
	}
	const value = input.trim();
	return value.length > 0 ? value : undefined;
}

function sessionIdFromSessionFile(sessionFile) {
	const value = toStringValue(sessionFile);
	if (!value) {
		return undefined;
	}
	const fileName = basename(value);
	return fileName.endsWith(".jsonl") ? fileName.slice(0, -6) : fileName;
}

function extractSessionFromEntry(entry) {
	if (!entry || typeof entry !== "object") {
		return undefined;
	}

	const directId = toStringValue(entry.sessionId);
	if (directId) {
		return directId;
	}

	return sessionIdFromSessionFile(entry.sessionFile);
}

function extractAgentScopeFromSessionKey(sessionKey) {
	const value = toStringValue(sessionKey);
	if (!value) {
		return undefined;
	}

	const parts = value
		.split(":")
		.map((part) => part.trim())
		.filter(Boolean);
	if (parts[0] === "agent" && parts[1]) {
		return parts[1];
	}
	return undefined;
}

function collectSessionCandidatesFromDir(sessionsDir) {
	const candidates = [];
	const files = readdirSync(sessionsDir);

	for (const fileName of files) {
		if (!fileName.endsWith(".jsonl")) {
			continue;
		}

		const filePath = join(sessionsDir, fileName);
		const fileStat = statSync(filePath);
		if (!fileStat.isFile() || fileStat.size === 0) {
			continue;
		}

		candidates.push({
			sessionId: fileName.slice(0, -6),
			mtimeMs: fileStat.mtimeMs,
		});
	}

	return candidates;
}

function pickNewestSessionId(candidates) {
	if (candidates.length === 0) {
		return undefined;
	}

	const sorted = [...candidates].sort((a, b) => {
		if (a.mtimeMs !== b.mtimeMs) {
			return b.mtimeMs - a.mtimeMs;
		}
		return a.sessionId.localeCompare(b.sessionId);
	});

	return sorted[0]?.sessionId;
}

function resolveSessionIdFromAgentScope(agentScope) {
	try {
		const sessionsDir = join(OPENCLAW_AGENTS_PATH, agentScope, "sessions");
		return pickNewestSessionId(collectSessionCandidatesFromDir(sessionsDir));
	} catch {
		return undefined;
	}
}

function resolveSessionIdGlobally() {
	try {
		const entries = readdirSync(OPENCLAW_AGENTS_PATH, { withFileTypes: true });
		const allCandidates = [];

		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue;
			}

			const sessionsDir = join(OPENCLAW_AGENTS_PATH, entry.name, "sessions");
			try {
				allCandidates.push(...collectSessionCandidatesFromDir(sessionsDir));
			} catch {
				// Ignore missing/invalid agent session dirs.
			}
		}

		return pickNewestSessionId(allCandidates);
	} catch {
		return undefined;
	}
}

function resolveSessionId(event) {
	const context =
		event.context && typeof event.context === "object" ? event.context : {};

	if (event.type === "command" && event.action === "reset") {
		const fromPrevious = extractSessionFromEntry(context.previousSessionEntry);
		if (fromPrevious) {
			return fromPrevious;
		}
	}

	const fromContext = toStringValue(context.sessionId);
	if (fromContext) {
		return fromContext;
	}

	const fromFile = sessionIdFromSessionFile(context.sessionFile);
	if (fromFile) {
		return fromFile;
	}

	const fromEntry = extractSessionFromEntry(context.sessionEntry);
	if (fromEntry) {
		return fromEntry;
	}

	const agentScope = extractAgentScopeFromSessionKey(event.sessionKey);
	if (agentScope) {
		const fromScope = resolveSessionIdFromAgentScope(agentScope);
		if (fromScope) {
			return fromScope;
		}
	}

	return resolveSessionIdGlobally();
}

function handleStartLifecycle(event, sessionId) {
	const status = getShareStatus(sessionId);
	if (status.sharing) {
		debug("Already sharing, running background sync for", sessionId);
		runShareBackground(sessionId);
		return;
	}

	const mode = getSharingMode();
	if (mode === "auto") {
		try {
			const url = runShareForeground(sessionId);
			if (url) {
				pushMessage(event, `Moon auto-sharing: ${url}`);
			}
		} catch (error) {
			debug(
				"Auto-share failed:",
				error instanceof Error ? error.message : String(error),
			);
		}
		return;
	}

	if (mode === "prompt") {
		pushMessage(
			event,
			`Moon sharing is set to prompt. Run: moon share --agent openclaw --sessionId ${sessionId}`,
		);
	}
}

function handleIncrementalLifecycle(sessionId) {
	const status = getShareStatus(sessionId);
	if (status.sharing) {
		runShareBackground(sessionId);
		return;
	}

	if (getSharingMode() === "auto") {
		runShareBackground(sessionId);
	}
}

function handleFinalLifecycle(sessionId) {
	const status = getShareStatus(sessionId);
	if (!status.sharing) {
		return;
	}

	try {
		runShareForeground(sessionId);
	} catch (error) {
		debug(
			"Final sync failed:",
			error instanceof Error ? error.message : String(error),
		);
	}
}

function isRelevantEvent(event) {
	if (!event || typeof event !== "object") {
		return false;
	}

	if (event.type === "command") {
		return (
			event.action === "new" ||
			event.action === "stop" ||
			event.action === "reset"
		);
	}

	if (event.type === "message") {
		return event.action === "received" || event.action === "sent";
	}

	return false;
}

export default async function moonOpenClawSyncHook(event) {
	if (!isRelevantEvent(event)) {
		return;
	}

	const sessionId = resolveSessionId(event);
	if (!sessionId) {
		debug("Skipping event; unable to resolve deterministic sessionId");
		return;
	}

	if (event.type === "command" && event.action === "new") {
		seenInitialTrigger.add(sessionId);
		handleStartLifecycle(event, sessionId);
		return;
	}

	if (event.type === "message" && event.action === "received") {
		if (!seenInitialTrigger.has(sessionId)) {
			seenInitialTrigger.add(sessionId);
			handleStartLifecycle(event, sessionId);
			return;
		}
		handleIncrementalLifecycle(sessionId);
		return;
	}

	if (event.type === "message" && event.action === "sent") {
		handleIncrementalLifecycle(sessionId);
		return;
	}

	if (
		event.type === "command" &&
		(event.action === "stop" || event.action === "reset")
	) {
		handleFinalLifecycle(sessionId);
		seenInitialTrigger.delete(sessionId);
	}
}
