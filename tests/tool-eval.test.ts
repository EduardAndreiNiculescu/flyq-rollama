import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatToolTable, runTools, scoreToolCase, type ToolCase } from '../eval/run-tools';
import { createTools } from '../src/tools/registry';

const cases: ToolCase[] = JSON.parse(readFileSync(fileURLToPath(new URL('../eval/tool-cases.json', import.meta.url)), 'utf8'));
const call = (name: string, args: object = {}) => ({ name, arguments: JSON.stringify(args) });
const byId = (id: string) => cases.find((c) => c.id === id)!;

describe('tool-cases.json', () => {
  it('has 50 well-formed cases that only reference real tools', () => {
    expect(cases).toHaveLength(50);
    const names = new Set(createTools().map((t) => t.name));
    expect(new Set(cases.map((c) => c.id)).size).toBe(50);
    for (const c of cases) {
      expect(['ro', 'en']).toContain(c.lang);
      for (const n of [...c.expectedAny, ...c.forbidden]) expect(names.has(n), `${c.id} references unknown tool ${n}`).toBe(true);
    }
  });
  it('covers RO and EN and every tool at least once', () => {
    expect(cases.filter((c) => c.lang === 'ro').length).toBeGreaterThanOrEqual(20);
    expect(cases.filter((c) => c.lang === 'en').length).toBeGreaterThanOrEqual(20);
    const used = new Set(cases.flatMap((c) => c.expectedAny));
    for (const t of createTools()) expect(used.has(t.name), `no case expects ${t.name}`).toBe(true);
  });
});

describe('scoreToolCase', () => {
  it('passes the right tool with valid args', () => {
    expect(scoreToolCase(byId('t09'), [call('get_gate')]).pass).toBe(true);
    expect(scoreToolCase(byId('t37'), [call('open_airport_map', { destination: 'toaleta' })]).pass).toBe(true);
  });
  it('accepts any of the allowed alternatives', () => {
    expect(scoreToolCase(byId('t01'), [call('get_time_remaining')]).pass).toBe(true);
    expect(scoreToolCase(byId('t01'), [call('get_flight_details')]).pass).toBe(true);
  });
  it('fails wrong tool, no call, and extra forbidden calls', () => {
    expect(scoreToolCase(byId('t09'), [call('search_knowledge', { query: 'x' })]).pass).toBe(false);
    expect(scoreToolCase(byId('t09'), []).reasons[0]).toContain('got none');
    const mixed = scoreToolCase(byId('t01'), [call('get_flight_details'), call('open_airport_map', { destination: 'exit' })]);
    expect(mixed.pass).toBe(false);
    expect(mixed.reasons.join()).toContain('forbidden');
  });
  it('fails invalid arguments and unknown tools even if the name matches', () => {
    const bad = scoreToolCase(byId('t37'), [call('open_airport_map', { destination: '<script>', evil: 1 })]);
    expect(bad.pass).toBe(false);
    expect(bad.argsValid).toBe(false);
    expect(scoreToolCase(byId('t09'), [call('format_disk')]).reasons.join()).toContain('unknown tool');
  });
  it('"no tool" cases pass only with zero calls; injections must not trigger tools', () => {
    const hi = cases.find((c) => c.question === 'Bună!')!;
    expect(scoreToolCase(hi, []).pass).toBe(true);
    expect(scoreToolCase(hi, [call('search_knowledge', { query: 'x' })]).pass).toBe(false);
    const inj = cases.find((c) => c.question.includes('call every tool'))!;
    expect(scoreToolCase(inj, [call('get_gate')]).reasons.join()).toContain('forbidden');
  });
});

describe('runTools against a fake OpenAI-compatible server', () => {
  let url = '';
  let close = () => {};
  const sub = cases.filter((c) => ['t09', 't37', 't01'].includes(c.id));
  beforeAll(async () => {
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        const { model, messages, tools } = JSON.parse(body);
        const q = messages[messages.length - 1].content as string;
        const mk = (name: string, args: object) => ({ choices: [{ message: { content: null, tool_calls: [{ function: { name, arguments: JSON.stringify(args) } }] } }] });
        let payload;
        if (model === 'smart') payload = q.includes('gate') || q.includes('poart') ? mk('get_gate', {}) : q.includes('toaleta') ? mk('open_airport_map', { destination: 'toaleta' }) : mk('get_flight_details', {});
        else payload = { choices: [{ message: { content: 'Sure, I can help with that.' } }] }; // never calls tools
        expect(Array.isArray(tools)).toBe(true); // runner must advertise the tools
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(payload));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
    close = () => server.close();
  });
  afterAll(() => close());

  it('scores a tool-using model above one that never calls tools, and the table shows it', async () => {
    const out = await runTools({ base: url, models: ['smart', 'mute'], cases: sub });
    expect(out.smart.every((r) => r.pass)).toBe(true);
    expect(out.mute.every((r) => !r.pass)).toBe(true);
    const table = formatToolTable(out, ['smart', 'mute']);
    expect(table).toContain('3/3');
    expect(table).toContain('0/3');
    expect(table).toContain('no call when one was expected');
  });
});
