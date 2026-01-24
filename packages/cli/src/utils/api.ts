const API_URL = "http://mooncomputer.io/api";

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
};

const RETRY_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

async function doFetch<T>(path: string, options: RequestOptions): Promise<T> {
	const { method = "GET", body, headers = {} } = options;

	const requestHeaders: Record<string, string> = { ...headers };

	let requestBody: string | undefined;
	if (body !== undefined) {
		if (typeof body === "string") {
			requestBody = body;
			requestHeaders["Content-Type"] ??= "text/plain";
		} else {
			requestBody = JSON.stringify(body);
			requestHeaders["Content-Type"] ??= "application/json";
		}
	}

	const response = await globalThis.fetch(`${API_URL}${path}`, {
		method,
		headers: requestHeaders,
		body: requestBody,
	});

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
