import { useInput } from 'ink';
import { type FC, useEffect } from 'react';
import { Box, Text } from 'ink';
import { checkProviderHealth } from '../api';
import { getProviders, getProviderModels, getProviderBaseURL, getProviderApiKey } from '../config';
import type { OpencodeConfig, Screen } from '../types';

interface ProviderHealthInfo {
	reachable: boolean;
	error?: string;
	modelCount?: number;
}

interface HomeScreenProps {
	config: OpencodeConfig;
	error: string | null;
	screen: Screen;
	selectedProvider: string | null;
	setSelectedProvider: (id: string | null) => void;
	setScreen: (s: Screen) => void;
	unsavedChanges: boolean;
	statusMessage: string | null;
	providerHealth: Record<string, ProviderHealthInfo>;
	setProviderHealth: (h: Record<string, ProviderHealthInfo>) => void;
	onSave: () => void;
	onQuit: () => void;
	onDiscoverModels: (providerId: string) => void;
	providerLoading: boolean;
	discoveredModels: import('../types').DiscoveredModel[];
}

export const HomeScreen: FC<HomeScreenProps> = ({
	config,
	error,
	selectedProvider,
	setSelectedProvider,
	setScreen,
	unsavedChanges,
	statusMessage,
	providerHealth,
	setProviderHealth,
	providerLoading,
	discoveredModels,
	onSave,
	onQuit,
	onDiscoverModels,
}) => {
		useInput((input, key) => {
		if (key.ctrl || key.meta) return;
		if (key.escape || input === 'q' || input === 'Q') {
			onQuit();
		} else if (input === 'p') {
			setScreen('providers');
			setSelectedProvider(null);
		} else if (input === 'd') {
			const entries = Object.keys(getProviders(config));
			if (entries.length > 0) {
				const id = selectedProvider ?? entries[0] ?? null;
				if (id) {
					setSelectedProvider(id);
					onDiscoverModels(id);
				}
			}
		} else if (input === 'e') {
			setScreen('env');
		} else if (input === 's') {
			onSave();
		}
	});

	useEffect(() => {
		const providers = getProviders(config);
		const checkHealth = async () => {
			const health: Record<string, ProviderHealthInfo> = {};
			for (const [id, provider] of Object.entries(providers)) {
				const base = getProviderBaseURL(provider);
				if (base) {
					health[id] = await checkProviderHealth(base, getProviderApiKey(provider));
				} else {
					health[id] = { reachable: false, error: 'No baseURL' };
				}
			}
			setProviderHealth(health);
		};
		checkHealth();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [config]);

	const providers = getProviders(config);
	const providerEntries = Object.entries(providers);

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="cyan">
					{' '}
					OLMA — OpenCode Local Model Assistant{' '}
				</Text>
			</Box>

			{error && (
				<Box marginBottom={1}>
					<Text color="red">⚠ {error}</Text>
				</Box>
			)}

			{statusMessage && (
				<Box marginBottom={1}>
					<Text color="green">✓ {statusMessage}</Text>
				</Box>
			)}

			{providerLoading && (
				<Box marginBottom={1}>
					<Text color="yellow">⟳ Discovering models...</Text>
				</Box>
			)}

			{providerLoading && discoveredModels.length > 0 && (
				<Box margin={1}>
					<Text color="cyan">
						{' '}
						Found {discoveredModels.length} model(s) from{' '}
						{selectedProvider ?? 'selected provider'}
					</Text>
				</Box>
			)}

			<Box borderStyle="round" borderColor="blue" flexDirection="column" padding={1} marginBottom={1}>
				<Text bold color="blue">
					{' '}
					Local Providers ({providerEntries.length}){' '}
				</Text>
			</Box>

			{providerEntries.length === 0 ? (
				<Box padding={1}>
					<Text color="gray">No local providers configured. Press 'p' to add one.</Text>
				</Box>
			) : (
				providerEntries.map(([id, provider]) => {
					const models = getProviderModels(config, id);
					const modelKeys = Object.keys(models);
					const health = providerHealth[id];
					const statusColor = health?.reachable ? 'green' : 'red';
					const statusLabel = health?.reachable ? '●' : '✗';

					return (
						<Box
							key={id}
							borderStyle="round"
							borderColor={selectedProvider === id ? 'cyan' : 'gray'}
							flexDirection="column"
							padding={1}
							marginBottom={1}
						>
							<Box justifyContent="space-between">
								<Text bold color={selectedProvider === id ? 'cyan' : 'white'}>
									{' '}
									{id}
								</Text>
								<Text color={statusColor}>
									{statusLabel}{' '}
									{health?.modelCount !== undefined
										? `${health.modelCount} models`
										: health?.error ?? 'checking...'}
								</Text>
							</Box>
							<Text color="gray">  {provider.name ?? id}</Text>
							<Text color="gray">  {getProviderBaseURL(provider) ?? 'No endpoint'}</Text>
							<Box marginTop={1}>
								<Text color="gray">  Models ({modelKeys.length}):</Text>
							</Box>
							{modelKeys.length === 0 ? (
								<Text color="gray">    (none configured)</Text>
							) : (
								modelKeys.map((mk) => (
									<Text key={mk} color="gray">
										{'  '}
										{models[mk].name ?? mk}
										{(models[mk]?.tools ?? models[mk]?.capabilities?.tools) && '  [tools]'}
									</Text>
								))
							)}
						</Box>
					);
				})
			)}

			<Box borderStyle="round" borderColor="gray" flexDirection="column" padding={1} marginTop={1}>
					<Text bold color="gray">  Quick Actions </Text>
				<Box flexDirection="column" marginTop={1} paddingLeft={2}>
					<Text color="white">  [p] Manage Providers</Text>
					<Text color="white">  [d] Discover Models (from selected)</Text>
					<Text color="white">  [e] Edit Environment Variables</Text>
					<Text color={unsavedChanges ? 'yellow' : 'white'}>
						{'  [s] Save Config'} {unsavedChanges ? '(unsaved changes)' : ''}
					</Text>
					<Text color="white">  [q] Quit</Text>
				</Box>
			</Box>
		</Box>
	);
};
