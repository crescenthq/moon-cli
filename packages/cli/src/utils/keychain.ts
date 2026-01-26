import { Entry } from "@napi-rs/keyring";
import { refreshAccessToken } from "./workos-auth";

const SERVICE = "moon-cli";
const ACCOUNT = "auth";

export type StoredUser = {
	id: string;
	email: string;
	firstName?: string;
	lastName?: string;
};

export type StoredAuth = {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	user: StoredUser;
};

function getEntry(): Entry {
	return new Entry(SERVICE, ACCOUNT);
}

export async function getStoredAuth(): Promise<StoredAuth | null> {
	try {
		const entry = getEntry();
		const data = entry.getPassword();
		return data ? JSON.parse(data) : null;
	} catch {
		return null;
	}
}

export async function setStoredAuth(auth: StoredAuth): Promise<void> {
	const entry = getEntry();
	entry.setPassword(JSON.stringify(auth));
}

export async function clearStoredAuth(): Promise<void> {
	try {
		const entry = getEntry();
		entry.deletePassword();
	} catch {
		// Ignore errors if entry doesn't exist
	}
}

export async function isAuthenticated(): Promise<boolean> {
	const auth = await getStoredAuth();
	if (!auth) return false;
	// Check if token expires in more than 60 seconds
	return auth.expiresAt > Date.now() / 1000 + 60;
}

export async function getAccessToken(): Promise<string | null> {
	const auth = await getStoredAuth();
	if (!auth) return null;
	// Return null if token is expired (with 60 second buffer)
	if (auth.expiresAt <= Date.now() / 1000 + 60) return null;
	return auth.accessToken;
}

export async function requiresLogin(): Promise<boolean> {
	const auth = await getStoredAuth();
	if (!auth) return true;

	const now = Date.now() / 1000;

	// If token is valid, no login required
	if (auth.expiresAt > now + 60) {
		return false;
	}

	// Try to refresh the token
	const refreshedAuth = await refreshAccessToken(auth.refreshToken);
	if (!refreshedAuth) {
		await clearStoredAuth();
		return true;
	}

	// Preserve existing user info if refresh response didn't include it
	if (!refreshedAuth.user.id) {
		refreshedAuth.user = auth.user;
	}

	await setStoredAuth(refreshedAuth);
	return false;
}

export async function getValidAccessToken(): Promise<string | null> {
	const auth = await getStoredAuth();
	if (!auth) return null;

	const now = Date.now() / 1000;

	// If token is still valid (with 60 second buffer), return it
	if (auth.expiresAt > now + 60) {
		return auth.accessToken;
	}

	// Try to refresh the token
	const refreshedAuth = await refreshAccessToken(auth.refreshToken);
	if (!refreshedAuth) {
		// Refresh failed - clear auth and return null
		await clearStoredAuth();
		return null;
	}

	// Preserve existing user info if refresh response didn't include it
	if (!refreshedAuth.user.id) {
		refreshedAuth.user = auth.user;
	}

	await setStoredAuth(refreshedAuth);
	return refreshedAuth.accessToken;
}
