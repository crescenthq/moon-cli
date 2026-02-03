import { log } from "@clack/prompts";
import { defineCommand } from "citty";
import pc from "picocolors";
import { getConfigValue, setConfigValue } from "../utils/config";

export const configCommand = defineCommand({
	meta: {
		name: "config",
		description: "Manage Moon CLI configuration",
	},
	subCommands: {
		get: defineCommand({
			meta: {
				name: "get",
				description: "Get a config value",
			},
			args: {
				key: {
					type: "positional",
					description: "Config key (e.g., sharing.mode)",
					required: true,
				},
				quiet: {
					type: "boolean",
					description: "Output plain value for scripts/hooks",
					required: false,
				},
			},
			run: async ({ args }) => {
				const isQuiet = args.quiet;
				const value = await getConfigValue(args.key as string);
				if (value === undefined) {
					if (isQuiet) {
						console.log("");
					} else {
						log.error(pc.red(`Unknown config key: ${args.key}`));
					}
					process.exit(1);
				}
				if (isQuiet) {
					console.log(value);
				} else {
					log.info(value);
				}
			},
		}),
		set: defineCommand({
			meta: {
				name: "set",
				description: "Set a config value",
			},
			args: {
				key: {
					type: "positional",
					description: "Config key (e.g., sharing.mode)",
					required: true,
				},
				value: {
					type: "positional",
					description: "Value to set",
					required: true,
				},
			},
			run: async ({ args }) => {
				try {
					await setConfigValue(args.key as string, args.value as string);
					log.info(pc.green(`✓ ${args.key} set to "${args.value}"`));
				} catch (error) {
					log.error(pc.red((error as Error).message));
					process.exit(1);
				}
			},
		}),
	},
});
