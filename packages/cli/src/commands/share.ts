import {
	cancel,
	intro,
	isCancel,
	outro,
	select,
	spinner,
	text,
} from "@clack/prompts";
import { defineCommand } from "citty";
import pc from "picocolors";
import {
	findClaudeCodeSessions,
	formatProjectName,
	formatRelativeTime,
} from "../utils/session-files";

const API_URL = "http://localhost:8787";

type Agent = "claude-code";

export const shareCommand = defineCommand({
	meta: {
		name: "share",
		description: "Share your session with Moon!",
	},
	args: {
		agent: {
			type: "string",
			description: "The agent you're sharing your session from",
			required: false,
		},
		sessionId: {
			type: "string",
			description: "The session ID to share",
			required: false,
		},
		title: {
			type: "string",
			description: "Custom title for the shared session",
			required: false,
		},
	},
	run: async ({ args }) => {
		intro(pc.bgCyan(pc.black(" Moon CLI ")));

		// Default to claude-code, support other agents in the future
		const agent: Agent = (args.agent as Agent) || "claude-code";

		let sessionContent: string;
		let extractedTitle: string;

		switch (agent) {
			case "claude-code": {
				const sessions = await findClaudeCodeSessions();

				if (sessions.length === 0) {
					cancel("No Claude Code sessions found in ~/.claude/projects/");
					process.exit(1);
				}

				let selectedSession: (typeof sessions)[number];

				// If sessionId provided, find that session
				if (args.sessionId) {
					const session = sessions.find((s) => s.sessionId === args.sessionId);
					if (!session) {
						cancel(`Session "${args.sessionId}" not found`);
						process.exit(1);
					}
					selectedSession = session;
				} else {
					const selectedPath = await select({
						message: "Select a session to share",
						maxItems: 10,
						options: sessions.slice(0, 50).map((session) => ({
							value: session.path,
							label: ` ${pc.cyan(formatProjectName(session.projectName))}  ${session.title}  ${pc.dim(formatRelativeTime(session.modifiedAt))}`,
						})),
					});

					if (isCancel(selectedPath)) {
						cancel("Operation cancelled");
						process.exit(0);
					}

					const found = sessions.find((s) => s.path === selectedPath);
					if (!found) {
						cancel("Session not found");
						process.exit(1);
					}
					selectedSession = found;
				}

				sessionContent = selectedSession.content;
				extractedTitle = selectedSession.title;
				break;
			}

			default:
				cancel(`Unsupported agent: ${agent}`);
				process.exit(1);
		}

		// Allow user to set custom title
		let title: string;
		if (args.title) {
			title = args.title;
		} else {
			const customTitle = await text({
				message: "Title for your session",
				placeholder: extractedTitle,
				defaultValue: extractedTitle,
			});

			if (isCancel(customTitle)) {
				cancel("Operation cancelled");
				process.exit(0);
			}

			title = customTitle || extractedTitle;
		}

		// Prompt for visibility
		const visibility = await select({
			message: "Who can view this session?",
			options: [
				{ value: "public", label: "Public", hint: "Anyone with the link" },
				{
					value: "unlisted",
					label: "Unlisted",
					hint: "Only people with the link",
				},
				{ value: "private", label: "Private", hint: "Only you" },
			],
		});

		if (isCancel(visibility)) {
			cancel("Operation cancelled");
			process.exit(0);
		}

		// Upload to backend
		const s = spinner();
		s.start("Uploading session...");

		try {
			const sessionId = crypto.randomUUID();

			const response = await fetch(`${API_URL}/sessions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					sessionId,
					title,
					visibility,
					content: sessionContent,
				}),
			});

			if (!response.ok) {
				const error = await response.text();
				throw new Error(`Upload failed: ${error}`);
			}

			s.stop("Session uploaded!");

			const sessionUrl = `${API_URL}/sessions/${sessionId}`;
			outro(
				`${pc.green("✓")} Session shared!\n\n  ${pc.cyan(sessionUrl)}\n\n  ${pc.dim("Copy this link to share with others")}`,
			);
		} catch (error) {
			s.stop("Upload failed");
			cancel(
				`Error: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			process.exit(1);
		}
	},
});
