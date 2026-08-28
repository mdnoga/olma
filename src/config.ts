import { join, dirname } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import type { OpencodeConfig, ProviderConfig, ModelConfig, DiscoveredModel } from './types';

const CONFIG_DIR = join(homedir(), '.config', 'opencode');

export function getConfigPath(): string {
	return join(CONFIG_DIR, 'opencode.json');
}

export function getConfigPathJsonc(): string {
	return join(CONFIG_DIR, 'opencode.jsonc');
}

export function loadConfig(): OpencodeConfig {
	const jsonPath = getConfigPath();
	const jsoncPath = getConfigPathJsonc();

	const path = existsSync(jsoncPath) ? jsoncPath : (existsSync(jsonPath) ? jsonPath : null);
	if (!path) {
		return { $schema: 'https://opencode.ai/config.json' };
	}

	const content = readFileSync(path, 'utf-8');
	return parseJsonc(content);
}

export function saveConfig(config: OpencodeConfig): void {
	const path = getConfigPath();
	const dir = dirname(path);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	const content = JSON.stringify(config, null, 2) + '\n';
	writeFileSync(path, content, 'utf-8');
}

export function backupConfig(): string | null {
	const path = getConfigPath();
	const jsoncPath = getConfigPathJsonc();
	const source = existsSync(jsoncPath) ? jsoncPath : (existsSync(path) ? path : null);
	if (!source) return null;

	const backupPath = `${source}.backup.${Date.now()}`;
	copyFileSync(source, backupPath);
	return backupPath;
}

export function getProviders(config: OpencodeConfig): Record<string, ProviderConfig> {
	if (config.providers) return config.providers;
	if (config.provider) return config.provider;
	return {};
}

export function setProviders(config: OpencodeConfig, providers: Record<string, ProviderConfig>): OpencodeConfig {
	const useV2 = !!config.providers;
	if (useV2) {
		config.providers = { ...providers };
	} else {
		config.provider = { ...(config.provider ?? {}), ...providers };
	}
	return config;
}

export function getProviderModels(config: OpencodeConfig, providerId: string): Record<string, ModelConfig> {
	const providers = getProviders(config);
	return providers[providerId]?.models ?? {};
}

export function setProviderModels(
	config: OpencodeConfig,
	providerId: string,
	models: Record<string, ModelConfig>,
): OpencodeConfig {
	const providers = getProviders(config);
	if (!providers[providerId]) {
		providers[providerId] = {};
	}
	providers[providerId].models = { ...models };
	if (config.providers) {
		config.providers = { ...providers };
	} else if (config.provider) {
		config.provider = { ...providers };
	} else {
		config.provider = { ...providers };
	}
	return config;
}

export function isConfigV2(config: OpencodeConfig): boolean {
	return !!config.providers;
}

// === V1/V2 format helpers ===

const ENV_REF_PATTERN = /\{env:([^}]+)\}/g;

export function getProviderBaseURL(provider: ProviderConfig): string | undefined {
	const raw = provider.options?.baseURL ?? provider.settings?.baseURL;
	return raw ? resolveEnvReferences(raw) : undefined;
}

export function getProviderApiKey(provider: ProviderConfig): string | undefined {
	const raw = provider.options?.apiKey ?? provider.settings?.apiKey;
	return raw ? resolveEnvReferences(raw) : undefined;
}

// Raw (unresolved) accessors for editing: forms must round-trip `{env:...}`
// references instead of writing resolved secrets back into the config.
export function getProviderBaseURLRaw(provider: ProviderConfig): string | undefined {
	return provider.options?.baseURL ?? provider.settings?.baseURL;
}

export function getProviderApiKeyRaw(provider: ProviderConfig): string | undefined {
	return provider.options?.apiKey ?? provider.settings?.apiKey;
}

export function getProviderPackage(provider: ProviderConfig): string | undefined {
	return provider.npm ?? provider.package;
}

