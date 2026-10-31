/**
 * Start the test gateway:   npm run gateway
 * Env: AIRLABS_API_KEY (required), AIRLABS_MAX_CALLS (default 25 upstream calls per process),
 *      OLLAMA_URL (default http://127.0.0.1:11435), OLLAMA_MODEL (default ff-base), GATEWAY_PORT (default 18090).
 * Binds to 127.0.0.1 unless GATEWAY_HOST is set; then GATEWAY_TOKEN is mandatory. Never prints the API key or the token.
 */
import { AirLabsClient } from '../airlabsClient';
import { contractFromEnv } from '../../src/llm/contract';
import { createGateway } from './gateway';
import { OllamaEngine } from './ollamaEngine';
import { AirLabsFlightProvider } from './providers';
import { DemoFlightProvider } from './demoProvider';

const port = Number(process.env.GATEWAY_PORT ?? 18090);
const demo = process.env.GATEWAY_DEMO === '1';
const provider = demo ? new DemoFlightProvider() : new AirLabsFlightProvider(AirLabsClient.fromEnv(), { maxCalls: Number(process.env.AIRLABS_MAX_CALLS ?? 25) });
const engine = new OllamaEngine({ baseUrl: process.env.OLLAMA_URL ?? 'http://127.0.0.1:11435', model: process.env.OLLAMA_MODEL ?? 'ff-base', numCtx: Number(process.env.OLLAMA_NUM_CTX ?? 4096), temperature: Number(process.env.OLLAMA_TEMP ?? 0.2), presencePenalty: Number(process.env.OLLAMA_PRESENCE ?? 0) });
// GATEWAY_HOST=0.0.0.0 lets a phone on the same Wi-Fi reach it; that REQUIRES GATEWAY_TOKEN (the phone sends it as a Bearer token).
const host = process.env.GATEWAY_HOST ?? '127.0.0.1';
const token = process.env.GATEWAY_TOKEN || undefined;
if (host !== '127.0.0.1' && host !== 'localhost' && !token) { console.error('refusing to listen beyond loopback without GATEWAY_TOKEN'); process.exit(1); }
const server = createGateway({ provider, engine, modelInfo: () => engine.describe(), dataMode: demo ? 'demo' : 'live', token, contract: contractFromEnv(process.env.FF_CONTRACT), logChat: process.env.GATEWAY_LOG_CHAT === '1', guard: process.env.GATEWAY_GUARD !== '0', compose: process.env.FF_COMPOSE !== '0', fastPath: process.env.FF_FAST === '1', log: (l) => console.log(new Date().toISOString().slice(11, 19), l) });
server.listen(port, host, () => console.log(`gateway on http://${host}:${port}${token ? ' (token required)' : ''}  model=${process.env.OLLAMA_MODEL ?? 'ff-base'}  data=${demo ? 'fictional demo' : 'AirLabs'}  upstream cap=${process.env.AIRLABS_MAX_CALLS ?? 25}`));
