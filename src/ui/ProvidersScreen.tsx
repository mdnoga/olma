import { useInput } from 'ink';
import { useState, type FC } from 'react';
import { Box, Text } from 'ink';
import { getProviders, getProviderModels, getProviderBaseURL, getProviderBaseURLRaw, getProviderApiKeyRaw, getProviderPackage, isConfigV2 } from '../config';
import type { OpencodeConfig, Screen } from '../types';

interface ProviderFormData {
	providerId: string;
	name: string;
	baseURL: string;
	apiKey: string;
	npmPackage: string;
}

interface ProvidersScreenProps {
	config: OpencodeConfig;
	selectedProvider: string | null;
	setSelectedProvider: (id: string | null) => void;
	setScreen: (s: Screen) => void;
	unsavedChanges: boolean;
	error: string | null;
	statusMessage: string | null;
	providerLoading: boolean;
	onSave: () => void;
	onAddProvider: (data: ProviderFormData) => void;
	onUpdateProvider: (data: ProviderFormData) => void;
	onDeleteProvider: (providerId: string) => void;
	onDiscoverModels: (providerId: string) => void;
	onBack: () => void;
	onQuit: () => void;
}

type FormMode = 'list' | 'add' | 'edit';

const PROVIDER_FIELDS = [
	{ key: 'id', label: 'Provider ID', placeholder: 'e.g., omlx' },
	{ key: 'name', label: 'Display Name', placeholder: 'e.g., oMLX Local Server' },
	{ key: 'npm', label: 'NPM/Pkg', placeholder: '@ai-sdk/openai-compatible' },
	{ key: 'baseURL', label: 'Base URL', placeholder: 'http://127.0.0.1:8000/v1' },
	{ key: 'apiKey', label: 'API Key', placeholder: '(leave blank if not needed)' },
];

