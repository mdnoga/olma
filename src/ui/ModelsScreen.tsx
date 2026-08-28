import { useInput } from 'ink';
import { useState, type FC } from 'react';
import { Box, Text } from 'ink';
import { getProviders, getProviderModels, getProviderBaseURL, buildModelList } from '../config';
import type { OpencodeConfig, Screen, DiscoveredModel } from '../types';

interface ModelsScreenProps {
	config: OpencodeConfig;
	selectedProvider: string | null;
	setScreen: (s: Screen) => void;
	unsavedChanges: boolean;
	providerLoading: boolean;
	discoveredModels: DiscoveredModel[];
	error: string | null;
	statusMessage: string | null;
	onDiscoverModels: (providerId: string) => void;
	onAddModel: (
		providerId: string,
		modelId: string,
		discovered: DiscoveredModel,
		params: { name?: string; tools?: boolean; context?: number; output?: number },
	) => void;
	onRemoveModel: (providerId: string, modelId: string) => void;
	onRemoveModels: (providerId: string, modelIds: string[]) => void;
	onSave: () => void;
	onBack: () => void;
	onQuit: () => void;
}

type ModelFormMode = 'list' | 'add';

const FORM_FIELDS = [
	{ key: 'name', label: 'Display Name', type: 'text' as const },
	{ key: 'tools', label: 'Tools Support', type: 'toggle' as const },
	{ key: 'context', label: 'Context Limit', type: 'number' as const },
	{ key: 'output', label: 'Output Limit', type: 'number' as const },
];

