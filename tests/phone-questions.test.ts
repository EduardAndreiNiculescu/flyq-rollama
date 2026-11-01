import { describe, expect, it } from 'vitest';
import { DEMO_FLIGHTS } from '../src/core/flight';
import { RollamaEngine, type RawCompleter } from '../src/llm/rollamaEngine';
import { runToolLoop } from '../src/tools/loop';
import { createTools } from '../src/tools/registry';

/**
 * The questions to ask the assistant on the phone (docs/INTREBARI_TEST_AI.md). Each runs through the same loop as the phone (router candidates, fast path,
 * sanitizer, composer) with a model that says "none" and with one that always picks get_flight_details (the two bad cases seen on the phone).
 * If one of these fails on the phone but passes here, the difference is in the phone (see the diagnostic box in Mod test), not in the logic.
 */
const mk = (json: string): RawCompleter => ({ stop: async () => {}, completeRaw: async () => ({ text: json, stats: { timeToFirstTokenMs: 1, tokensPerSecond: 1, totalMs: 1, tokens: 1 } }) });
const MODELS: Record<string, string> = { none: '{"name":"none","arguments":{}}', details: '{"name":"get_flight_details","arguments":{}}' };

export const PHONE_QUESTIONS: { q: string; text?: RegExp; tool?: string }[] = [
  // reguli
  { q: 'Am voie cu câine?', text: /câinii|pisicile/ },
  { q: 'Pot lua pisica cu mine', text: /pisicile/ },
  { q: 'Am voie cu câini?', text: /câinii|pisicile/ },
  { q: 'am voie cu caini?', text: /câinii|pisicile/ },
  { q: 'Pot lua pisicile cu mine?', text: /pisicile/ },
  { q: 'Am voie cu animale de companie?', text: /câinii|pisicile/ },
  { q: 'Pot lua cuțite?', text: /ascuțite/ },
  { q: 'Pot lua foarfecă în bagajul de mână?', text: /ascuțite|foarfece/ },
  { q: 'Pot lua medicamente la mine?', text: /Medicamentele/ },
  { q: 'Am voie cu lichide?', text: /100 ml/ },
  { q: 'Pot lua apă în avion?', text: /100 ml|lichid/i },
  { q: 'Pot lua un powerbank?', text: /powerbank/i },
  { q: 'Pot lua laptop în bagajul de mână?', text: /laptop/i },
  { q: 'Ce dimensiuni are bagajul de mână?', text: /cabină/i },
  { q: 'Am voie cu alcool?', text: /duty-free/ },
  { q: 'Ce documente îmi trebuie?', text: /document/i },
  { q: 'Sunt în scaun cu rotile, am nevoie de asistență', text: /mobilitate redusă/ },
  { q: 'Mi-a pierdut bagajul, ce fac?', text: /bagajul nu ajunge|PIR/ },
  { q: 'Primesc despăgubire dacă zborul e anulat?', text: /compensa|despăgub|anul/i },
  // țări din afara UE: nu se răspunde cu regulile UE
  { q: 'Pot călători cu buletinul în China?', text: /MAE|mae\.ro|bază de cunoștințe|baza mea/ },
  { q: 'Pot intra în SUA cu pașaport românesc?', text: /mae\.ro/ },
  { q: 'Pot merge în Dubai cu buletinul?', text: /mae\.ro/ },
  { q: 'Am nevoie de viză pentru Japonia?', text: /mae\.ro/ },
  { q: 'Pot merge în Italia cu buletinul?', text: /Cetățenii UE/ },
  // date din bilet și din zbor
  { q: 'Ce loc am?', text: /12A/ },
  { q: 'Ce scaun am?', text: /12A/ },
  { q: 'La ce oră e îmbarcarea?', text: /08:35/ },
  { q: 'Când începe îmbarcarea?', text: /08:35/ },
  { q: 'Cât durează securitatea?', text: /durată exactă/i },
  { q: 'La ce oră decolăm?', text: /decolare/i },
  { q: 'Când aterizăm?', text: /aterizare/i },
  { q: 'Cât durează zborul?', text: /Durata/i },
  { q: 'Pe ce poartă sunt?', text: /Poarta/i },
  // hartă
  { q: 'Unde e toaleta?', tool: 'find_place' },
  { q: 'Unde pot mânca ceva?', tool: 'find_place' },
  { q: 'Unde e zona VIP?', text: /poziția exactă|VIP/ },
  { q: 'Unde e barul lui Coco?', text: /Coco/ },
  { q: 'Unde e cabinetul medical?', text: /Cabinetul medical/ },
  { q: 'Unde pot închiria o mașină?', text: /Închirieri auto/ },
  { q: 'Unde e ghișeul de informații?', text: /Ghișeul de informații/ },
  { q: 'Unde e controlul de securitate?', text: /Controlul de securitate/ },
  { q: 'Unde e poarta 3?', text: /Poarta 3/ },
  { q: 'Where is the restroom?', text: /Toilets/ },
  { q: 'Unde găsesc o farmacie?', tool: 'open_airport_map' },
  { q: 'Unde e un bancomat?', tool: 'find_place' },
  // social
  { q: 'Salut', text: /Salut/ },
  { q: 'Mulțumesc', text: /Cu plăcere/ },
  { q: 'Cine ești tu?', text: /asistentul/ },
  // engleză
  { q: 'Can I bring my dog', text: /dogs|cats/ },
  { q: 'What is my seat?', text: /12A/ },
  { q: 'When does boarding start?', text: /08:35/ },
  { q: 'How long is security?', text: /no exact duration/i },
];

