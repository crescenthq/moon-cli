import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	utimes,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

type SharingMode = "off" | "prompt" | "auto";
type HookEvent = {
	type: string;
	action: string;
	sessionKey?: string;
	context?: Record<string, unknown>;
	messages?: string[];
};

const handlerModuleUrl = pathToFileURL(
	join(
		process.cwd(),
		"packages/openclaw-hook-moon-sync/moon-openclaw-sync/handler.js",
	),
).href;

const originalEnv = {
	HOME: process.env.HOME,
	MOON_CLI: process.env.MOON_CLI,
	MOON_LOG: process.env.MOON_LOG,
	TEST_MODE: process.env.TEST_MODE,
	STATUS_URL: process.env.STATUS_URL,
	SHARE_URL: process.env.SHARE_URL,
};

const tempRoots: string[] = [];

afterEach(async () => {
	process.env.HOME = originalEnv.HOME;
	process.env.MOON_CLI = originalEnv.MOON_CLI;
	process.env.MOON_LOG = originalEnv.MOON_LOG;
	process.env.TEST_MODE = originalEnv.TEST_MODE;
	process.env.STATUS_URL = originalEnv.STATUS_URL;
	process.env.SHARE_URL = originalEnv.SHARE_URL;

	for (const root of tempRoots.splice(0)) {
		await rm(root, { recursive: true, force: true });
	}
});

async function createMoonCliStub(root: string) {
	const logFile = join(root, "moon.log");
	const stubPath = join(root, "moon-stub.sh");
	const script = `#!/bin/sh
set -eu
: "\${MOON_LOG:?MOON_LOG not set}"
printf '%s\\n' "$*" >> "$MOON_LOG"

if [ "$#" -ge 3 ] && [ "$1" = "config" ] && [ "$2" = "get" ] && [ "$3" = "sharing.mode" ]; then
  printf '%s' "\${TEST_MODE:-off}"
  exit 0
fi

if [ "$#" -ge 2 ] && [ "$1" = "share" ] && [ "$2" = "status" ]; then
  printf '%s' "\${STATUS_URL:-}"
  exit 0
fi

if [ "$1" = "share" ]; then
  printf '%s' "\${SHARE_URL:-}"
  exit 0
fi
`;

	await writeFile(stubPath, script, "utf8");
	await chmod(stubPath, 0o755);
	await writeFile(logFile, "", "utf8");

	return { stubPath, logFile };
}

async function readLogLines(path: string) {
	try {
		const content = await readFile(path, "utf8");
		return content
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean);
	} catch {
		return [];
	}
}

async function waitForLogCount(
	path: string,
	minCount: number,
	timeoutMs = 1500,
) {
	const deadline = Date.now() + timeoutMs;
	let lines = await readLogLines(path);
	while (lines.length < minCount && Date.now() < deadline) {
		await Bun.sleep(25);
		lines = await readLogLines(path);
	}
	return lines;
}

function hasLine(lines: string[], value: string) {
	return lines.some((line) => line.includes(value));
}

function countLines(lines: string[], value: string) {
	return lines.filter((line) => line.includes(value)).length;
}

async function createCaseRunner(root: string) {
	const runnerPath = join(root, "run-hook-case.mjs");
	const script = `const modulePath = process.env.HANDLER_PATH;
const eventsJson = process.env.CASE_EVENTS_JSON;
if (!modulePath || !eventsJson) {
  throw new Error("HANDLER_PATH and CASE_EVENTS_JSON are required");
}

const events = JSON.parse(eventsJson);
const mod = await import(\`\${modulePath}?v=\${Date.now()}-\${Math.random()}\`);
for (const event of events) {
  if (!Array.isArray(event.messages)) {
    event.messages = [];
  }
  await mod.default(event);
}

await new Promise((resolve) => setTimeout(resolve, 350));
process.stdout.write(JSON.stringify(events));
`;

	await writeFile(runnerPath, script, "utf8");
	return runnerPath;
}

