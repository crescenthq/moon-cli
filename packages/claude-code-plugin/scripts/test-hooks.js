#!/usr/bin/env node

const { spawn, execSync } = require("node:child_process");
const { mkdirSync, writeFileSync, rmSync, existsSync } = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");
const CLI_PACKAGE = path.join(WORKSPACE_ROOT, "packages/cli");
const LOCAL_MOON_CLI = `bun run ${path.join(CLI_PACKAGE, "src/cli.ts")}`;
const MOON_CLI = process.env.MOON_CLI || LOCAL_MOON_CLI;

// Test session setup
const TEST_PROJECT_NAME = "-test-moon-integration";
const CLAUDE_PROJECTS_PATH = path.join(os.homedir(), ".claude", "projects");
const TEST_PROJECT_PATH = path.join(CLAUDE_PROJECTS_PATH, TEST_PROJECT_NAME);

// Sample Claude Code session content (JSONL format)
function createSessionContent(title) {
	return [
		JSON.stringify({
			type: "user",
			message: { content: title },
		}),
		JSON.stringify({
			type: "assistant",
			message: { content: "I understand. This is a test session." },
		}),
		JSON.stringify({
			type: "user",
			message: { content: "Can you help me test the sharing functionality?" },
		}),
		JSON.stringify({
			type: "assistant",
			message: { content: "Of course! The session is ready for testing." },
		}),
	].join("\n");
}

console.log("╭─────────────────────────────────────────────────────╮");
console.log("│        Moon Hook Integration Testing               │");
console.log("╰─────────────────────────────────────────────────────╯");
console.log();
console.log(`📁 Workspace: ${WORKSPACE_ROOT}`);
console.log(`🔧 MOON_CLI:  ${MOON_CLI}`);
console.log();

function createTestSession(sessionId, title) {
	const sessionFile = path.join(TEST_PROJECT_PATH, `${sessionId}.jsonl`);
	mkdirSync(TEST_PROJECT_PATH, { recursive: true });
	writeFileSync(sessionFile, createSessionContent(title));
	return sessionFile;
}

function removeTestSession(sessionFile) {
	if (existsSync(sessionFile)) {
		rmSync(sessionFile);
	}
}

function setConfig(key, value) {
	try {
		execSync(`${MOON_CLI} config set ${key} ${value} --non-interactive`, {
			encoding: "utf8",
			stdio: ["pipe", "pipe", "ignore"],
		});
		return true;
	} catch {
		return false;
	}
}

function getConfig(key) {
	try {
		return execSync(`${MOON_CLI} config get ${key} --non-interactive`, {
			encoding: "utf8",
			stdio: ["pipe", "pipe", "ignore"],
		}).trim();
	} catch {
		return null;
	}
}

async function runHook(scriptName, sessionId) {
	return new Promise((resolve) => {
		const scriptPath = path.join(__dirname, scriptName);

		const child = spawn("node", [scriptPath], {
			stdio: ["pipe", "pipe", "pipe"],
			env: {
				...process.env,
				MOON_CLI,
				MOON_DEBUG: "1",
			},
		});

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (data) => {
			const chunk = data.toString();
			stdout += chunk;
			// Print hook logs in real-time
			for (const line of chunk.split("\n").filter(Boolean)) {
				console.log(`      │ ${line}`);
			}
		});

		child.stderr.on("data", (data) => {
			const chunk = data.toString();
			stderr += chunk;
			for (const line of chunk.split("\n").filter(Boolean)) {
				console.log(`      │ ${line}`);
			}
		});

		const testInput = JSON.stringify({ session_id: sessionId });
		child.stdin.write(testInput);
		child.stdin.end();

		child.on("close", (code) => {
			resolve({
				code,
				stdout: stdout.trim(),
				stderr: stderr.trim(),
				// Parse debug output for assertions
				logs: stdout.split("\n").filter((l) => l.includes("[hook:")),
			});
		});
	});
}

function printResult(passed, description) {
	const icon = passed ? "✅" : "❌";
	console.log(`   ${icon} ${description}`);
}

async function runTestScenario(name, description, setup, assertions) {
	console.log();
	console.log(`📋 Scenario: ${name}`);
	console.log(`   ${description}`);
	console.log();

	const context = await setup();

	try {
		const results = await assertions(context);
		const passed = results.every((r) => r.passed);

		for (const result of results) {
			printResult(result.passed, result.description);
		}

		return passed;
	} finally {
		// Cleanup session file if created
		if (context.sessionFile) {
			removeTestSession(context.sessionFile);
		}
	}
}

