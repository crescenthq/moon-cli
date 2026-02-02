import * as prompts from "@clack/prompts";
import { defineCommand } from "citty";
import pc from "picocolors";
import { authStore } from "../credentials/auth-store";

export const logoutCommand = defineCommand({
	meta: {
		name: "logout",
		description: "Log out from Moon",
	},
	args: {
		json: {
			type: "boolean",
			description: "Output in JSON format",
			default: false,
		},
	},
	run: async ({ args }) => {
		const jsonOutput = args.json;

		if (jsonOutput) {
			await runJsonLogout();
		} else {
			await runInteractiveLogout();
		}
	},
});

async function runJsonLogout(): Promise<void> {
	try {
		const existingAuth = await authStore.get();

		if (!existingAuth) {
			console.log(
				JSON.stringify({
					success: true,
					message: "Not logged in",
				}),
			);
			return;
		}

		await authStore.clear();

		console.log(
			JSON.stringify({
				success: true,
				message: "Logged out successfully",
			}),
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Logout failed";
		console.log(
			JSON.stringify({
				success: false,
				error: message,
			}),
		);
		process.exit(1);
	}
}

async function runInteractiveLogout(): Promise<void> {
	prompts.intro(pc.cyan("Moon CLI"));

	try {
		const existingAuth = await authStore.get();

		if (!existingAuth) {
			prompts.outro("You are not logged in.");
			return;
		}

		await authStore.clear();

		prompts.outro(pc.green("You have been logged out."));
	} catch (error) {
		const message = error instanceof Error ? error.message : "Logout failed";
		prompts.log.error(message);
		prompts.outro(pc.red("Logout failed."));
		process.exit(1);
	}
}
