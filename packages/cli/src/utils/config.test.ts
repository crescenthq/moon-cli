import { test, expect, beforeEach } from "bun:test";
import { loadConfig, setConfigValue, getConfigValue } from "./config";
import { unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_FILE = join(homedir(), ".config", "moon", "config.json");

beforeEach(async () => {
	try {
		await unlink(CONFIG_FILE);
	} catch {}
});

test("config defaults to off mode", async () => {
	const config = await loadConfig();
	expect(config.sharing.mode).toBe("off");
});

test("config can be set and read", async () => {
	await setConfigValue("sharing.mode", "auto");
	const value = await getConfigValue("sharing.mode");
	expect(value).toBe("auto");
});

test("config rejects invalid mode", async () => {
	expect(setConfigValue("sharing.mode", "invalid")).rejects.toThrow();
});

test("config rejects unknown key", async () => {
	expect(setConfigValue("unknown.key", "value")).rejects.toThrow("Unknown config key");
});

test("getConfigValue returns undefined for unknown key", async () => {
	const value = await getConfigValue("unknown.key");
	expect(value).toBeUndefined();
});