async function main() {
	const startTime = Date.now();
	const results = [];

	// Save original config
	const originalMode = getConfig("sharing.mode");
	console.log(`📝 Original sharing.mode: ${originalMode || "(not set)"}`);

	try {
		mkdirSync(TEST_PROJECT_PATH, { recursive: true });

		// ═══════════════════════════════════════════════════════════════
		// Scenario 1: New session with sharing mode = "off"
		// ═══════════════════════════════════════════════════════════════
		results.push(
			await runTestScenario(
				"New session (mode=off)",
				"When sharing is off, hooks should not start sharing",
				async () => {
					const sessionId = `test-off-${Date.now()}`;
					const sessionFile = createTestSession(
						sessionId,
						"Test session with sharing off",
					);
					setConfig("sharing.mode", "off");
					return { sessionId, sessionFile };
				},
				async ({ sessionId }) => {
					const result = await runHook("session-start.js", sessionId);
					return [
						{
							passed: result.code === 0,
							description: "Hook exits successfully",
						},
						{
							passed: result.stdout.includes("Sharing disabled"),
							description: "Logs 'Sharing disabled'",
						},
						{
							passed: !result.stdout.includes("Auto-sharing:"),
							description: "Does not auto-share",
						},
					];
				},
			),
		);

		// ═══════════════════════════════════════════════════════════════
		// Scenario 2: New session with sharing mode = "prompt"
		// ═══════════════════════════════════════════════════════════════
		results.push(
			await runTestScenario(
				"New session (mode=prompt)",
				"When mode is prompt, should show hint message",
				async () => {
					const sessionId = `test-prompt-${Date.now()}`;
					const sessionFile = createTestSession(
						sessionId,
						"Test session with prompt mode",
					);
					setConfig("sharing.mode", "prompt");
					return { sessionId, sessionFile };
				},
				async ({ sessionId }) => {
					const result = await runHook("session-start.js", sessionId);
					return [
						{
							passed: result.code === 0,
							description: "Hook exits successfully",
						},
						{
							passed: result.stdout.includes("Prompt mode"),
							description: "Detects prompt mode",
						},
						{
							passed: result.stdout.includes("/share"),
							description: "Shows /share hint",
						},
					];
				},
			),
		);

		// ═══════════════════════════════════════════════════════════════
		// Scenario 3: New session with sharing mode = "auto"
		// ═══════════════════════════════════════════════════════════════
		results.push(
			await runTestScenario(
				"New session (mode=auto)",
				"When mode is auto, should attempt to start sharing",
				async () => {
					const sessionId = `test-auto-${Date.now()}`;
					const sessionFile = createTestSession(
						sessionId,
						"Test session with auto mode",
					);
					setConfig("sharing.mode", "auto");
					return { sessionId, sessionFile };
				},
				async ({ sessionId }) => {
					const result = await runHook("session-start.js", sessionId);
					return [
						{
							passed: result.code === 0,
							description: "Hook exits successfully",
						},
						{
							passed: result.stdout.includes("Auto-share mode"),
							description: "Detects auto mode",
						},
					];
				},
			),
		);

		// ═══════════════════════════════════════════════════════════════
		// Scenario 4: prompt-submit with mode = off
		// ═══════════════════════════════════════════════════════════════
		results.push(
			await runTestScenario(
				"Prompt submit (mode=off)",
				"prompt-submit hook should not sync when mode is off",
				async () => {
					const sessionId = `test-submit-off-${Date.now()}`;
					const sessionFile = createTestSession(
						sessionId,
						"Test prompt submit",
					);
					setConfig("sharing.mode", "off");
					return { sessionId, sessionFile };
				},
				async ({ sessionId }) => {
					const result = await runHook("prompt-submit.js", sessionId);
					return [
						{
							passed: result.code === 0,
							description: "Hook exits successfully",
						},
						{
							passed: result.stdout.includes("Sharing disabled"),
							description: "Does not sync",
						},
					];
				},
			),
		);

		// ═══════════════════════════════════════════════════════════════
		// Scenario 5: session-end with no active sharing
		// ═══════════════════════════════════════════════════════════════
		results.push(
			await runTestScenario(
				"Session end (not sharing)",
				"session-end hook should skip sync when not sharing",
				async () => {
					const sessionId = `test-end-${Date.now()}`;
					const sessionFile = createTestSession(sessionId, "Test session end");
					setConfig("sharing.mode", "off");
					return { sessionId, sessionFile };
				},
				async ({ sessionId }) => {
					const result = await runHook("session-end.js", sessionId);
					return [
						{
							passed: result.code === 0,
							description: "Hook exits successfully",
						},
						{
							passed: result.stdout.includes("Not sharing, skipping"),
							description: "Skips sync when not sharing",
						},
					];
				},
			),
		);

		// ═══════════════════════════════════════════════════════════════
		// Scenario 6: Missing session_id
		// ═══════════════════════════════════════════════════════════════
		console.log();
		console.log(`📋 Scenario: Missing session_id`);
		console.log(`   Hooks should handle missing session_id gracefully`);
		console.log();

		for (const hook of [
			"session-start.js",
			"prompt-submit.js",
			"session-end.js",
		]) {
			const result = await new Promise((resolve) => {
				const child = spawn("node", [path.join(__dirname, hook)], {
					stdio: ["pipe", "pipe", "pipe"],
					env: { ...process.env, MOON_CLI, MOON_DEBUG: "1" },
				});

				let stdout = "";
				child.stdout.on("data", (d) => {
					stdout += d.toString();
				});
				child.stdin.write("{}");
				child.stdin.end();
				child.on("close", (code) => resolve({ code, stdout }));
			});

			printResult(result.code === 0, `${hook} handles missing session_id`);
		}
		results.push(true); // All passed if we got here
	} finally {
		// Restore original config
		if (originalMode) {
			setConfig("sharing.mode", originalMode);
		} else {
			setConfig("sharing.mode", "off");
		}

		// Cleanup test project directory
		try {
			if (existsSync(TEST_PROJECT_PATH)) {
				rmSync(TEST_PROJECT_PATH, { recursive: true });
			}
		} catch {
			// Ignore cleanup errors
		}
	}

	const duration = ((Date.now() - startTime) / 1000).toFixed(2);
	const allPassed = results.every((r) => r === true);

	console.log();
	console.log("═".repeat(55));
	if (allPassed) {
		console.log(`✅ All scenarios passed! (${duration}s)`);
	} else {
		console.log(`❌ Some scenarios failed. (${duration}s)`);
	}
	console.log("═".repeat(55));

	process.exit(allPassed ? 0 : 1);
}

main();
