import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DiscoveredModel } from './types';

const LOG_FILE = join(tmpdir(), 'olma-debug.log');

export function logDebug(message: string): void {
	try {
		appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`);
	} catch {}
}

export interface ProviderHealth {
	reachable: boolean;
	error?: string;
	modelCount?: number;
}

function extractApiErrorMessage(err: unknown, context: string): string {
	if (err instanceof Error) {
		let msg = err.message;

		if (typeof msg === 'string' && msg.includes('Upstream request failed') && msg.includes('unavailable')) {
			return `${context}: The model provider endpoint returned an error. Check that the server is running and the URL is correct.`;
		}

		if (msg.includes('ECONNREFUSED') || msg.includes('connect') || msg.includes('fetch failed')) {
			return `${context}: Connection refused — the endpoint may be offline or unreachable`;
		}

		if (msg.includes('ENOTFOUND') || msg.includes('resolve') || msg.includes('DNS')) {
			return `${context}: DNS resolution failed — host name could not be resolved`;
		}

		if (msg.includes('timeout') || msg.includes('Timeout') || msg.includes('ABOR')) {
			return `${context}: Request timed out (5s) — endpoint not responding`;
		}

		if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('invalid_api_key')) {
			return `${context}: Authentication failed — check your API key`;
		}

		if (msg.includes('429')) {
			return `${context}: Rate limited — too many requests`;
		}

		if (msg.includes('404')) {
			return `${context}: Endpoint not found — the URL may be incorrect (expected /v1/models)`;
		}

		return `${context}: ${msg}`;
	}
	return `${context}: Unknown error`;
}

export async function discoverModels(baseURL: string, apiKey?: string): Promise<DiscoveredModel[]> {
	const normalizedURL = baseURL.replace(/\/$/, '');
	const url = `${normalizedURL}/v1/models`;
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};
	if (apiKey && apiKey !== 'dummy-key') {
		headers['Authorization'] = `Bearer ${apiKey}`;
	}

	logDebug(`discoverModels: GET ${url}`);

	let response: Response;
	try {
		response = await fetch(url, { headers });
	} catch (err) {
		logDebug(`discoverModels: fetch error: ${err instanceof Error ? err.message : String(err)}`);
		throw new Error(extractApiErrorMessage(err, 'Model discovery'));
	}

	if (!response.ok) {
		let detail = `${response.status} ${response.statusText}`;
		try {
			const body = await response.text();
			if (body) {
				const preview = body.slice(0, 200);
				detail += ` — ${preview}`;
			}
		} catch {}
		logDebug(`discoverModels: HTTP ${response.status}: ${detail}`);
		throw new Error(`Model discovery failed: ${detail}`);
	}

	const data = (await response.json()) as { data: Array<{ id: string; name?: string; object?: string; created?: number; owned_by?: string }> };
	const rawModels: Array<{
		id: string;
		name?: string;
		object?: string;
		created?: number;
		owned_by?: string;
	}> = data.data ?? [];

	logDebug(`discoverModels: found ${rawModels.length} models`);

	return rawModels.map((m) => ({
		id: m.id,
		name: m.name ?? m.id,
		object: m.object,
		created: m.created,
		owned_by: m.owned_by,
	}));
}

export async function checkProviderHealth(baseURL: string, apiKey?: string): Promise<ProviderHealth> {
	try {
		const normalizedURL = baseURL.replace(/\/$/, '');
		const url = `${normalizedURL}/v1/models`;
		const headers: Record<string, string> = {};
		if (apiKey && apiKey !== 'dummy-key') {
			headers['Authorization'] = `Bearer ${apiKey}`;
		}

		logDebug(`checkProviderHealth: GET ${url}`);

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000);

		let response: Response;
		try {
			response = await fetch(url, { headers, signal: controller.signal });
		} catch (err) {
			clearTimeout(timeoutId);
			logDebug(`checkProviderHealth: fetch error: ${err instanceof Error ? err.message : String(err)}`);
			return {
				reachable: false,
				error: extractApiErrorMessage(err, 'Health check'),
			};
		}
		clearTimeout(timeoutId);

		if (!response.ok) {
			let detail = response.statusText;
			try {
				const body = await response.text();
				if (body) {
					const preview = body.slice(0, 200);
					detail = detail ? `${detail} — ${preview}` : preview;
				}
			} catch {}
			logDebug(`checkProviderHealth: HTTP ${response.status}: ${detail}`);
			return {
				reachable: true,
				error: `HTTP ${response.status}: ${detail}`,
			};
		}

		const data = (await response.json()) as { data?: unknown[] };
		const modelCount = data.data?.length ?? 0;

		logDebug(`checkProviderHealth: OK, ${modelCount} models`);

		return {
			reachable: true,
			modelCount,
		};
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') {
			return { reachable: false, error: 'Timeout (5s) — endpoint not responding' };
		}
		logDebug(`checkProviderHealth: unexpected error: ${err instanceof Error ? err.message : String(err)}`);
		return {
			reachable: false,
			error: extractApiErrorMessage(err, 'Health check'),
		};
	}
}