export const ModelsScreen: FC<ModelsScreenProps> = ({
	config,
	selectedProvider,
	unsavedChanges,
	providerLoading,
	discoveredModels,
	error,
	statusMessage,
	onDiscoverModels,
	onAddModel,
	onRemoveModel,
	onRemoveModels,
 	onSave,
 	onBack,
 	onQuit,
 }) => {
	const [formMode, setFormMode] = useState<ModelFormMode>('list');
	const [listIndex, setListIndex] = useState(0);
	const [formValues, setFormValues] = useState<Record<string, string>>({});
	const [activeField, setActiveField] = useState(0);
	const [toolsSupported, setToolsSupported] = useState(true);

	const providers = getProviders(config);
	const providerId = selectedProvider ?? Object.keys(providers)[0] ?? '';
	const provider = providers[providerId];
	const providerName = provider?.name ?? providerId ?? 'unknown';
	const providerBaseURL = getProviderBaseURL(provider ?? {}) ?? 'not configured';
	const modelMap = getProviderModels(config, providerId);

	const modelList = buildModelList(discoveredModels, modelMap);
	// Staleness is only meaningful once discovery has returned data;
	// otherwise every configured model would look "not on server".
	const hasDiscovered = discoveredModels.length > 0;
	const staleEntries = hasDiscovered ? modelList.filter((e) => !e.onServer && e.inConfig) : [];
	const clampListIndex = (removedCount = 1) =>
		setListIndex((prev) => Math.max(0, Math.min(prev, modelList.length - 1 - removedCount)));

	useInput((input, key) => {
		if (formMode === 'add') {
			if (key.ctrl || key.meta) return;
			if (key.escape) {
				setFormMode('list');
				return;
			}
			if (key.tab) {
				setActiveField((prev) => (prev + 1) % FORM_FIELDS.length);
				return;
			}
			if (key.return) {
				const model = modelList[listIndex]?.discovered;
				if (model) {
					onAddModel(providerId, model.id, model, {
						name: formValues.name || undefined,
						tools: toolsSupported,
						context: formValues.context ? parseInt(formValues.context, 10) : undefined,
						output: formValues.output ? parseInt(formValues.output, 10) : undefined,
					});
					setFormMode('list');
					setFormValues({});
				}
				return;
			}
			if (key.backspace) {
				const fieldKey = FORM_FIELDS[activeField].key;
				if (FORM_FIELDS[activeField].type !== 'toggle') {
					setFormValues((prev) => ({
						...prev,
						[fieldKey]: prev[fieldKey]?.slice(0, -1) ?? '',
					}));
				}
				return;
			}
			if (input && input.length === 1) {
				const field = FORM_FIELDS[activeField];
				if (field.type === 'toggle') {
					if (input === ' ' || input === 't' || input === 'y' || input === 'T' || input === 'Y') {
						setToolsSupported((prev) => !prev);
					}
					return;
				}
				if (field.type === 'number') {
					if (/\d/.test(input)) {
						setFormValues((prev) => ({
							...prev,
							[field.key]: (prev[field.key] ?? '') + input,
						}));
					}
					return;
				}
				setFormValues((prev) => ({
					...prev,
					[field.key]: (prev[field.key] ?? '') + input,
				}));
			}
			return;
		}

		if (key.ctrl || key.meta) return;

		if (key.upArrow) {
			setListIndex((prev) => Math.max(0, prev - 1));
		} else if (key.downArrow) {
			setListIndex((prev) => Math.min(modelList.length - 1, prev + 1));
		} else if (key.return) {
			const entry = modelList[listIndex];
			if (entry) {
				if (entry.inConfig) {
					onRemoveModel(providerId, entry.id);
					if (!entry.onServer) clampListIndex();
				} else if (entry.discovered) {
					setFormValues({ name: entry.name, context: '', output: '' });
					setToolsSupported(true);
					setActiveField(0);
					setFormMode('add');
				}
			}
		} else if (input === 'a') {
			const entry = modelList[listIndex];
			if (entry?.discovered && !entry.inConfig) {
				setFormValues({ name: entry.name, context: '', output: '' });
				setToolsSupported(true);
				setActiveField(0);
				setFormMode('add');
			}
		} else if (input === 'r') {
			if (providerId) {
				onDiscoverModels(providerId);
			}
		} else if (input === 'd') {
			const entry = modelList[listIndex];
			if (entry?.inConfig) {
				onRemoveModel(providerId, entry.id);
				if (!entry.onServer) clampListIndex();
			}
		} else if (input === 'x') {
			if (staleEntries.length > 0) {
				onRemoveModels(providerId, staleEntries.map((e) => e.id));
				clampListIndex(staleEntries.length);
			}
		} else if (input === 's') {
			onSave();
		} else if (input === 'q') {
			onQuit();
		} else if (input === 'b' || key.escape) {
			onBack();
		}
	});

	const renderList = () => (
		<Box flexDirection="column" padding={1}>
			<Box borderStyle="round" borderColor="blue" flexDirection="column" padding={1} marginBottom={1}>
				<Text bold color="blue">  Models — {providerName} </Text>
			</Box>

			<Box flexDirection="column" padding={1} marginBottom={1}>
				<Text color="gray">  Endpoint: {providerBaseURL}</Text>
			</Box>

			{error && !providerLoading && (
				<Box marginBottom={1} padding={1}>
					<Box flexDirection="column">
						<Text color="red">⚠ {error}</Text>
						<Text color="gray">  Press 'r' to retry discovery</Text>
					</Box>
				</Box>
			)}

			{statusMessage && (
				<Box marginBottom={1}>
					<Text color="green">✓ {statusMessage}</Text>
				</Box>
			)}

			{providerLoading && (
				<Box marginBottom={1}>
					<Text color="yellow">⟳ Discovering models from {providerBaseURL}...</Text>
				</Box>
			)}

			{!providerId ? (
				<Text color="gray">  No provider selected.</Text>
			) : modelList.length === 0 && !providerLoading && !error ? (
				<Box padding={1}>
					<Text color="gray">  No models discovered.</Text>
					<Text color="gray">  Press 'r' to discover models from {providerBaseURL}.</Text>
				</Box>
			) : modelList.length > 0 ? (
				modelList.map((entry, i) => {
					const isSelected = i === listIndex;
					const isStale = hasDiscovered && entry.inConfig && !entry.onServer;
					const cfg = entry.inConfig ? entry.config : null;

					return (
						<Box
							key={entry.id}
							borderStyle={isSelected ? 'bold' : 'round'}
							borderColor={isSelected ? 'cyan' : isStale ? 'yellow' : entry.inConfig ? 'green' : 'gray'}
							flexDirection="column"
							padding={1}
							marginBottom={1}
						>
							<Box justifyContent="space-between">
								<Text bold color={isSelected ? 'cyan' : 'white'}>
									{' '}
									{entry.id}
								</Text>
								<Text color={isStale ? 'yellow' : entry.inConfig ? 'green' : 'gray'}>
									{isStale
										? '⚠ in config, not on server'
										: entry.inConfig
											? '✓ in config'
											: '○ not in config'}
								</Text>
							</Box>
							<Text color="gray">  {entry.discovered?.owned_by ?? (isStale ? 'no longer served by endpoint' : 'unknown')}</Text>
							{cfg && (
								<Box marginTop={1}>
									<Text color="gray">  Name: {cfg.name ?? entry.id}</Text>
									<Text color="gray">
										{'  Tools: '}
										{(cfg.tools ?? cfg.capabilities?.tools) ? 'yes' : 'no'}
									</Text>
									{cfg.limit && (
										<Text color="gray">
											{'  Context: '}
											{cfg.limit.context.toLocaleString()}
											{'  Output: '}
											{cfg.limit.output.toLocaleString()}
										</Text>
									)}
								</Box>
							)}
						</Box>
					);
				})
			) : null}

			{providerLoading || modelList.length > 0 || error ? null : (
				<Box padding={1}>
					<Text color="gray">  Press 'r' to discover models.</Text>
				</Box>
			)}

			<Box borderStyle="round" borderColor="gray" flexDirection="column" padding={1} marginTop={1}>
				<Text bold color="gray">  Actions </Text>
				<Box flexDirection="column" marginTop={1} paddingLeft={2}>
					<Text color="white">  [↑/↓] Navigate</Text>
					<Text color="white">  [Enter] Toggle add/remove</Text>
					<Text color="white">  [a] Add selected to config</Text>
					<Text color="white">  [d] Remove from config</Text>
					{staleEntries.length > 0 && (
						<Text color="yellow">  [x] Prune {staleEntries.length} stale model(s) not on server</Text>
					)}
					<Text color="white">  [r] Refresh / Discover</Text>
					<Text color={unsavedChanges ? 'yellow' : 'white'}>
						{'  [s] Save Config'} {unsavedChanges ? '(unsaved)' : ''}
					</Text>
					<Text color="white">  [q] Quit</Text>
					<Text color="white">  [b] Back</Text>
				</Box>
			</Box>
		</Box>
	);

	const renderForm = () => {
		const model = modelList[listIndex]?.discovered;
		if (!model) return null;

		return (
			<Box flexDirection="column" padding={1}>
				<Box borderStyle="round" borderColor="cyan" flexDirection="column" padding={1} marginBottom={1}>
					<Text bold color="cyan">  Add Model to {providerName} </Text>
					<Text color="gray">  Model ID: {model.id}</Text>
				</Box>

				<Box flexDirection="column" padding={1}>
					{FORM_FIELDS.map((field, i) => {
						const isActive = i === activeField;
						const isToggle = field.type === 'toggle';
						const value = isToggle
							? toolsSupported
								? 'yes'
								: 'no'
							: formValues[field.key] || (isActive ? '' : '');

						return (
							<Box key={field.key} flexDirection="column" padding={1}>
								<Text color={isActive ? 'cyan' : 'gray'}>  {field.label}</Text>
								<Box flexDirection="row" alignItems="flex-end">
									<Text color="white">    </Text>
									<Text color={isActive ? 'white' : 'gray'}>{value}</Text>
									{isActive && !isToggle && <Text backgroundColor="white" color="black">{' '}</Text>}
									{isActive && isToggle && (
										<Text color={toolsSupported ? 'green' : 'red'}>  [toggle]</Text>
									)}
								</Box>
							</Box>
						);
					})}
				</Box>

				<Box borderStyle="round" borderColor="gray" flexDirection="column" padding={1} marginTop={1}>
					<Text bold color="gray">  Form Controls </Text>
					<Box flexDirection="column" marginTop={1} paddingLeft={2}>
						<Text color="white">  [Tab] Next field</Text>
						<Text color="white">  [Enter] Confirm add</Text>
						<Text color="white">  [Esc] Cancel</Text>
					</Box>
				</Box>
			</Box>
		);
	};

	return formMode === 'list' ? renderList() : renderForm();
};