export function getProviderEnvVars(config: OpencodeConfig, providerId: string): string[] {
	const providers = getProviders(config);
	return providers[providerId]?.env ?? [];
}

// === .env file support ===

export function getEnvFilePath(): string {
	return join(CONFIG_DIR, '.env');
}

export function loadEnvFile(): Record<string, string> {
	const path = getEnvFilePath();
	if (!existsSync(path)) return {};
	try {
		const content = readFileSync(path, 'utf-8');
		const env: Record<string, string> = {};
		for (const line of content.split('\n')) {
			const trimmed = line.trim();
			if (trimmed === '' || trimmed.startsWith('#')) continue;
			const eqIdx = trimmed.indexOf('=');
			if (eqIdx > 0) {
				const key = trimmed.slice(0, eqIdx).trim();
				const rawValue = trimmed.slice(eqIdx + 1).trim();
				const value = rawValue.replace(/^['"]|['"]$/g, '');
				env[key] = value;
			}
		}
		return env;
	} catch {
		return {};
	}
}

export function saveEnvFile(env: Record<string, string>): void {
	const path = getEnvFilePath();
	const dir = dirname(path);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	const lines = Object.entries(env).map(([key, value]) => {
		if (value.includes(' ') || value.includes('=') || value.includes('#') || value.includes('"') || value.includes("'")) {
			return `${key}="${value.replace(/"/g, '\\"')}"`;
		}
		return `${key}=${value}`;
	});
	const content = lines.join('\n') + (lines.length > 0 ? '\n' : '');
	writeFileSync(path, content, 'utf-8');
}

export function resolveEnvReferences(value: string, env?: Record<string, string>): string {
	if (!value) return value;
	return value.replace(ENV_REF_PATTERN, (_match, varName: string) => {
		const loadedEnv = env ?? loadEnvFile();
		const resolved = loadedEnv[varName] ?? process.env[varName];
		return resolved ?? '';
	});
}

export function getEnvVarReferences(config: OpencodeConfig): string[] {
	const refs = new Set<string>();
	const providers = getProviders(config);
	for (const provider of Object.values(providers)) {
		const fields = [
			provider.options?.apiKey,
			provider.options?.baseURL,
			provider.settings?.apiKey,
			provider.settings?.baseURL,
		];
		for (const field of fields) {
			if (field) {
				const matches = field.match(ENV_REF_PATTERN);
				if (matches) {
					for (const match of matches) {
						const varName = match.replace(/\{env:([^}]+)\}/, '$1');
						refs.add(varName);
					}
				}
			}
		}
	}
	return Array.from(refs);
}

export function maskSecret(value: string, visibleChars = 4): string {
	if (!value || value.length <= visibleChars) {
		return '•'.repeat(Math.max(value?.length ?? 0, visibleChars));
	}
	return '•'.repeat(value.length - visibleChars) + value.slice(-visibleChars);
}

export function createProviderConfig(
	config: OpencodeConfig,
	providerId: string,
	params: {
		name?: string;
		baseURL?: string;
		apiKey?: string;
		npmPackage?: string;
		env?: string[];
	},
): ProviderConfig {
	const pkg = params.npmPackage ?? getDefaultPackage(config);
	const opts: Record<string, unknown> = {};
	if (params.baseURL) opts.baseURL = params.baseURL;
	if (params.apiKey) opts.apiKey = params.apiKey;

	if (isConfigV2(config)) {
		return {
			name: params.name,
			env: params.env,
			package: pkg,
			settings: opts,
		};
	}

	return {
		npm: pkg,
		name: params.name,
		options: opts as ProviderConfig['options'],
	};
}

export interface ModelListEntry {
	id: string;
	name: string;
	onServer: boolean;
	inConfig: boolean;
	discovered?: DiscoveredModel;
	config?: ModelConfig;
}

export function buildModelList(
	discovered: DiscoveredModel[],
	configured: Record<string, ModelConfig>,
): ModelListEntry[] {
	const entries: ModelListEntry[] = discovered.map((m) => ({
		id: m.id,
		name: m.name ?? m.id,
		onServer: true,
		inConfig: m.id in configured,
		discovered: m,
		config: configured[m.id],
	}));
	for (const [id, cfg] of Object.entries(configured)) {
		if (!discovered.some((m) => m.id === id)) {
			entries.push({ id, name: cfg.name ?? id, onServer: false, inConfig: true, config: cfg });
		}
	}
	return entries;
}

export function updateProviderConfig(
	config: OpencodeConfig,
	providerId: string,
	params: {
		name?: string;
		baseURL?: string;
		apiKey?: string;
		npmPackage?: string;
		env?: string[];
	},
): ProviderConfig {
	const existing = getProviders(config)[providerId];
	const updated = createProviderConfig(config, providerId, params);
	// Keep fields the edit form doesn't manage (models, env, headers, body, ...)
	const merged: Record<string, unknown> = { ...existing };
	for (const [key, value] of Object.entries(updated)) {
		if (value !== undefined) {
			merged[key] = value;
		}
	}
	return merged as ProviderConfig;
}

export function createModelConfig(
	config: OpencodeConfig,
	discovered: DiscoveredModel,
	params: {
		name?: string;
		tools?: boolean;
		context?: number;
		output?: number;
	},
): ModelConfig {
	const modelName = params.name ?? discovered.name ?? discovered.id;
	const limit: { context: number; output: number } | undefined =
		params.context || params.output
			? {
					context: params.context ?? 4096,
					output: params.output ?? 1024,
				}
			: undefined;

	if (isConfigV2(config)) {
		return {
			modelID: discovered.id,
			name: modelName,
			...(params.tools !== undefined
				? {
						capabilities: {
							tools: params.tools,
							input: ['text'] as const,
							output: ['text'] as const,
						},
					}
				: {}),
			...(limit ? { limit } : {}),
		};
	}

	return {
		id: discovered.id,
		name: modelName,
		...(params.tools !== undefined ? { tools: params.tools } : {}),
		...(limit ? { limit } : {}),
	};
}

export function getDefaultPackage(config: OpencodeConfig): string {
	if (isConfigV2(config)) {
		return 'aisdk:@ai-sdk/openai-compatible';
	}
	return '@ai-sdk/openai-compatible';
}

function parseJsonc(content: string): OpencodeConfig {
	try {
		return JSON.parse(content);
	} catch {
		const cleaned = stripJsonComments(content);
		return JSON.parse(cleaned);
	}
}

function stripJsonComments(content: string): string {
	let result = '';
	let inString = false;
	let inSingleLineComment = false;
	let inMultiLineComment = false;
	let i = 0;

	while (i < content.length) {
		const char = content[i];
		const next = content[i + 1];

		if (inSingleLineComment) {
			if (char === '\n') {
				inSingleLineComment = false;
				result += char;
			}
			i++;
			continue;
		}

		if (inMultiLineComment) {
			if (char === '*' && next === '/') {
				inMultiLineComment = false;
				i += 2;
				continue;
			}
			i++;
			continue;
		}

		if (inString) {
			if (char === '\\') {
				result += char + (next ?? '');
				i += 2;
				continue;
			}
			if (char === '"') {
				inString = false;
			}
			result += char;
			i++;
			continue;
		}

		if (char === '"') {
			inString = true;
			result += char;
			i++;
			continue;
		}

		if (char === '/' && next === '/') {
			inSingleLineComment = true;
			i += 2;
			continue;
		}

		if (char === '/' && next === '*') {
			inMultiLineComment = true;
			i += 2;
			continue;
		}

		if (char === ',' && next !== undefined && next !== '\n' && next !== '\r' && next !== ' ' && next !== '\t' && next !== ']' && next !== '}') {
			let j = i + 1;
			while (j < content.length && (content[j] === ' ' || content[j] === '\t')) j++;
			if (j < content.length && (content[j] === ']' || content[j] === '}')) {
				i++;
				continue;
			}
		}

		result += char;
		i++;
	}

	return result;
}
