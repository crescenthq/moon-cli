import {
	cancel,
	intro,
	isCancel,
	note,
	outro,
	select,
	spinner,
	text,
} from "@clack/prompts";
import { defineCommand } from "citty";
import pc from "picocolors";
import {
	findClaudeCodeSessions,
	formatFileSize,
	formatProjectName,
	formatRelativeTime,
} from "../utils/session-files";
import { syncSession } from "../utils/sync-client";
import { type Agent, getSyncStateBySessionId } from "../utils/sync-state";

export const shareCommand = defineCommand({
	meta: {
		name: "share",
		description: "Share your session with Moon!",
	},
	args: {
		agent: {
			type: "enum",
			description: "The agent you're sharing your session from",
			options: ["claude-code"],
			default: "claude-code",
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
		visibility: {
			type: "string",
			description:
				"Visibility of the shared session (public, unlisted, private)",
			required: false,
		},
		displaySize: {
			type: "boolean",
			description: "Displays session file sizes",
			required: false,
		},
		json: {
			type: "boolean",
			description: "Output JSON for machine parsing (implies non-interactive)",
			required: false,
		},
		"non-interactive": {
			type: "boolean",
			description: "Run without prompts (for scripts/hooks)",
			required: false,
		},
	},
	subCommands: {
		status: defineCommand({
			meta: {
				name: "status",
				description: "Check if session is currently being shared",
			},
			args: {
				sessionId: {
					type: "positional",
					description: "The session ID to check",
					required: true,
				},
				agent: {
					// TODO: Look into why we can't pass type enum here. It is breaking type inference
					type: "string",
					description: "The agent you're sharing your session from",
					options: ["claude-code"],
					default: "claude-code",
					required: false,
				},
				json: {
					type: "boolean",
					description: "Output JSON for machine parsing",
					required: false,
				},
				"non-interactive": {
					type: "boolean",
					description: "Run without prompts (for scripts/hooks)",
					required: false,
				},
			},
			run: async ({ args }) => {
				const isNonInteractive = args["non-interactive"] || args.json;

				const session = await getSyncStateBySessionId(
					args.agent as Agent,
					args.sessionId as string,
				);

				const result = {
					sharing: session?.isSharing ?? false,
					url: session?.url,
				};

				if (args.json) {
					console.log(JSON.stringify(result));
					process.exit(0);
				}

				if (isNonInteractive) {
					// Plain text output for scripts
					console.log(result.sharing ? result.url : "");
					process.exit(0);
				}

				intro(pc.bgCyan(pc.black(" Moon - Session Status ")));
				if (result.sharing) {
					note(`Sharing: ${result.url}`);
				} else {
					note("Not sharing");
				}

				process.exit(0);
			},
		}),
	},
	run: async ({ args }) => {
		const isJson = args.json;
		const isNonInteractive = args["non-interactive"] || isJson;

		const exitWithError = (message: string): never => {
			if (isJson) {
				console.log(JSON.stringify({ error: message }));
			} else {
				cancel(message);
			}
			process.exit(1);
		};

		// Only show intro in interactive mode
		if (!isNonInteractive) {
			intro(pc.bgCyan(pc.black(" Moon CLI ")));
		}

		// Default to claude-code, support other agents in the future
		const agent: Agent = (args.agent as Agent) || "claude-code";

		let sessionPath: string;
		let sessionContent: string;
		let extractedTitle: string;

		switch (agent) {
			case "claude-code": {
				const sessions = await findClaudeCodeSessions();

				if (sessions.length === 0) {
					exitWithError("No Claude Code sessions found in ~/.claude/projects/");
					return;
				}

				let selectedSession: (typeof sessions)[number];

				// If sessionId provided, find that session
				if (args.sessionId) {
					const session = sessions.find((s) => s.sessionId === args.sessionId);
					if (!session) {
						exitWithError(`Session "${args.sessionId}" not found`);
						return;
					}
					selectedSession = session;
				} else if (isNonInteractive) {
					// In non-interactive mode if a session is not passed we use most recent session
					if (!sessions[0]) {
						exitWithError(`Session not found`);
						return;
					}

					selectedSession = sessions[0];
				} else {
					const selectedPath = await select({
						message: "Select a session to share",
						maxItems: 10,
						options: sessions.slice(0, 50).map((session) => {
							const fileSize = args.displaySize
								? formatFileSize(session.size)
								: "";

							return {
								value: session.path,
								label: ` ${pc.cyan(formatProjectName(session.projectName))} ${session.title} ${fileSize} ${pc.dim(formatRelativeTime(session.modifiedAt))}`,
							};
						}),
					});

					if (isCancel(selectedPath)) {
						cancel("Operation cancelled");
						process.exit(0);
					}

					const found = sessions.find((s) => s.path === selectedPath);
					if (!found) {
						exitWithError("Session not found");
						return;
					}
					selectedSession = found;
				}

				sessionPath = selectedSession.path;
				sessionContent = selectedSession.content;
				extractedTitle = selectedSession.title;
				break;
			}

			default:
				exitWithError(`Unsupported agent: ${agent}`);
				return;
		}

		// Determine title
		let title: string;
		if (args.title) {
			title = args.title;
		} else if (isNonInteractive) {
			// In non-interactive mode, use extracted title
			title = extractedTitle;
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

		// Determine visibility
		let visibility: string;
		if (args.visibility) {
			visibility = args.visibility;
		} else if (isNonInteractive) {
			// In non-interactive mode, default to unlisted
			visibility = "unlisted";
		} else {
			const selectedVisibility = await select({
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

			if (isCancel(selectedVisibility)) {
				cancel("Operation cancelled");
				process.exit(0);
			}
			visibility = selectedVisibility as string;
		}

		// Sync session with chunked upload
		const s = isNonInteractive ? null : spinner();
		s?.start("Syncing session...");

		try {
			const result = await syncSession(agent, sessionPath, sessionContent, {
				title,
				visibility,
			});

			if (isJson) {
				console.log(
					JSON.stringify({
						success: true,
						sessionId: result.sessionId,
						url: result.url,
						isNew: result.isNew,
						newMessages: result.newMessages,
						totalMessages: result.totalMessages,
					}),
				);
			} else {
				s?.stop("Session synced!");
				outro(
					`${pc.green("✓")} Session shared!\n\n  ${pc.cyan(result.url)}\n\n  ${pc.dim("Copy this link to share with others")}`,
				);
			}
		} catch (error) {
			if (isJson) {
				console.log(
					JSON.stringify({
						error: error instanceof Error ? error.message : "Unknown error",
					}),
				);
			} else {
				s?.stop("Sync failed");
				cancel(
					`Error: ${error instanceof Error ? error.message : "Unknown error"}`,
				);
			}
			process.exit(1);
		}
	},
});
