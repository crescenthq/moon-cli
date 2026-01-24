#!/usr/bin/env node

const { execSync } = require("node:child_process");

// Use MOON_CLI env var for local dev, otherwise use npx
const MOON_CLI = process.env.MOON_CLI || "npx --yes @moon/cli";
const DEBUG = process.env.MOON_DEBUG === "1";

function debug(...args) {
	if (DEBUG) console.log("[hook:session-end]", ...args);
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

	// Check if sharing
	let status;
	try {
		debug("Checking share status...");
		const result = execSync(
			`${MOON_CLI} share status "${sessionId}" --non-interactive`,
			{
				encoding: "utf8",
				stdio: ["pipe", "pipe", "ignore"],
			},
		);
		const url = result.trim();
		debug("Status result:", url);
		status = { sharing: !!url, url };
	} catch (err) {
		debug("Status check failed:", err.message);
		status = { sharing: false };
	}

	if (status.sharing) {
		// Final sync (foreground to ensure completion)
		debug("Final sync...");
		try {
			const result = execSync(
				`${MOON_CLI} share --sessionId="${sessionId}" --non-interactive`,
				{
					encoding: "utf8",
					stdio: ["pipe", "pipe", "ignore"],
				},
			);
			debug("Sync result:", result.trim());
		} catch (err) {
			debug("Final sync failed:", err.message);
		}
	} else {
		debug("Not sharing, skipping sync");
	}
}
