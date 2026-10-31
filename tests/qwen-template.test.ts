import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseToolCalls, pyJson, renderQwen3 } from '../eval/lib/qwen-template';

type Golden = Record<string, { messages: never[]; tools: unknown[] | null; prompt: string }>;
const golden: Golden = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/qwen3-template-golden.json', import.meta.url)), 'utf8'));

describe('renderQwen3 equals the official HF template (enable_thinking=False)', () => {
  for (const [name, g] of Object.entries(golden)) {
    it(`golden: ${name}`, () => {
      expect(renderQwen3(g.messages, g.tools ?? undefined)).toBe(g.prompt);
    });
  }
  it('golden file really contains tools, a tool round trip and non-ASCII text', () => {
    expect(golden.tools.prompt).toContain('<tools>');
    expect(golden.tool_roundtrip.prompt).toContain('<tool_response>');
    expect(golden.plain.prompt).toContain('ă, ț');
  });
});

describe('pyJson', () => {
  it('matches Python json.dumps(ensure_ascii=False) separators and keeps order', () => {
    expect(pyJson({ b: 1, a: [1, 'x', { c: null }], t: true })).toBe('{"b": 1, "a": [1, "x", {"c": null}], "t": true}');
    expect(pyJson('ă"\n')).toBe('"ă\\"\\n"');
  });
});

describe('parseToolCalls', () => {
  it('extracts calls and strips them and empty think blocks from the content', () => {
    const r = parseToolCalls('<think>\n\n</think>\nChecking.\n<tool_call>\n{"name": "get_gate", "arguments": {}}\n</tool_call>\n<tool_call>\n{"name": "open_airport_map", "arguments": {"destination": "toaleta"}}\n</tool_call>');
    expect(r.content).toBe('Checking.');
    expect(r.toolCalls).toEqual([{ name: 'get_gate', arguments: '{}' }, { name: 'open_airport_map', arguments: '{"destination":"toaleta"}' }]);
  });
  it('ignores malformed blocks and plain text', () => {
    expect(parseToolCalls('<tool_call>{oops}</tool_call>').toolCalls).toEqual([]);
    expect(parseToolCalls('<tool_call>{"arguments": {}}</tool_call>').toolCalls).toEqual([]);
    expect(parseToolCalls('Hello').toolCalls).toEqual([]);
    expect(parseToolCalls('Hello').content).toBe('Hello');
  });
});
