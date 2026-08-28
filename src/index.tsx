#!/usr/bin/env bun
import { render } from 'ink';
import { App } from './ui/App';
import { logDebug } from './api';

logDebug('=== OLMA starting ===');

const { waitUntilExit } = render(<App />, {
	debug: process.env.NODE_ENV === 'development',
});

logDebug('=== OLMA rendered ===');

await waitUntilExit();
logDebug('=== OLMA exited ===');
// Ink's exit() only unmounts the UI; lingering handles (raw-mode stdin,
// status timers, in-flight fetches) would keep the process alive.
process.exit(0);