/** Questions the deterministic layers do NOT catch (no router candidate, no fast path): only the model can route them. With the right tool chosen they must still end in a real answer, not in "I have no safe wording". */
export const MODEL_ONLY: { q: string; tool: string; text: RegExp }[] = [
  { q: 'Câtă vreme mai am până să plec?', tool: 'get_time_remaining', text: /decolării|decolare|mai sunt/i },
  { q: 'Cât timp îmi mai rămâne la dispoziție?', tool: 'get_time_remaining', text: /decolării|decolare|mai sunt/i },
  { q: 'Unde trebuie să mă duc ca să mă urc în avion?', tool: 'get_gate', text: /Poarta/ },
  { q: 'La care ușă mă prezint pentru zborul meu?', tool: 'get_gate', text: /Poarta/ },
  { q: 'Spune-mi numărul ușii de urcare', tool: 'get_gate', text: /Poarta/ },
  { q: 'Cum stă zborul meu acum?', tool: 'get_flight_details', text: /decolare|decolarea/i },
];

describe('questions only the model can route (right tool chosen)', () => {
  for (const c of MODEL_ONLY) {
    it(c.q, async () => {
      const r = await runToolLoop(new RollamaEngine(mk(`{"name":"${c.tool}","arguments":{}}`)), [{ role: 'system', content: '' }, { role: 'user', content: c.q }], { now: () => new Date('2026-11-01T09:00:00+02:00'), context: { flightNumber: 'DEMO123', seat: '12A', boarding: '08:35' } as never, flights: DEMO_FLIGHTS }, () => {}, { tools: createTools(), maxSteps: 3, fastPath: true, intentRouting: true, allowSideEffects: true });
      expect(r.text).toMatch(c.text);
      expect(r.text).not.toMatch(/formulare sigură|safe wording|Nu am găsit un răspuns sigur/);
    });
  }
});

describe('phone question battery', () => {
  for (const [name, json] of Object.entries(MODELS)) {
    for (const c of PHONE_QUESTIONS) {
      it(`[${name}] ${c.q}`, async () => {
        const r = await runToolLoop(new RollamaEngine(mk(json)), [{ role: 'system', content: '' }, { role: 'user', content: c.q }], { now: () => new Date('2026-11-01T09:00:00+02:00'), context: { flightNumber: 'DEMO123', seat: '12A', boarding: '08:35' } as never, flights: DEMO_FLIGHTS }, () => {}, { tools: createTools(), maxSteps: 3, fastPath: true, intentRouting: true, allowSideEffects: true });
        if (c.text) expect(r.text).toMatch(c.text);
        if (c.tool) expect(r.trace.map(t => t.name)).toContain(c.tool);
      });
    }
  }
});
