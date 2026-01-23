import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "moon");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export type SharingMode = "off" | "prompt" | "auto";

export type MoonConfig = {
	sharing: {
		mode: SharingMode;
	};
};

const DEFAULT_CONFIG: MoonConfig = {
	sharing: {
		mode: "off",
	},
};

async function ensureConfigDir(): Promise<void> {
	await mkdir(CONFIG_DIR, { recursive: true });
}

export async function loadConfig(): Promise<MoonConfig> {
	try {
		const content = await readFile(CONFIG_FILE, "utf-8");
		const parsed = JSON.parse(content);
		return { ...DEFAULT_CONFIG, ...parsed };
	} catch {
		return DEFAULT_CONFIG;
	}
}

export async function saveConfig(config: MoonConfig): Promise<void> {
	await ensureConfigDir();
	await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function getConfigValue(key: string): Promise<string | undefined> {
	const config = await loadConfig();

	// Support dot notation: "sharing.mode"
	const parts = key.split(".");
	let value: unknown = config;

	for (const part of parts) {
		if (value && typeof value === "object" && part in value) {
			value = (value as Record<string, unknown>)[part];
		} else {
			return undefined;
		}
	}

	return typeof value === "string" ? value : undefined;
}

export async function setConfigValue(
	key: string,
	value: string,
): Promise<void> {
	const config = await loadConfig();

	// Currently only support "sharing.mode"
	if (key === "sharing.mode") {
		const validModes: SharingMode[] = ["off", "prompt", "auto"];
		if (!validModes.includes(value as SharingMode)) {
			throw new Error(
				`Invalid value "${value}". Must be one of: ${validModes.join(", ")}`,
			);
		}
		config.sharing.mode = value as SharingMode;
	} else {
		throw new Error(`Unknown config key: ${key}`);
	}

	await saveConfig(config);
}
