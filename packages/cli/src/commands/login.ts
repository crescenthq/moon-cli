import { defineCommand } from "citty";

export const loginCommand = defineCommand({
	meta: {
		name: "login",
		description: "Login with Moon!",
	},
	run: async (args) => {
		console.log("Arguments =>", args);
	},
});
