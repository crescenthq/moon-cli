import { afterEach, beforeEach, expect, test } from "bun:test";
import { authStore, type StoredAuth } from "../credentials/auth-store";
import { fetch as apiFetch, FetchError } from "./api";

const originalFetch = globalThis.fetch;
const originalAuthStore = {
	get: authStore.get,
	set: authStore.set,
	clear: authStore.clear,
	getValidAccessToken: authStore.getValidAccessToken,
};

let currentAuth: StoredAuth | null = null;
let clearCalls = 0;
let setHistory: StoredAuth[] = [];

function createAuth(accessToken: string, refreshToken: string): StoredAuth {
	return {
		accessToken,
		refreshToken,
		user: {
			id: "user_123",
			email: "test@example.com",
		},
	};
}

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json",
		},
	});
}

function getAuthorizationHeader(init?: RequestInit): string | null {
	const headers = init?.headers;
	if (!headers) {
		return null;
	}

	if (headers instanceof Headers) {
		return headers.get("Authorization");
	}

	if (Array.isArray(headers)) {
		const authHeader = headers.find(
			([name = ""]) => name.toLowerCase() === "authorization",
		);
		return authHeader?.[1] ?? null;
	}

	const record = headers as Record<string, string>;
	return record.Authorization ?? record.authorization ?? null;
}

beforeEach(() => {
	clearCalls = 0;
	setHistory = [];
	currentAuth = null;

	authStore.get = async () => currentAuth;
	authStore.getValidAccessToken = async () => currentAuth?.accessToken ?? null;
	authStore.set = async (auth: StoredAuth & { skipWrite?: boolean }) => {
		currentAuth = {
			accessToken: auth.accessToken,
			refreshToken: auth.refreshToken,
			user: auth.user,
		};
		setHistory.push(currentAuth);
	};
	authStore.clear = async () => {
		clearCalls += 1;
		currentAuth = null;
	};
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	authStore.get = originalAuthStore.get;
	authStore.set = originalAuthStore.set;
	authStore.clear = originalAuthStore.clear;
	authStore.getValidAccessToken = originalAuthStore.getValidAccessToken;
});

test("keeps auth when refreshed retry fails with non-401", async () => {
	currentAuth = createAuth("old-access", "old-refresh");

	let moonCalls = 0;
	globalThis.fetch = (async (
		input: string | URL | Request,
		init?: RequestInit,
	) => {
		const url = String(input);

		if (url.startsWith("https://moon.page/api/")) {
			moonCalls += 1;
			if (moonCalls === 1) {
				return new Response("expired", { status: 401 });
			}

			expect(getAuthorizationHeader(init)).toBe("Bearer new-access");
			return new Response("server error", { status: 500 });
		}

		if (url === "https://api.workos.com/user_management/authenticate") {
			return jsonResponse({
				access_token: "new-access",
				refresh_token: "new-refresh",
			});
		}

		throw new Error(`Unexpected URL: ${url}`);
	}) as typeof globalThis.fetch;

	let thrown: unknown;
	try {
		await apiFetch<{ ok: true }>("sessions", { retries: 0 });
	} catch (error) {
		thrown = error;
	}

	expect(thrown).toBeInstanceOf(FetchError);
	if (thrown instanceof FetchError) {
		expect(thrown.status).toBe(500);
		expect(thrown.message).toBe("Request failed: 500");
	}

	expect(clearCalls).toBe(0);
	expect(setHistory).toHaveLength(1);
	expect(setHistory[0]?.refreshToken).toBe("new-refresh");
});

test("retries with latest stored token when refresh races", async () => {
	const staleAuth = createAuth("stale-access", "stale-refresh");
	const rotatedAuth = createAuth("rotated-access", "rotated-refresh");
	currentAuth = staleAuth;

	let moonCalls = 0;
	globalThis.fetch = (async (
		input: string | URL | Request,
		init?: RequestInit,
	) => {
		const url = String(input);

		if (url.startsWith("https://moon.page/api/")) {
			moonCalls += 1;
			if (moonCalls === 1) {
				expect(getAuthorizationHeader(init)).toBe("Bearer stale-access");
				return new Response("expired", { status: 401 });
			}

			expect(getAuthorizationHeader(init)).toBe("Bearer rotated-access");
			return jsonResponse({ ok: true });
		}

		if (url === "https://api.workos.com/user_management/authenticate") {
			// Simulate another process completing refresh token rotation first.
			currentAuth = rotatedAuth;
			return jsonResponse({ error: "invalid_grant" }, 400);
		}

		throw new Error(`Unexpected URL: ${url}`);
	}) as typeof globalThis.fetch;

	const result = await apiFetch<{ ok: boolean }>("sessions", { retries: 0 });

	expect(result.ok).toBe(true);
	expect(clearCalls).toBe(0);
	expect(currentAuth?.refreshToken).toBe("rotated-refresh");
});

test("preserves refresh token when refresh response omits it", async () => {
	currentAuth = createAuth("old-access", "keep-refresh");

	let moonCalls = 0;
	globalThis.fetch = (async (
		input: string | URL | Request,
		init?: RequestInit,
	) => {
		const url = String(input);

		if (url.startsWith("https://moon.page/api/")) {
			moonCalls += 1;
			if (moonCalls === 1) {
				return new Response("expired", { status: 401 });
			}

			expect(getAuthorizationHeader(init)).toBe("Bearer refreshed-access");
			return jsonResponse({ ok: true });
		}

		if (url === "https://api.workos.com/user_management/authenticate") {
			return jsonResponse({ access_token: "refreshed-access" });
		}

		throw new Error(`Unexpected URL: ${url}`);
	}) as typeof globalThis.fetch;

	const result = await apiFetch<{ ok: boolean }>("sessions", { retries: 0 });

	expect(result.ok).toBe(true);
	expect(clearCalls).toBe(0);
	expect(setHistory).toHaveLength(1);
	expect(setHistory[0]?.refreshToken).toBe("keep-refresh");
});
