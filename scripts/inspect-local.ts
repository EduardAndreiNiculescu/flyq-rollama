process.env.GATEWAY_DEMO ??= '1';
process.env.FF_CONTRACT ??= 'v4';
process.env.FF_FAST ??= '1';
process.env.OLLAMA_URL ??= 'http://127.0.0.1:11434';
process.env.OLLAMA_MODEL ??= 'ff-adapter-v4:latest';

await import('../server/gateway/main');
