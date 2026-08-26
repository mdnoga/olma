import { useInput } from 'ink';
import { useState, useCallback, type FC } from 'react';
import { Box, Text } from 'ink';
import { maskSecret } from '../config';
import type { OpencodeConfig, Screen } from '../types';

interface EnvScreenProps {
	config: OpencodeConfig;
	envVars: Record<string, string>;
	envRefs: string[];
	statusMessage: string | null;
	error: string | null;
	onSaveEnv: (env: Record<string, string>) => void;
	onBack: () => void;
	onQuit: () => void;
}

type EnvFormMode = 'list' | 'add';

export const EnvScreen: FC<EnvScreenProps> = ({
	config,
	envVars,
	envRefs,
	statusMessage,
	error,
	onSaveEnv,
	onBack,
	onQuit,
}) => {
	const [listIndex, setListIndex] = useState(0);
	const [formMode, setFormMode] = useState<EnvFormMode>('list');
	const [formValues, setFormValues] = useState<Record<string, string>>({ key: '', value: '' });
	const [activeField, setActiveField] = useState<'key' | 'value'>('key');

	const envEntries = Object.entries(envVars);
	const isEditing = envEntries.length > 0;

	const getResolvedValue = useCallback(
		(varName: string): string => {
			return process.env[varName] ?? envVars[varName] ?? '';
		},
		[envVars],
	);

	useInput((input, key) => {
		if (key.ctrl || key.meta) return;

		if (formMode === 'add') {
			if (key.escape) {
				setFormMode('list');
				return;
			}
			if (key.tab) {
				setActiveField((prev) => (prev === 'key' ? 'value' : 'key'));
				return;
			}
			if (key.return) {
				if (formValues.key.trim()) {
					const newEnv = { ...envVars, [formValues.key.trim()]: formValues.value };
					onSaveEnv(newEnv);
				}
				setFormMode('list');
				setFormValues({ key: '', value: '' });
				setActiveField('key');
				return;
			}
			if (key.backspace) {
				setFormValues((prev) => ({
					...prev,
					[activeField]: prev[activeField]?.slice(0, -1) ?? '',
				}));
				return;
			}
			if (input && input.length === 1) {
				setFormValues((prev) => ({
					...prev,
					[activeField]: prev[activeField] + input,
				}));
			}
			return;
		}

		if (key.upArrow) {
			setListIndex((prev) => Math.max(0, prev - 1));
		} else if (key.downArrow) {
			setListIndex((prev) => Math.min(envEntries.length - 1, prev + 1));
		} else if (key.return) {
			if (envEntries.length > 0) {
				const [k, currentVal] = envEntries[listIndex];
				if (k) {
					setFormValues({ key: k, value: currentVal ?? '' });
					setActiveField('value');
					setFormMode('add');
				}
			}
		} else if (input === 'a') {
			setFormValues({ key: '', value: '' });
			setActiveField('key');
			setFormMode('add');
		} else if (input === 's') {
			onSaveEnv(envVars);
		} else if (input === 'd') {
			if (envEntries.length > 0) {
				const [k] = envEntries[listIndex];
				if (k) {
					const newEnv = { ...envVars };
					delete newEnv[k];
					onSaveEnv(newEnv);
				}
			}
		} else if (input === 'q') {
			onQuit();
		} else if (input === 'b' || key.escape) {
			onBack();
		}
	});

	const renderList = () => (
		<Box flexDirection="column" padding={1}>
			<Box borderStyle="round" borderColor="blue" flexDirection="column" padding={1} marginBottom={1}>
				<Text bold color="blue">  Environment Variables (.env) </Text>
			</Box>

			{statusMessage && (
				<Box marginBottom={1}>
					<Text color="green">✓ {statusMessage}</Text>
				</Box>
			)}

			{error && (
				<Box marginBottom={1}>
					<Text color="red">⚠ {error}</Text>
				</Box>
			)}

			{envRefs.length > 0 && (
				<Box flexDirection="column" padding={1} marginBottom={1}>
					<Text bold color="gray">  Referenced in config: </Text>
					{envRefs.map((ref) => {
						const resolved = getResolvedValue(ref);
						return (
							<Text key={ref} color="gray">
								{'  {env:'}{ref}
								{'}'} — {resolved ? maskSecret(resolved) : <Text color="red"> not set</Text>}
							</Text>
						);
					})}
				</Box>
			)}

			{envEntries.length === 0 ? (
				<Box padding={1} marginBottom={1}>
					<Text color="gray">  No environment variables configured.</Text>
					<Text color="gray">  Press 'a' to add one.</Text>
				</Box>
			) : (
				envEntries.map(([key, value], i) => {
					const isSelected = i === listIndex;
					const isReferenced = envRefs.includes(key);
					return (
						<Box
							key={key}
							borderStyle={isSelected ? 'bold' : 'round'}
							borderColor={isSelected ? 'cyan' : isReferenced ? 'yellow' : 'gray'}
							flexDirection="column"
							padding={1}
							marginBottom={1}
						>
							<Text bold color={isSelected ? 'cyan' : 'white'}>
								{' '}
								{key}
								{isReferenced && <Text color="yellow">  ⚡ referenced</Text>}
							</Text>
							<Text color="gray">  {maskSecret(value ?? '')}</Text>
						</Box>
					);
				})
			)}

			<Box borderStyle="round" borderColor="gray" flexDirection="column" padding={1} marginTop={1}>
				<Text bold color="gray">  Controls </Text>
				<Box flexDirection="column" marginTop={1} paddingLeft={2}>
					<Text color="white">  [↑/↓] Navigate</Text>
					<Text color="white">  [Enter] Edit</Text>
					<Text color="white">  [a] Add new var</Text>
					<Text color="white">  [d] Delete selected</Text>
					<Text color={envVars && Object.keys(envVars).length > 0 ? 'yellow' : 'white'}>
						{'  [s] Save .env'}
					</Text>
					<Text color="white">  [q] Quit</Text>
					<Text color="white">  [b] Back</Text>
				</Box>
			</Box>
		</Box>
	);

	const renderForm = () => (
		<Box flexDirection="column" padding={1}>
			<Box borderStyle="round" borderColor="cyan" flexDirection="column" padding={1} marginBottom={1}>
				<Text bold color="cyan">
					{' '}
					{formValues.key ? 'Edit' : 'Add'} Environment Variable
				</Text>
			</Box>

			<Box flexDirection="column" padding={1}>
				<Box flexDirection="column" padding={1}>
					<Text color={activeField === 'key' ? 'cyan' : 'gray'}>  Variable Name</Text>
					<Box flexDirection="row" alignItems="flex-end">
						<Text color="white">    </Text>
						<Text color={activeField === 'key' ? 'white' : 'gray'}>
							{formValues.key || (activeField === 'key' ? '' : '—')}
						</Text>
						{activeField === 'key' && <Text backgroundColor="white" color="black">{' '}</Text>}
					</Box>
				</Box>

				<Box flexDirection="column" padding={1}>
					<Text color={activeField === 'value' ? 'cyan' : 'gray'}>  Value</Text>
					<Box flexDirection="row" alignItems="flex-end">
						<Text color="white">    </Text>
						<Text color={activeField === 'value' ? 'white' : 'gray'}>
							{formValues.value || (activeField === 'value' ? '' : '—')}
						</Text>
						{activeField === 'value' && <Text backgroundColor="white" color="black">{' '}</Text>}
					</Box>
				</Box>
			</Box>

			<Box borderStyle="round" borderColor="gray" flexDirection="column" padding={1} marginTop={1}>
				<Text bold color="gray">  Form Controls </Text>
				<Box flexDirection="column" marginTop={1} paddingLeft={2}>
					<Text color="white">  [Tab] Switch field</Text>
					<Text color="white">  [Enter] Confirm</Text>
					<Text color="white">  [Esc] Cancel</Text>
				</Box>
			</Box>
		</Box>
	);

	return formMode === 'list' ? renderList() : renderForm();
};
