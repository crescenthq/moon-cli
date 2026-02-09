import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod/mini";

const UserSchema = z.object({
	id: z.string(),
	email: z.string(),
	firstName: z.optional(z.nullable(z.string())),
	lastName: z.optional(z.nullable(z.string())),
});

const StoredAuthSchema = z.object({
	accessToken: z.string(),
	refreshToken: z.string(),
	user: UserSchema,
	skipWrite: z.optional(z.boolean()),
});

// Types
export type StoredUser = z.infer<typeof UserSchema>;
export type StoredAuth = z.infer<typeof StoredAuthSchema>;

// Path resolution - respects XDG_CONFIG_HOME, or defaults to ~/.config
function getConfigPath(): string {
	const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
	return join(configHome, "moon", "auth.json");
}

export function createAuthStore() {
	const configPath = getConfigPath();

	async function ensureDir(): Promise<void> {
		await mkdir(dirname(configPath), { recursive: true });
	}

	async function readAuthFile(): Promise<StoredAuth | null> {
		try {
			const content = await readFile(configPath, "utf-8");
			return StoredAuthSchema.parse(JSON.parse(content));
		} catch {
			// Ignore if file doesn't exist
			return null;
		}
	}

	async function writeAuthFile(auth: StoredAuth): Promise<void> {
		await ensureDir();
		await writeFile(configPath, JSON.stringify(auth, null, 2), { mode: 0o600 });
	}

	async function deleteAuthFile(): Promise<void> {
		try {
			await unlink(configPath);
		} catch {
			// Ignore if doesn't exist
		}
	}

	return {
		configPath,

		async get(): Promise<StoredAuth | null> {
			// MOON_TOKEN environment variable
			const envToken = process.env.MOON_TOKEN;
			if (envToken) {
				return {
					accessToken: envToken,
					refreshToken: "",
					user: { id: "", email: "" },
				};
			}

			// File storage
			return readAuthFile();
		},

		async set(auth: StoredAuth & { skipWrite?: boolean }): Promise<void> {
			if (auth.skipWrite) {
				return;
			}

			await writeAuthFile(auth);
		},

		async clear(): Promise<void> {
			await deleteAuthFile();
		},

		async isAuthenticated(): Promise<boolean> {
			const auth = await this.get();
			return auth !== null;
		},

		async getAccessToken(): Promise<string | null> {
			const auth = await this.get();
			return auth?.accessToken ?? null;
		},

		async getValidAccessToken(): Promise<string | null> {
			const auth = await this.get();
			return auth?.accessToken ?? null;
		},

		async requiresLogin(): Promise<boolean> {
			const auth = await this.get();
			return auth === null;
		},
	};
}

// Singleton instance
export const authStore = createAuthStore();