export const ProvidersScreen: FC<ProvidersScreenProps> = ({
	config,
	selectedProvider,
	setSelectedProvider,
	setScreen,
	unsavedChanges,
	error,
	statusMessage,
	providerLoading,
	onSave,
	onAddProvider,
	onUpdateProvider,
	onDeleteProvider,
	onDiscoverModels,
	onBack,
	onQuit,
}) => {
	const [mode, setMode] = useState<FormMode>('list');
	const [formValues, setFormValues] = useState<Record<string, string>>({});
	const [activeField, setActiveField] = useState(0);
	const [listIndex, setListIndex] = useState(0);

	const providers = getProviders(config);
	const providerKeys = Object.keys(providers);
	const v2 = isConfigV2(config);

	const handleFormInput = (
		input: string,
		key: { escape: boolean; tab: boolean; backspace: boolean; return: boolean; ctrl: boolean; meta: boolean },
	) => {
		if (key.ctrl || key.meta) return;
		if (key.escape) {
			setMode('list');
			return;
		}
		if (key.tab) {
			setActiveField((prev) => (prev + 1) % PROVIDER_FIELDS.length);
			return;
		}
		if (key.backspace) {
			const fieldKey = PROVIDER_FIELDS[activeField].key;
			setFormValues((prev) => ({
				...prev,
				[fieldKey]: prev[fieldKey]?.slice(0, -1) ?? '',
			}));
			return;
		}
		if (key.return) {
			if (activeField === PROVIDER_FIELDS.length - 1) {
				submitForm();
			} else {
				setActiveField((prev) => (prev + 1) % PROVIDER_FIELDS.length);
			}
			return;
		}
		if (input && input.length === 1) {
			const fieldKey = PROVIDER_FIELDS[activeField].key;
			setFormValues((prev) => ({
				...prev,
				[fieldKey]: (prev[fieldKey] ?? '') + input,
			}));
		}
	};

	const submitForm = () => {
		const providerId = formValues.id?.trim();
		if (!providerId) return;
		const data: ProviderFormData = {
			providerId,
			name: formValues.name || providerId,
			baseURL: formValues.baseURL,
			apiKey: formValues.apiKey,
			npmPackage: formValues.npm || (v2 ? 'aisdk:@ai-sdk/openai-compatible' : '@ai-sdk/openai-compatible'),
		};
		if (mode === 'add') {
			onAddProvider(data);
		} else {
			onUpdateProvider(data);
		}
	};

	useInput((input, key) => {
		if (mode === 'add' || mode === 'edit') {
			handleFormInput(input, key);
			return;
		}

		if (key.ctrl || key.meta) return;

		if (key.upArrow) {
			setListIndex((prev) => Math.max(0, prev - 1));
		} else if (key.downArrow) {
			setListIndex((prev) => Math.min(providerKeys.length - 1, prev + 1));
		} else if (key.return) {
			const id = providerKeys[listIndex];
			if (id) {
				setSelectedProvider(id);
				setScreen('home');
			}
		} else if (input === 'a') {
			setMode('add');
			setFormValues({});
			setActiveField(0);
		} else if (input === 'e') {
			const id = providerKeys[listIndex];
			if (id) {
				const provider = providers[id];
				if (provider) {
					setMode('edit');
					// Raw values so `{env:...}` references survive the round-trip
					// instead of being written back as resolved secrets.
					setFormValues({
						id,
						name: provider.name ?? '',
						npm: getProviderPackage(provider) ?? '',
						baseURL: getProviderBaseURLRaw(provider) ?? '',
						apiKey: getProviderApiKeyRaw(provider) ?? '',
					});
					setActiveField(0);
				}
			}
		} else if (input === 'd') {
			const id = providerKeys[listIndex];
			if (id) {
				onDeleteProvider(id);
				setListIndex((prev) => Math.min(prev, Math.max(0, providerKeys.length - 2)));
			}
		} else if (input === 'r') {
			const id = providerKeys[listIndex];
			if (id) {
				onDiscoverModels(id);
			}
		} else if (input === 's') {
			onSave();
		} else if (input === 'q') {
			onQuit();
		} else if (input === 'b' || key.escape) {
			onBack();
		}
	});

	const renderForm = () => {
		const modeLabel = mode === 'add' ? 'Add Provider' : 'Edit Provider';
		const formatHint = v2 ? 'V2 (providers/package/settings)' : 'V1 (provider/npm/options)';

		return (
			<Box flexDirection="column" padding={1}>
				<Box borderStyle="round" borderColor="cyan" flexDirection="column" padding={1} marginBottom={1}>
					<Text bold color="cyan">  {modeLabel} </Text>
					<Text color="gray">  Format: {formatHint}</Text>
				</Box>

				{PROVIDER_FIELDS.map((field, i) => {
					const isActive = i === activeField;
					const value = formValues[field.key] ?? '';

					return (
					<Box key={field.key} flexDirection="column" padding={1} borderColor="gray">
						<Text color={isActive ? 'cyan' : 'gray'}>  {field.label}</Text>
						<Box flexDirection="row">
							<Text color="white">    </Text>
							<Text color={isActive ? 'white' : 'gray'}>
								{value || (isActive ? '' : field.placeholder)}
							</Text>
							{isActive && <Text backgroundColor="white" color="black">{' '}</Text>}
						</Box>
					</Box>
					);
				})}

				<Box marginTop={1} paddingLeft={1}>
					<Text color="gray">  [Tab] next field  [Enter] submit  [Esc] cancel</Text>
				</Box>
			</Box>
		);
	};

	const renderList = () => (
		<Box flexDirection="column" padding={1}>
			<Box borderStyle="round" borderColor="blue" flexDirection="column" padding={1} marginBottom={1}>
				<Text bold color="blue">  Providers ({providerKeys.length}) </Text>
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

			{providerKeys.length === 0 ? (
				<Text color="gray">  No providers configured. Press 'a' to add one.</Text>
			) : (
				providerKeys.map((id, i) => {
					const provider = providers[id]!;
					const models = getProviderModels(config, id);
					const modelKeys = Object.keys(models);
					const isSelected = i === listIndex;

					return (
						<Box
							key={id}
							borderStyle={isSelected ? 'bold' : 'round'}
							borderColor={isSelected ? 'cyan' : 'gray'}
							flexDirection="column"
							padding={1}
							marginBottom={1}
						>
							<Box justifyContent="space-between">
								<Text bold color={isSelected ? 'cyan' : 'white'}>
									{' '}
									{id}
								</Text>
							</Box>
							<Text color="gray">  {provider.name ?? id}</Text>
							<Text color="gray">  {getProviderBaseURL(provider) ?? 'No endpoint'}</Text>
							<Text color="gray">  Package: {getProviderPackage(provider) ?? 'default'}</Text>
							<Text color="gray">  {modelKeys.length} model(s) configured</Text>
						</Box>
					);
				})
			)}

			<Box borderStyle="round" borderColor="gray" flexDirection="column" padding={1} marginTop={1}>
				<Text bold color="gray">  Actions </Text>
				<Box flexDirection="column" marginTop={1} paddingLeft={2}>
					<Text color="white">  [a] Add Provider</Text>
					<Text color="white">  [e] Edit Selected Provider</Text>
					<Text color="white">  [d] Delete Selected Provider</Text>
					<Text color="white">  [r] Discover Models</Text>
					<Text color={unsavedChanges ? 'yellow' : 'white'}>
						{'  [s] Save Config'} {unsavedChanges ? '(unsaved)' : ''}
					</Text>
					<Text color="white">  [q] Quit</Text>
					<Text color="white">  [b] Back to Home</Text>
				</Box>
			</Box>
		</Box>
	);

	return mode === 'list' ? renderList() : renderForm();
};
