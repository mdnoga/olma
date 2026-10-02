import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	updateProviderConfig,
	buildModelList,
	getProviderBaseURLRaw,
	getProviderApiKeyRaw,
	withProvider,
	withProviderModels,
	getActiveConfigPath,
	loadConfig,
	saveConfig,
	backupConfig,
	resolveEnvReferences,
} from './config';
import type { OpencodeConfig, DiscoveredModel, ModelConfig } from './types';

describe('updateProviderConfig', () => {
	test('preserves existing models when editing a provider (v1)', () => {
		const config: OpencodeConfig = {
			provider: {
				local: {
					npm: '@ai-sdk/openai-compatible',
					name: 'oMLX Local LAN Provider',
					options: { baseURL: 'http://red-terminal.lan:8000/v1', apiKey: 'dummy-key' },
					models: {
						'Laguna-S-2.1-oQ3e': { id: 'Laguna-S-2.1-oQ3e', name: 'Laguna-S-2.1-oQ3e', tools: true },
					},
				},
			},
		};

		const updated = updateProviderConfig(config, 'local', {
			name: 'Renamed Provider',
			baseURL: 'http://red-terminal.lan:9000/v1',
		});

		expect(updated.models).toEqual({
			'Laguna-S-2.1-oQ3e': { id: 'Laguna-S-2.1-oQ3e', name: 'Laguna-S-2.1-oQ3e', tools: true },
		});
		expect(updated.name).toBe('Renamed Provider');
		expect(updated.options?.baseURL).toBe('http://red-terminal.lan:9000/v1');
	});

	test('preserves models and env list when editing a provider (v2)', () => {
		const config: OpencodeConfig = {
			providers: {
				local: {
					package: 'aisdk:@ai-sdk/openai-compatible',
					name: 'Local',
					env: ['LOCAL_API_KEY'],
					settings: { baseURL: 'http://127.0.0.1:8000/v1' },
					models: {
						'model-a': { modelID: 'model-a', name: 'model-a' },
					},
				},
			},
		};

		const updated = updateProviderConfig(config, 'local', {
			name: 'Local Edited',
			baseURL: 'http://127.0.0.1:8001/v1',
		});

		expect(updated.models).toEqual({ 'model-a': { modelID: 'model-a', name: 'model-a' } });
		expect(updated.env).toEqual(['LOCAL_API_KEY']);
		expect(updated.settings?.baseURL).toBe('http://127.0.0.1:8001/v1');
	});

	test('creates the provider when it does not exist yet', () => {
		const config: OpencodeConfig = { provider: {} };
		const updated = updateProviderConfig(config, 'fresh', {
			name: 'Fresh',
			baseURL: 'http://localhost:1234/v1',
		});
		expect(updated.name).toBe('Fresh');
		expect(updated.options?.baseURL).toBe('http://localhost:1234/v1');
	});
});

describe('buildModelList', () => {
	const discovered: DiscoveredModel[] = [
		{ id: 'model-a', name: 'model-a' },
		{ id: 'model-b', name: 'model-b' },
	];
	const configured: Record<string, ModelConfig> = {
		'model-b': { id: 'model-b', name: 'Model B', tools: true },
		'model-stale': { id: 'model-stale', name: 'Old Model', tools: true },
	};

	test('includes config models missing from the server, marked stale', () => {
		const list = buildModelList(discovered, configured);
		expect(list.map((e) => e.id)).toEqual(['model-a', 'model-b', 'model-stale']);

		const stale = list.find((e) => e.id === 'model-stale')!;
		expect(stale.onServer).toBe(false);
		expect(stale.inConfig).toBe(true);
		expect(stale.name).toBe('Old Model');
		expect(stale.discovered).toBeUndefined();
	});

	test('flags discovered models with their config membership', () => {
		const list = buildModelList(discovered, configured);
		const a = list.find((e) => e.id === 'model-a')!;
		expect(a.onServer).toBe(true);
		expect(a.inConfig).toBe(false);
		expect(a.discovered).toEqual({ id: 'model-a', name: 'model-a' });

		const b = list.find((e) => e.id === 'model-b')!;
		expect(b.onServer).toBe(true);
		expect(b.inConfig).toBe(true);
		expect(b.config).toEqual(configured['model-b']);
	});

	test('shows configured models even before any discovery ran', () => {
		const list = buildModelList([], configured);
		expect(list.map((e) => e.id)).toEqual(['model-b', 'model-stale']);
		expect(list.every((e) => !e.onServer && e.inConfig)).toBe(true);
	});
});

