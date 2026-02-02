import * as prompts from "@clack/prompts";
import { defineCommand } from "citty";
import open from "open";
import pc from "picocolors";
import { authStore } from "../credentials/auth-store";
import { setConfigValue } from "../utils/config";
import {
	DeviceAuthError,
	type DeviceAuthorizationResponse,
	pollForToken,
	requestDeviceAuthorization,
} from "../utils/workos-auth";

export const loginCommand = defineCommand({
	meta: {
		name: "login",
		description: "Authenticate with Moon",
	},
	args: {
		json: {
			type: "boolean",
			description: "Output in JSON format",
			default: false,
		},
		quiet: {
			type: "boolean",
			description: "Suppress terminal UI (browser still opens for auth)",
			default: false,
		},
	},
	run: async ({ args }) => {
		const jsonOutput = args.json;
		const quiet = args.quiet;

		if (jsonOutput) {
			await runJsonLogin(quiet);
		} else {
			await runInteractiveLogin(quiet);
		}
	},
});

async function runJsonLogin(_quiet: boolean): Promise<void> {
	try {
		// Check if already authenticated
		const existingAuth = await authStore.get();
		if (existingAuth && (await authStore.isAuthenticated())) {
			console.log(
				JSON.stringify({
					status: "already_authenticated",
					user: existingAuth.user,
				}),
			);
			return;
		}

		// Request device authorization
		const deviceAuth = await requestDeviceAuthorization();

		console.log(
			JSON.stringify({
				status: "awaiting_authorization",
				userCode: deviceAuth.user_code,
				verificationUri: deviceAuth.verification_uri,
				verificationUriComplete: deviceAuth.verification_uri_complete,
				expiresIn: deviceAuth.expires_in,
			}),
		);

		await open(deviceAuth.verification_uri_complete);

		// Poll for token
		const auth = await pollForToken({
			deviceCode: deviceAuth.device_code,
			interval: deviceAuth.interval,
			expiresIn: deviceAuth.expires_in,
		});

		// Store auth
		await authStore.set(auth);
		await setConfigValue("sharing.mode", "auto");

		console.log(
			JSON.stringify({
				success: true,
				user: auth.user,
			}),
		);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Authentication failed";
		console.log(
			JSON.stringify({
				success: false,
				error: message,
			}),
		);
		process.exit(1);
	}
}

async function runInteractiveLogin(quiet: boolean): Promise<void> {
	prompts.intro(pc.cyan("Moon CLI"));

	try {
		// Check if already authenticated
		const existingAuth = await authStore.get();
		if (existingAuth && (await authStore.isAuthenticated())) {
			const shouldReauth = await prompts.confirm({
				message: `Already logged in as ${pc.cyan(existingAuth.user.email)}. Re-authenticate?`,
			});

			if (prompts.isCancel(shouldReauth) || !shouldReauth) {
				prompts.outro("Login cancelled.");
				return;
			}

			// Clear existing auth to re-authenticate
			await authStore.clear();
		}

		// Request device authorization
		const deviceAuthSpinner = prompts.spinner();
		deviceAuthSpinner.start("Preparing authentication...");

		let deviceAuth: DeviceAuthorizationResponse;
		try {
			deviceAuth = await requestDeviceAuthorization();
			deviceAuthSpinner.stop("Ready for authentication");
		} catch (error) {
			deviceAuthSpinner.stop("Failed to connect");
			throw error;
		}

		// Display code and URL
		prompts.note(
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
			if (!quiet) {
				prompts.log.info("Browser opened automatically");
			}
		} catch {
			if (!quiet) {
				prompts.log.warn(
					"Could not open browser. Please open the link manually.",
				);
			}
		}

		// Poll for token
		const pollSpinner = prompts.spinner();
		pollSpinner.start("Waiting for authorization...");

		try {
			const auth = await pollForToken({
				deviceCode: deviceAuth.device_code,
				interval: deviceAuth.interval,
				expiresIn: deviceAuth.expires_in,
			});

			pollSpinner.stop("Authorization successful!");

			// Store auth
			await authStore.set(auth);
			await setConfigValue("sharing.mode", "auto");

			const displayName = auth.user.firstName || auth.user.email;
			prompts.outro(pc.green(`Welcome, ${displayName}! You're now logged in.`));
		} catch (error) {
			if (error instanceof DeviceAuthError) {
				pollSpinner.stop(error.message);
				prompts.outro(pc.red("Login failed."));
				process.exit(1);
			}
			throw error;
		}
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Authentication failed";
		prompts.log.error(message);
		prompts.outro(pc.red("Login failed."));
		process.exit(1);
	}
}
