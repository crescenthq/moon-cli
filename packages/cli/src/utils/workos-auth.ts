import { FetchError, fetch } from "./api";
import type { StoredAuth, StoredUser } from "./keychain";

const WORKOS_API_URL = "https://api.workos.com/user_management";
const WORKOS_CLIENT_ID = "client_01KFTHN2BEHPN4JBCFXS6XS0PP";

export type DeviceAuthorizationResponse = {
	device_code: string;
	user_code: string;
	verification_uri: string;
	verification_uri_complete: string;
	expires_in: number;
	interval: number;
};

export type AuthenticationResponse = {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	user: {
		id: string;
		email: string;
		first_name?: string;
		last_name?: string;
	};
};

export type PollError =
	| "authorization_pending"
	| "slow_down"
	| "access_denied"
	| "expired_token";

export class DeviceAuthError extends Error {
	constructor(
		message: string,
		public code: PollError,
	) {
		super(message);
		this.name = "DeviceAuthError";
	}
}

export async function requestDeviceAuthorization(): Promise<DeviceAuthorizationResponse> {
	return fetch<DeviceAuthorizationResponse>(
		`${WORKOS_API_URL}/authorize/device`,
		{
			method: "POST",
			body: new URLSearchParams({
				client_id: WORKOS_CLIENT_ID,
			}),
		},
	);
}

type AuthenticateOptions = {
	deviceCode: string;
	onSlowDown?: () => void;
};

export async function authenticate({
	deviceCode,
}: AuthenticateOptions): Promise<AuthenticationResponse> {
	try {
		return await fetch<AuthenticationResponse>(
			`${WORKOS_API_URL}/authenticate`,
			{
				method: "POST",
				body: new URLSearchParams({
					client_id: WORKOS_CLIENT_ID,
					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
					device_code: deviceCode,
				}),
				retries: 0, // Don't retry auth polling
			},
		);
	} catch (error) {
		if (error instanceof FetchError && error.body) {
			try {
				const errorBody = JSON.parse(error.body) as { error?: string };
				if (errorBody.error) {
					throw new DeviceAuthError(
						`Authentication failed: ${errorBody.error}`,
						errorBody.error as PollError,
					);
				}
			} catch (parseError) {
				if (parseError instanceof DeviceAuthError) throw parseError;
			}
		}
		throw error;
	}
}

type PollOptions = {
	deviceCode: string;
	interval: number;
	expiresIn: number;
	signal?: AbortSignal;
};

export async function pollForToken({
	deviceCode,
	interval,
	expiresIn,
	signal,
}: PollOptions): Promise<StoredAuth> {
	const startTime = Date.now();
	const expiresAt = startTime + expiresIn * 1000;
	const pollInterval = interval * 1000;

	while (Date.now() < expiresAt) {
		if (signal?.aborted) {
			throw new Error("Polling cancelled");
		}

		try {
			const response = await authenticate({
				deviceCode,
			});

			const user: StoredUser = {
				id: response.user.id,
				email: response.user.email,
				firstName: response.user.first_name,
				lastName: response.user.last_name,
			};

			return {
				accessToken: response.access_token,
				refreshToken: response.refresh_token,
				expiresAt: Date.now() / 1000 + response.expires_in,
				user,
			};
		} catch (error) {
			if (error instanceof DeviceAuthError) {
				if (
					error.code === "authorization_pending" ||
					error.code === "slow_down"
				) {
					await sleep(pollInterval);
					continue;
				}
				// access_denied or expired_token - re-throw
				throw error;
			}
			throw error;
		}
	}

	throw new DeviceAuthError("Code expired. Please try again.", "expired_token");
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export type RefreshTokenResponse = {
	access_token: string;
	refresh_token: string;
	expires_in: number;
};

export async function refreshAccessToken(
	refreshToken: string,
): Promise<StoredAuth | null> {
	try {
		const data = await fetch<
			RefreshTokenResponse & { user?: AuthenticationResponse["user"] }
		>(`${WORKOS_API_URL}/authenticate`, {
			method: "POST",
			body: new URLSearchParams({
				client_id: WORKOS_CLIENT_ID,
				grant_type: "refresh_token",
				refresh_token: refreshToken,
			}),
			retries: 0,
		});

		return {
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			expiresAt: Date.now() / 1000 + data.expires_in,
			user: data.user
				? {
						id: data.user.id,
						email: data.user.email,
						firstName: data.user.first_name,
						lastName: data.user.last_name,
					}
				: { id: "", email: "" },
		};
	} catch {
		return null;
	}
}