describe('raw provider getters', () => {
	const provider = {
		npm: '@ai-sdk/openai-compatible',
		options: { baseURL: '{env:OLMA_BASE_URL}', apiKey: '{env:OLMA_API_KEY}' },
	};

	test('return env references unresolved for form round-tripping', () => {
		expect(getProviderBaseURLRaw(provider)).toBe('{env:OLMA_BASE_URL}');
		expect(getProviderApiKeyRaw(provider)).toBe('{env:OLMA_API_KEY}');
	});

	test('read v2 settings when options are absent', () => {
		const v2 = { package: 'aisdk:@ai-sdk/openai-compatible', settings: { baseURL: '{env:B}', apiKey: 'plain' } };
		expect(getProviderBaseURLRaw(v2)).toBe('{env:B}');
		expect(getProviderApiKeyRaw(v2)).toBe('plain');
	});
});

describe('withProvider', () => {
	test('adds a provider without mutating the input (v1)', () => {
		const config: OpencodeConfig = { provider: { a: { name: 'A' } } };
		const next = withProvider(config, 'b', { name: 'B' });
		expect(next.provider).toEqual({ a: { name: 'A' }, b: { name: 'B' } });
		expect(config.provider).toEqual({ a: { name: 'A' } });
		expect(next).not.toBe(config);
	});

	test('deletes a provider when given undefined (v1)', () => {
		const config: OpencodeConfig = { provider: { a: { name: 'A' }, b: { name: 'B' } } };
		const next = withProvider(config, 'a', undefined);
		expect(next.provider).toEqual({ b: { name: 'B' } });
		expect(config.provider).toEqual({ a: { name: 'A' }, b: { name: 'B' } });
	});

	test('writes to the v2 providers key', () => {
		const config: OpencodeConfig = { providers: { a: { name: 'A' } } };
		const next = withProvider(config, 'b', { name: 'B' });
		expect(next.providers).toEqual({ a: { name: 'A' }, b: { name: 'B' } });
		expect(next.provider).toBeUndefined();
	});
});

describe('withProviderModels', () => {
	test('replaces a provider\'s models without mutating the input', () => {
		const config: OpencodeConfig = {
			provider: { a: { name: 'A', models: { m1: { id: 'm1' }, m2: { id: 'm2' } } } },
		};
		const next = withProviderModels(config, 'a', (models) => {
			const { m1: _removed, ...rest } = models;
			return rest;
		});
		expect(next.provider?.a?.models).toEqual({ m2: { id: 'm2' } });
		expect(next.provider?.a?.name).toBe('A');
		expect(config.provider?.a?.models).toEqual({ m1: { id: 'm1' }, m2: { id: 'm2' } });
	});

	test('creates the provider entry when missing', () => {
		const next = withProviderModels({}, 'x', () => ({ m: { id: 'm' } }));
		expect(next.provider).toEqual({ x: { models: { m: { id: 'm' } } } });
	});
});

describe('config file location', () => {
	test('prefers opencode.jsonc when it exists, and saves back to it', () => {
		const dir = mkdtempSync(join(tmpdir(), 'olma-test-'));
		writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // comment\n  "model": "old"\n}\n');
		expect(getActiveConfigPath(dir)).toBe(join(dir, 'opencode.jsonc'));

		const config = loadConfig(dir);
		expect(config.model).toBe('old');

		const backup = backupConfig(dir);
		expect(backup).toStartWith(join(dir, 'opencode.jsonc.backup.'));

		saveConfig({ ...config, model: 'new' }, dir);
		expect(JSON.parse(readFileSync(join(dir, 'opencode.jsonc'), 'utf-8')).model).toBe('new');
		expect(readdirSync(dir)).not.toContain('opencode.json');
	});

	test('falls back to opencode.json when no jsonc exists', () => {
		const dir = mkdtempSync(join(tmpdir(), 'olma-test-'));
		expect(getActiveConfigPath(dir)).toBe(join(dir, 'opencode.json'));
		saveConfig({ model: 'x' }, dir);
		expect(JSON.parse(readFileSync(join(dir, 'opencode.json'), 'utf-8')).model).toBe('x');
	});
});

describe('resolveEnvReferences', () => {
	test('resolves multiple references from a supplied env', () => {
		expect(resolveEnvReferences('{env:HOST}:{env:PORT}', { HOST: 'h', PORT: '1' })).toBe('h:1');
	});
});
