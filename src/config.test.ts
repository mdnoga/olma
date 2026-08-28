import { describe, expect, test } from 'bun:test';
import { updateProviderConfig, buildModelList } from './config';
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
