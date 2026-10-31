import { describe, expect, it } from 'vitest';
import { contractFingerprint, CONTRACT_V4_VERSION, modelToolSpecs, STATIC_SYSTEM_V4 } from '../src/llm/contractV4';
import { createTools, toolSpecs } from '../src/tools/registry';

describe('V4 model contract', () => {
  it('has a static system prompt: no clock, no flight number, no context', () => {
    expect(STATIC_SYSTEM_V4).not.toMatch(/\d{4}-\d{2}-\d{2}|CURRENT TIME|PASSENGER CONTEXT|FLIGHT FACTS|journey stage/i);
    expect(STATIC_SYSTEM_V4.length).toBeLessThan(1800); // ~380 tokens
  });

  it('the model sees the same tools, arguments and types as the registry', () => {
    const real = toolSpecs(createTools());
    const seen = modelToolSpecs();
    expect(seen.map(s => s.function.name)).toEqual(real.map(s => s.function.name));
    for (const [i, s] of seen.entries()) {
      const r = real[i].function.parameters;
      expect(Object.keys(s.function.parameters.properties ?? {})).toEqual(Object.keys(r.properties ?? {}));
      for (const [k, v] of Object.entries(s.function.parameters.properties ?? {})) expect((v as { type: string }).type).toBe((r.properties![k] as { type: string }).type);
      expect(s.function.parameters.required).toEqual(r.required);
    }
  });

  it('leaves the validation words to the app', () => {
    const text = JSON.stringify(modelToolSpecs());
    expect(text).not.toMatch(/pattern|maxLength|additionalProperties/);
  });

  // Golden: if this fails you changed what the model sees. Retrain, bump CONTRACT_V4_VERSION, then update the fingerprint.
  it('has the frozen fingerprint', () => {
    expect(CONTRACT_V4_VERSION).toBe('v4.0');
    expect(contractFingerprint()).toBe('ed4815c7');
  });
});
