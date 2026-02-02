import { authStore } from "../credentials/auth-store";
import { refreshAccessToken } from "./workos-auth";

const API_URL = "https://mooncomputer.io/api/";

export class FetchError extends Error {
	constructor(
		message: string,
		public status: number,
		public body?: string,
	) {
		super(message);
		this.name = "FetchError";
	}
}

type RequestOptions = {
	method?: "GET" | "POST" | "PUT" | "DELETE";
	body?: unknown;
	headers?: Record<string, string>;
	retries?: number;
	retryDelay?: number;
	skipAuth?: boolean;
};

const RETRY_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function isAbsoluteUrl(url: string): boolean {
	return url.startsWith("http://") || url.startsWith("https://");
}

async function doFetch<T>(path: string, options: RequestOptions): Promise<T> {
	const { method = "GET", body, headers = {}, skipAuth = false } = options;

	const requestHeaders: Record<string, string> = { ...headers };

	// Inject Authorization header if authenticated (auto-refreshes if needed)
	// Skip for external URLs unless explicitly using Moon API
	if (!skipAuth && !isAbsoluteUrl(path)) {
		const accessToken = await authStore.getValidAccessToken();
		if (accessToken) {
			requestHeaders.Authorization = `Bearer ${accessToken}`;
		}
	}

	let requestBody: string | URLSearchParams | undefined;
	if (body !== undefined) {
		if (body instanceof URLSearchParams) {
			requestBody = body;
			requestHeaders["Content-Type"] ??= "application/x-www-form-urlencoded";
		} else if (typeof body === "string") {
			requestBody = body;
			requestHeaders["Content-Type"] ??= "text/plain";
		} else {
			requestBody = JSON.stringify(body);
			requestHeaders["Content-Type"] ??= "application/json";
		}
	}

	// Use URL as-is if absolute, otherwise prepend API_URL
	const url = isAbsoluteUrl(path) ? path : `${API_URL}${path}`;

	const response = await globalThis.fetch(url, {
		method,
		headers: requestHeaders,
		body: requestBody,
	});

	// Handle 401 Unauthorized - try to refresh token first (only for Moon API)
	if (response.status === 401 && !isAbsoluteUrl(path)) {
		const auth = await authStore.get();
		if (auth?.refreshToken) {
			const refreshedAuth = await refreshAccessToken(auth.refreshToken);
			if (refreshedAuth) {
				// Preserve existing user info if refresh response didn't include it
				if (!refreshedAuth.user.id) {
					refreshedAuth.user = auth.user;
				}
				await authStore.set(refreshedAuth);

				// Retry the request with the new token
				requestHeaders.Authorization = `Bearer ${refreshedAuth.accessToken}`;
				const retryResponse = await globalThis.fetch(url, {
					method,
					headers: requestHeaders,
					body: requestBody,
				});

				if (retryResponse.ok) {
					return retryResponse.json() as Promise<T>;
				}
			}
		}

		// Refresh failed or no refresh token - clear auth
		await authStore.clear();
		const errorBody = await response.text();
		throw new FetchError(
			"Authentication expired. Please run 'moon login' again.",
			response.status,
			errorBody,
		);
	}

	if (!response.ok) {
		const errorBody = await response.text();
		throw new FetchError(
			`Request failed: ${response.status}`,
			response.status,
			errorBody,
		);
	}

	return response.json() as Promise<T>;
}

export async function fetch<T>(
	path: string,
	options: RequestOptions = {},
): Promise<T> {
	const { retries = 3, retryDelay = 1000, ...fetchOptions } = options;

	let lastError: Error | undefined;

	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			return await doFetch<T>(path, fetchOptions);
		} catch (error) {
			lastError = error as Error;

			const shouldRetry =
				attempt < retries &&
				(error instanceof FetchError
					? RETRY_STATUS_CODES.has(error.status)
					: error instanceof TypeError); // Network errors

			if (!shouldRetry) {
				throw error;
			}

			await new Promise((resolve) =>
				setTimeout(resolve, retryDelay * 2 ** attempt),
			);
		}
	}

	throw lastError;
}

export { API_URL };
