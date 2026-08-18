#!/usr/bin/env bun
import { render } from 'ink';
import { App } from './ui/App';
import { logDebug } from './api';

logDebug('=== OLMA starting ===');

render(<App />, {
	debug: process.env.NODE_ENV === 'development',
});

logDebug('=== OLMA rendered ===');

