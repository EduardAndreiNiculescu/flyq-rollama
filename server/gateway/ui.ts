import { readFileSync } from 'node:fs';

// The inspector is served from the gateway origin, so it can call the local API directly.
export const UI_HTML = readFileSync(new URL('./inspector.html', import.meta.url), 'utf8');
