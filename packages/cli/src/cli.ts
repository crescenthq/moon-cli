#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import pkg from "../package.json" with { type: "json" };
import { loginCommand } from "./commands/login";
import { shareCommand } from "./commands/share";

const mainCommand = defineCommand({
	meta: {
		name: pkg.name,
		version: pkg.version,
		description: pkg.description,
	},
	subCommands: {
		share: shareCommand,
		login: loginCommand,
	},
});

runMain(mainCommand);
