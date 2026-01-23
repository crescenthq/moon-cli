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
		displaySize: {
			type: "boolean",
			description: "Displays session file sizes",
			required: false,
		},
		json: {
			type: "boolean",
			description: "Output JSON for machine parsing",
			required: false,
		},
	},
	subCommands: {
		status: defineCommand({
			meta: {
				name: "share",
				description: "Check if session is currently being shared",
			},
			args: {
				sessionId: {
					type: "string",
					description: "The session ID to share",
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
			},
			run: async ({ args }) => {
				const session = await getSyncStateBySessionId(
					args.agent as Agent,
					args.sessionId,
				);

				const result = {
					sharing: session?.isSharing ?? false,
					url: session?.url,
				};

				if (args.json) {
					console.log(JSON.stringify(result));
					process.exit(0);
				}

				intro(pc.bgCyan(pc.black(" Moon - Session Status ")));
				note(`Sharing: ${result.url}`);

				process.exit(0);
			},
		}),
	},
	run: async ({ args }) => {
		intro(pc.bgCyan(pc.black(" Moon CLI ")));

		// Default to claude-code, support other agents in the future
		const agent: Agent = (args.agent as Agent) || "claude-code";

		let sessionPath: string;
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
						cancel("Session not found");
						process.exit(1);
					}
					selectedSession = found;
				}

				sessionPath = selectedSession.path;
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

		// Sync session with chunked upload
		const s = spinner();
		s.start("Syncing session...");

		try {
			const result = await syncSession(agent, sessionPath, sessionContent, {
				title,
				visibility: visibility as string,
			});

			s.stop("Session synced!");

			outro(
				`${pc.green("✓")} Session shared!\n\n  ${pc.cyan(result.url)}\n\n  ${pc.dim("Copy this link to share with others")}`,
			);
		} catch (error) {
			s.stop("Sync failed");
			cancel(
				`Error: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			process.exit(1);
		}
	},
});
