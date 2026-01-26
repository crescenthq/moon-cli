import { clearStoredAuth, getValidAccessToken } from "./keychain";

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
		const accessToken = await getValidAccessToken();
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

	// Handle 401 Unauthorized - clear stored auth (only for Moon API)
	if (response.status === 401 && !isAbsoluteUrl(path)) {
		await clearStoredAuth();
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
