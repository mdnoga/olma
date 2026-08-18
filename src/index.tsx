#!/usr/bin/env bun
import { render } from 'ink';
import { App } from './ui/App';

render(<App />, {
	debug: process.env.NODE_ENV === 'development',
});

