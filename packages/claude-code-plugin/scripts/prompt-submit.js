#!/usr/bin/env node

const { execSync, spawn } = require("node:child_process");

const MOON_CLI = "npx --yes @moon/cli";
const DEBUG = process.env.MOON_DEBUG === "1";

function debug(...args) {
	if (DEBUG) console.log("[hook:prompt-submit]", ...args);
}

// Helper to spawn moon CLI with args
function spawnMoon(args, options = {}) {
	const parts = MOON_CLI.split(" ");
	const cmd = parts[0];
	const baseArgs = parts.slice(1);
	return spawn(cmd, [...baseArgs, ...args], options);
}

// Read stdin
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
	input += chunk;
});
process.stdin.on("end", async () => {
	try {
		await main(JSON.parse(input || "{}"));
	} catch (err) {
		debug("Error:", err.message);
	}
});

async function main(hookInput) {
	const sessionId = hookInput.session_id;
	if (!sessionId) {
		debug("No session_id provided");
		return;
	}

	debug("Processing session:", sessionId);

	// Check if already sharing
	let status;
	try {
		debug("Checking share status...");
		const result = execSync(`${MOON_CLI} share status "${sessionId}" --quiet`, {
			encoding: "utf8",
			stdio: ["pipe", "pipe", "ignore"],
		});
		const url = result.trim();
		debug("Status result:", url);
		status = { sharing: !!url, url };
	} catch (err) {
		debug("Status check failed:", err.message);
		status = { sharing: false };
	}

	if (status.sharing) {
		// Sync in background
		debug("Already sharing, syncing in background...");
		spawnMoon(["share", `--sessionId=${sessionId}`, "--quiet"], {
			detached: true,
			stdio: "ignore",
		}).unref();
	} else {
		// Check mode for auto-start
		let mode = "off";
		try {
			debug("Getting sharing mode...");
			mode = execSync(`${MOON_CLI} config get sharing.mode --quiet`, {
				encoding: "utf8",
				stdio: ["pipe", "pipe", "ignore"],
			}).trim();
			debug("Sharing mode:", mode);
		} catch (err) {
			debug("Config get failed:", err.message);
		}

		if (mode === "auto") {
			debug("Auto-share mode, starting share...");
			spawnMoon(["share", `--sessionId=${sessionId}`, "--quiet"], {
				detached: true,
				stdio: "ignore",
			}).unref();
		} else {
			debug("Sharing disabled (mode:", mode, ")");
		}
	}
}