async function runHookCase({
	mode,
	statusUrl = "",
	shareUrl = "",
	events,
	home,
	expectedMinLogLines = 2,
}: {
	mode: SharingMode;
	statusUrl?: string;
	shareUrl?: string;
	events: HookEvent[];
	home: string;
	expectedMinLogLines?: number;
}) {
	const { stubPath, logFile } = await createMoonCliStub(home);
	const runnerPath = await createCaseRunner(home);

	const output = execFileSync("bun", [runnerPath], {
		encoding: "utf8",
		env: {
			...process.env,
			HOME: home,
			MOON_CLI: stubPath,
			MOON_LOG: logFile,
			TEST_MODE: mode,
			STATUS_URL: statusUrl,
			SHARE_URL: shareUrl,
			CASE_EVENTS_JSON: JSON.stringify(events),
			HANDLER_PATH: handlerModuleUrl,
		},
	});

	const lines = await waitForLogCount(logFile, expectedMinLogLines);
	return { lines, events: JSON.parse(output) as HookEvent[] };
}

async function createHomeDir() {
	const root = await mkdtemp(join(tmpdir(), "moon-openclaw-hook-test-"));
	tempRoots.push(root);
	const home = join(root, "home");
	await mkdir(home, { recursive: true });
	return home;
}

async function createSessionFile({
	home,
	agent,
	sessionId,
	mtimeMs,
}: {
	home: string;
	agent: string;
	sessionId: string;
	mtimeMs: number;
}) {
	const sessionsDir = join(home, ".openclaw", "agents", agent, "sessions");
	await mkdir(sessionsDir, { recursive: true });
	const file = join(sessionsDir, `${sessionId}.jsonl`);
	await writeFile(file, "{}\n", "utf8");
	const timestamp = new Date(mtimeMs);
	await utimes(file, timestamp, timestamp);
}

test("command:new start lifecycle follows off/prompt/auto behavior", async () => {
	const offHome = await createHomeDir();
	const off = await runHookCase({
		mode: "off",
		home: offHome,
		events: [
			{ type: "command", action: "new", context: { sessionId: "s-off" } },
		],
	});
	expect(
		hasLine(off.lines, "share status s-off --agent openclaw --quiet"),
	).toBe(true);
	expect(
		hasLine(off.lines, "share --agent openclaw --sessionId=s-off --quiet"),
	).toBe(false);

	const promptHome = await createHomeDir();
	const prompt = await runHookCase({
		mode: "prompt",
		home: promptHome,
		events: [
			{ type: "command", action: "new", context: { sessionId: "s-prompt" } },
		],
	});
	expect(
		hasLine(prompt.lines, "share status s-prompt --agent openclaw --quiet"),
	).toBe(true);
	expect(
		hasLine(
			prompt.lines,
			"share --agent openclaw --sessionId=s-prompt --quiet",
		),
	).toBe(false);
	expect(
		prompt.events[0]?.messages?.some((message) =>
			message.includes("Moon sharing is set to prompt"),
		),
	).toBe(true);

	const autoHome = await createHomeDir();
	const auto = await runHookCase({
		mode: "auto",
		shareUrl: "https://moon.test/auto",
		home: autoHome,
		events: [
			{ type: "command", action: "new", context: { sessionId: "s-auto" } },
		],
		expectedMinLogLines: 3,
	});
	expect(
		hasLine(auto.lines, "share status s-auto --agent openclaw --quiet"),
	).toBe(true);
	expect(
		hasLine(auto.lines, "share --agent openclaw --sessionId=s-auto --quiet"),
	).toBe(true);
	expect(
		auto.events[0]?.messages?.some((message) =>
			message.includes("https://moon.test/auto"),
		),
	).toBe(true);
});

test("message:received path performs start once, then incremental", async () => {
	const home = await createHomeDir();
	const out = await runHookCase({
		mode: "prompt",
		home,
		events: [
			{
				type: "message",
				action: "received",
				context: { sessionId: "s-received" },
			},
			{
				type: "message",
				action: "received",
				context: { sessionId: "s-received" },
			},
		],
		expectedMinLogLines: 4,
	});

	expect(
		countLines(out.lines, "share status s-received --agent openclaw --quiet"),
	).toBe(2);
	expect(
		countLines(
			out.lines,
			"share --agent openclaw --sessionId=s-received --quiet",
		),
	).toBe(0);
	expect(out.events[0]?.messages?.length).toBe(1);
	expect(out.events[1]?.messages?.length).toBe(0);
});

