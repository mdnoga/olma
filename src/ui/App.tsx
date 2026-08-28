import { useState, useEffect, useCallback, type FC } from 'react';
import { Box, Text, useApp } from 'ink';
import {
	loadConfig,
	saveConfig,
	getProviders,
	backupConfig,
	getProviderBaseURL,
	getProviderApiKey,
	getProviderEnvVars,
	getEnvVarReferences,
	loadEnvFile,
	saveEnvFile,
	maskSecret,
	createProviderConfig,
	updateProviderConfig,
	createModelConfig,
} from '../config';
import { discoverModels, logDebug } from '../api';
import type {
	OpencodeConfig,
	Screen,
	DiscoveredModel,
} from '../types';
import { HomeScreen } from './HomeScreen';
import { ProvidersScreen } from './ProvidersScreen';
import { ModelsScreen } from './ModelsScreen';
import { EnvScreen } from './EnvScreen';

interface ProviderFormData {
	providerId: string;
	name: string;
	baseURL: string;
	apiKey: string;
	npmPackage: string;
}

export const App: FC = () => {
	const { exit } = useApp();

	const [config, setConfig] = useState<OpencodeConfig | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [screen, setScreen] = useState<Screen>('home');
	const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
	const [selectedModel, setSelectedModel] = useState<string | null>(null);
	const [unsavedChanges, setUnsavedChanges] = useState(false);
	const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([]);
	const [providerLoading, setProviderLoading] = useState(false);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const [providerHealth, setProviderHealth] = useState<
		Record<string, { reachable: boolean; error?: string; modelCount?: number }>
	>({});
	const [envVars, setEnvVars] = useState<Record<string, string>>({});

	useEffect(() => {
		const env = loadEnvFile();
		setEnvVars(env);
	}, [config, screen]);

	useEffect(() => {
		try {
			const cfg = loadConfig();
			setConfig(cfg);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load config');
		} finally {
			setLoading(false);
		}
	}, []);

	const clearStatus = useCallback(() => {
		if (statusMessage) {
			const t = setTimeout(() => setStatusMessage(null), 3000);
			return () => clearTimeout(t);
		}
	}, [statusMessage]);

	useEffect(() => {
		clearStatus();
	}, [statusMessage, clearStatus]);

	const handleSave = useCallback(() => {
		if (!config) return;
		try {
			backupConfig();
			saveConfig(config);
			setUnsavedChanges(false);
			setStatusMessage('Config saved successfully');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save config');
		}
	}, [config]);

	const handleAddProvider = useCallback(
		(data: ProviderFormData) => {
			if (!config) return;
			const provider = createProviderConfig(config, data.providerId, {
				name: data.name,
				baseURL: data.baseURL,
				apiKey: data.apiKey || undefined,
				npmPackage: data.npmPackage || undefined,
			});
			const providers = getProviders(config);
			providers[data.providerId] = provider;
			const newConfig = { ...config };
			if (newConfig.providers) {
				newConfig.providers = { ...providers };
			} else {
				newConfig.provider = { ...(newConfig.provider ?? {}), ...providers };
			}
			setConfig(newConfig);
			setUnsavedChanges(true);
			setScreen('providers');
			setSelectedProvider(data.providerId);
		},
		[config],
	);

	const handleUpdateProvider = useCallback(
		(data: ProviderFormData) => {
			if (!config) return;
			const provider = updateProviderConfig(config, data.providerId, {
				name: data.name,
				baseURL: data.baseURL,
				apiKey: data.apiKey || undefined,
				npmPackage: data.npmPackage || undefined,
			});
			const providers = getProviders(config);
			providers[data.providerId] = provider;
			const newConfig = { ...config };
			if (newConfig.providers) {
				newConfig.providers = { ...providers };
			} else {
				newConfig.provider = { ...(newConfig.provider ?? {}), ...providers };
			}
			setConfig(newConfig);
			setUnsavedChanges(true);
			setScreen('providers');
		},
		[config],
	);

	const handleDeleteProvider = useCallback(
		(providerId: string) => {
			if (!config) return;
			const providers = getProviders(config);
			delete providers[providerId];
			const newConfig = { ...config };
			if (newConfig.providers) {
				newConfig.providers = { ...providers };
			} else {
				newConfig.provider = { ...(newConfig.provider ?? {}), ...providers };
			}
			setConfig(newConfig);
			setUnsavedChanges(true);
			setStatusMessage(`Provider "${providerId}" deleted`);
			if (selectedProvider === providerId) {
				setSelectedProvider(null);
			}
			setScreen('providers');
		},
		[config, selectedProvider],
	);

	const handleAddModel = useCallback(
		(
			providerId: string,
			modelId: string,
			discovered: DiscoveredModel,
			params: { name?: string; tools?: boolean; context?: number; output?: number },
		) => {
			if (!config) return;
			const model = createModelConfig(config, discovered, {
				name: params.name,
				tools: params.tools,
				context: params.context,
				output: params.output,
			});
			const providers = getProviders(config);
			if (!providers[providerId]) {
				providers[providerId] = {};
			}
			providers[providerId].models = {
				...(providers[providerId].models ?? {}),
				[modelId]: model,
			};
			const newConfig = { ...config };
			if (newConfig.providers) {
				newConfig.providers = { ...providers };
			} else {
				newConfig.provider = { ...(newConfig.provider ?? {}), ...providers };
			}
			setConfig(newConfig);
			setUnsavedChanges(true);
			setStatusMessage(`Model "${modelId}" added to "${providerId}"`);
		},
		[config],
	);

	const handleRemoveModel = useCallback(
		(providerId: string, modelId: string) => {
			if (!config) return;
			const providers = getProviders(config);
			if (providers[providerId]?.models) {
				delete providers[providerId].models[modelId];
			}
			const newConfig = { ...config };
			if (newConfig.providers) {
				newConfig.providers = { ...providers };
			} else {
				newConfig.provider = { ...(newConfig.provider ?? {}), ...providers };
			}
			setConfig(newConfig);
			setUnsavedChanges(true);
			setStatusMessage(`Model "${modelId}" removed from "${providerId}"`);
		},
		[config],
	);

	const handleRemoveModels = useCallback(
		(providerId: string, modelIds: string[]) => {
			if (!config || modelIds.length === 0) return;
			const providers = getProviders(config);
			const models = providers[providerId]?.models;
			if (models) {
				for (const modelId of modelIds) {
					delete models[modelId];
				}
			}
			const newConfig = { ...config };
			if (newConfig.providers) {
				newConfig.providers = { ...providers };
			} else {
				newConfig.provider = { ...(newConfig.provider ?? {}), ...providers };
			}
			setConfig(newConfig);
			setUnsavedChanges(true);
			setStatusMessage(`Removed ${modelIds.length} stale model(s) from "${providerId}"`);
		},
		[config],
	);

	const handleDiscoverModels = useCallback(
		async (providerId: string) => {
			if (!config) return;
			const providers = getProviders(config);
			const provider = providers[providerId];
			const baseURL = getProviderBaseURL(provider ?? {});
			if (!baseURL) {
				setError('Provider has no baseURL configured');
				return;
			}
			const apiKey = getProviderApiKey(provider ?? {});
			setProviderLoading(true);
			setError(null);
			try {
				const models = await discoverModels(baseURL, apiKey);
				setDiscoveredModels(models);
				setScreen('models' as Screen);
				setSelectedProvider(providerId);
				setSelectedModel(null);
				setStatusMessage(`Discovered ${models.length} model(s) from "${providerId}"`);
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to discover models');
				setDiscoveredModels([]);
			} finally {
				setProviderLoading(false);
			}
		},
		[config],
	);

	const handleBack = useCallback(() => {
		setError(null);
		if (screen === 'providers' && selectedProvider) {
			setScreen('home');
			setSelectedProvider(null);
		} else if (screen === 'models') {
			if (selectedProvider) {
				setScreen('providers');
			} else {
				setScreen('home');
			}
		} else if (screen === 'env') {
			setScreen('home');
		} else {
			setScreen('home');
		}
	}, [screen, selectedProvider]);

	const handleSaveEnv = useCallback((newEnv: Record<string, string>) => {
		try {
			saveEnvFile(newEnv);
			setEnvVars(newEnv);
			setStatusMessage('Environment file saved');
			setTimeout(() => setStatusMessage(null), 2000);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save .env');
		}
	}, []);

	const handleQuit = useCallback(() => {
		logDebug('handleQuit: calling exit()');
		exit();
	}, [exit]);

	if (loading) {
		return (
			<Box flexDirection="column" padding={2}>
				<Text>Loading OLMA...</Text>
			</Box>
		);
	}

	if (error && !config) {
		return (
			<Box flexDirection="column" padding={2}>
				<Text color="red">Error: {error}</Text>
			</Box>
		);
	}

	const ctx = {
		config: config!,
		error,
		screen,
		selectedProvider,
		selectedModel,
		setSelectedProvider,
		setScreen,
		unsavedChanges,
		providerLoading,
		discoveredModels,
		providerHealth,
		setProviderHealth,
		statusMessage,
		envVars,
		envRefs: config ? getEnvVarReferences(config) : [],
		onSave: handleSave,
		onSaveEnv: handleSaveEnv,
		onAddProvider: handleAddProvider,
		onUpdateProvider: handleUpdateProvider,
		onDeleteProvider: handleDeleteProvider,
		onAddModel: handleAddModel,
		onRemoveModel: handleRemoveModel,
		onRemoveModels: handleRemoveModels,
		onDiscoverModels: handleDiscoverModels,
		onBack: handleBack,
		onQuit: handleQuit,
	};

	let screenComponent: ReturnType<FC>;
	switch (screen) {
		case 'home':
			screenComponent = <HomeScreen {...ctx} />;
			break;
		case 'providers':
			screenComponent = <ProvidersScreen {...ctx} />;
			break;
		case 'models':
			screenComponent = <ModelsScreen {...ctx} />;
			break;
		case 'env':
			screenComponent = <EnvScreen {...ctx} />;
			break;
		default:
			screenComponent = <HomeScreen {...ctx} />;
	}

	return <>{screenComponent}</>;
};
