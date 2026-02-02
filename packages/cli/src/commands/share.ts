import {
	cancel,
	intro,
	isCancel,
	log,
	note,
	outro,
	select,
	spinner,
	text,
} from "@clack/prompts";
import { defineCommand } from "citty";
import open from "open";
import pc from "picocolors";
import { authStore } from "../credentials/auth-store";
import {
	filterSessionsForDisplay,
	findClaudeCodeSessions,
	findSessionById,
	formatFileSize,
	formatProjectName,
	formatRelativeTime,
} from "../utils/session-files";
import { syncSession } from "../utils/sync-client";
import { type Agent, getSyncStateBySessionId } from "../utils/sync-state";
import {
	DeviceAuthError,
	pollForToken,
	requestDeviceAuthorization,
} from "../utils/workos-auth";

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
		quiet: {
			type: "boolean",
			description: "Suppress terminal UI (browser still opens for auth)",
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
				quiet: {
					type: "boolean",
					description: "Suppress terminal UI (browser still opens for auth)",
					required: false,
				},
			},
			run: async ({ args }) => {
				const isQuiet = args.quiet || args.json;

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

				if (isQuiet) {
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
		const isQuiet = args.quiet || isJson;

		const exitWithError = (message: string): never => {
			if (isJson) {
				console.log(JSON.stringify({ error: message }));
			} else {
				cancel(message);
			}
			process.exit(1);
		};

		// Only show intro in non-quiet mode
		if (!isQuiet) {
			intro(pc.bgCyan(pc.black(" Moon CLI ")));
		}

		// Check if user is logged in, trigger login flow if needed
		if (await authStore.requiresLogin()) {
			// In quiet mode, return structured error for agent to handle
			if (isQuiet) {
				console.log(
					JSON.stringify({
						error: "authentication_required",
						message: "Login required to share sessions",
						action: {
							command: "moon login",
							description:
								"Authenticate with Moon to enable session sharing. This creates a free account that lets you generate shareable URLs for your coding sessions.",
						},
					}),
				);
				process.exit(1);
			}

			// Interactive mode: inline login flow
			log.warn("Sharing requires a Moon login. Starting sign-in...");
			log.message(pc.dim("Press Ctrl+C to cancel."));

			const loginSpinner = spinner();
			loginSpinner.start("Preparing authentication...");

			try {
				const deviceAuth = await requestDeviceAuthorization();
				loginSpinner.stop("Ready for authentication");

				note(
					[
						`${pc.bold("Your code:")} ${pc.cyan(pc.bold(deviceAuth.user_code))}`,
						"",
						`${pc.bold("Visit:")} ${pc.underline(deviceAuth.verification_uri)}`,
						"",
						pc.dim("Or open this link directly:"),
						pc.dim(pc.underline(deviceAuth.verification_uri_complete)),
					].join("\n"),
					"Authorize Moon CLI",
				);

				try {
					await open(deviceAuth.verification_uri_complete);
					log.info("Browser opened automatically");
				} catch {
					log.warn("Could not open browser. Please open the link manually.");
				}

				const pollSpinner = spinner();
				pollSpinner.start("Waiting for authorization...");

				const auth = await pollForToken({
					deviceCode: deviceAuth.device_code,
					interval: deviceAuth.interval,
					expiresIn: deviceAuth.expires_in,
				});

				await authStore.set(auth);
				pollSpinner.stop("Login successful!");
			} catch (error) {
				if (error instanceof DeviceAuthError) {
					cancel(error.message);
					process.exit(1);
				}
				throw error;
			}
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
					const session = findSessionById(sessions, args.sessionId);
					if (!session) {
						exitWithError(`Session "${args.sessionId}" not found`);
						return;
					}
					selectedSession = session;
				} else if (isQuiet) {
					// In non-interactive mode if a session is not passed we use most recent session
					if (!sessions[0]) {
						exitWithError(`Session not found`);
						return;
					}

					selectedSession = sessions[0];
				} else {
					const displaySessions = filterSessionsForDisplay(sessions);

					if (displaySessions.length === 0) {
						exitWithError("No shareable sessions found");
						return;
					}

					const selectedPath = await select({
						message: "Select a session to share",
						maxItems: 10,
						options: displaySessions.slice(0, 50).map((session) => {
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

					const found = displaySessions.find((s) => s.path === selectedPath);
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
		} else if (isQuiet) {
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
		} else if (isQuiet) {
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
		const s = isQuiet ? null : spinner();
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