test("message:sent path runs incremental sync in auto mode", async () => {
	const home = await createHomeDir();
	const out = await runHookCase({
		mode: "auto",
		home,
		events: [
			{ type: "message", action: "sent", context: { sessionId: "s-sent" } },
		],
		expectedMinLogLines: 3,
	});

	expect(
		hasLine(out.lines, "share status s-sent --agent openclaw --quiet"),
	).toBe(true);
	expect(
		hasLine(out.lines, "share --agent openclaw --sessionId=s-sent --quiet"),
	).toBe(true);
});

test("command:stop path performs final sync when status is active", async () => {
	const home = await createHomeDir();
	const out = await runHookCase({
		mode: "off",
		statusUrl: "https://moon.test/active",
		home,
		events: [
			{ type: "command", action: "stop", context: { sessionId: "s-stop" } },
		],
		expectedMinLogLines: 3,
	});

	expect(
		hasLine(out.lines, "share status s-stop --agent openclaw --quiet"),
	).toBe(true);
	expect(
		hasLine(out.lines, "share --agent openclaw --sessionId=s-stop --quiet"),
	).toBe(true);
});

test("command:reset prefers previousSessionEntry for final sync", async () => {
	const home = await createHomeDir();
	const out = await runHookCase({
		mode: "off",
		statusUrl: "https://moon.test/active",
		home,
		events: [
			{
				type: "command",
				action: "reset",
				context: {
					sessionId: "current-session",
					previousSessionEntry: { sessionId: "previous-session" },
				},
			},
		],
		expectedMinLogLines: 3,
	});

	expect(
		hasLine(
			out.lines,
			"share status previous-session --agent openclaw --quiet",
		),
	).toBe(true);
	expect(
		hasLine(
			out.lines,
			"share --agent openclaw --sessionId=previous-session --quiet",
		),
	).toBe(true);
	expect(
		hasLine(out.lines, "share status current-session --agent openclaw --quiet"),
	).toBe(false);
});

test("deterministic fallback uses sessionKey-scoped newest session then lexical tie-break", async () => {
	const home = await createHomeDir();
	await createSessionFile({
		home,
		agent: "scope-agent",
		sessionId: "zzz",
		mtimeMs: 1_700_000_000_000,
	});
	await createSessionFile({
		home,
		agent: "scope-agent",
		sessionId: "aaa",
		mtimeMs: 1_800_000_000_000,
	});
	await createSessionFile({
		home,
		agent: "scope-agent",
		sessionId: "bbb",
		mtimeMs: 1_800_000_000_000,
	});

	const out = await runHookCase({
		mode: "auto",
		home,
		events: [
			{
				type: "message",
				action: "sent",
				sessionKey: "agent:scope-agent:main",
				context: {},
			},
		],
		expectedMinLogLines: 3,
	});

	expect(hasLine(out.lines, "share status aaa --agent openclaw --quiet")).toBe(
		true,
	);
	expect(
		hasLine(out.lines, "share --agent openclaw --sessionId=aaa --quiet"),
	).toBe(true);
});

test("deterministic fallback uses global newest session with lexical tie-break", async () => {
	const home = await createHomeDir();
	await createSessionFile({
		home,
		agent: "alpha",
		sessionId: "k1",
		mtimeMs: 1_700_000_000_000,
	});
	await createSessionFile({
		home,
		agent: "beta",
		sessionId: "j2",
		mtimeMs: 1_900_000_000_000,
	});
	await createSessionFile({
		home,
		agent: "beta",
		sessionId: "j1",
		mtimeMs: 1_900_000_000_000,
	});

	const out = await runHookCase({
		mode: "auto",
		home,
		events: [{ type: "message", action: "sent", context: {} }],
		expectedMinLogLines: 3,
	});

	expect(hasLine(out.lines, "share status j1 --agent openclaw --quiet")).toBe(
		true,
	);
	expect(
		hasLine(out.lines, "share --agent openclaw --sessionId=j1 --quiet"),
	).toBe(true);
});

test("missing session context and no fallback sessions is a safe no-op", async () => {
	const home = await createHomeDir();
	const out = await runHookCase({
		mode: "auto",
		home,
		events: [{ type: "message", action: "sent", context: {} }],
		expectedMinLogLines: 0,
	});
	expect(out.lines).toEqual([]);
});
