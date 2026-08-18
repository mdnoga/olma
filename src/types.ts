// === OpenCode Config (supports both V1 `provider` and V2 `providers` formats) ===

export interface ProviderOptions {
	apiKey?: string;
	baseURL?: string;
	timeout?: number | false;
	chunkTimeout?: number;
	headerTimeout?: number;
	setCacheKey?: boolean;
	[key: string]: unknown;
}

export interface ProviderSettings {
	apiKey?: string;
	baseURL?: string;
	[key: string]: unknown;
}

export interface ModelCapabilities {
	tools?: boolean;
	input?: string[];
	output?: string[];
}

export interface ModelConfig {
	id?: string;
	modelID?: string;
	name?: string;
	family?: string;
	release_date?: string;
	attachment?: string | boolean;
	reasoning?: boolean;
	temperature?: boolean;
	tool_call?: boolean;
	tools?: boolean;
	capabilities?: ModelCapabilities;
	cost?: {
		input: number;
		output: number;
		cache_read?: number;
		cache_write?: number;
	};
	limit?: {
		context: number;
		input?: number;
		output: number;
	};
	modalities?: {
		input: string[];
		output: string[];
	};
	compatibility?: {
		reasoningField?: string;
	};
	experimental?: boolean;
	status?: 'alpha' | 'beta' | 'deprecated' | 'active';
	provider?: { npm?: string; api?: string };
	options?: Record<string, unknown>;
	headers?: Record<string, string>;
}

export interface ProviderConfig {
	npm?: string;
	api?: string;
	package?: string;
	name?: string;
	env?: string[];
	whitelist?: string[];
	blacklist?: string[];
	options?: ProviderOptions;
	settings?: ProviderSettings;
	headers?: Record<string, string>;
	body?: Record<string, unknown>;
	models?: Record<string, ModelConfig>;
}

export interface OpencodeConfig {
	$schema?: string;
	model?: string;
	small_model?: string;
	provider?: Record<string, ProviderConfig>;
	providers?: Record<string, ProviderConfig>;
	disabled_providers?: string[];
	enabled_providers?: string[];
	[key: string]: unknown;
}

// === Discovered model from API ===

export interface DiscoveredModel {
	id: string;
	name: string;
	object?: string;
	created?: number;
	owned_by?: string;
}

// === App state ===

export type Screen = 'home' | 'providers' | 'models' | 'env';
