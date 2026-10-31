import { describe, expect, it } from 'vitest';
import { composeAnswer } from '../src/tools/composer';
import { createTools, executeToolCall } from '../src/tools/registry';
import { guardToolAnswer } from '../src/tools/guardAnswer';
import { DEMO_FLIGHTS } from '../src/core/flight';

const tools = createTools();
const NOW = new Date('2026-10-31T09:00:00+02:00');
const deps = { now: () => NOW, context: { flightNumber: 'DEMO123' } as never, flights: DEMO_FLIGHTS };
async function run(name: string) {
  const r = await executeToolCall(tools, name, {}, deps);
  return [{ name, ok: r.ok, data: r.ok ? r.data : null }];
}

describe('composeAnswer', () => {
  it('answers a departure question from the tool result, in the passenger\'s language', async () => {
    const ro = composeAnswer('La ce oră decolăm?', await run('get_flight_details'));
    expect(ro).toContain('12:45');
    expect(ro).toContain('fictive');
    const en = composeAnswer('What time does my flight leave?', await run('get_flight_details'));
    expect(en).toContain('12:45');
    expect(en).toMatch(/scheduled to depart/);
  });
  it('answers arrival and duration', async () => {
    expect(composeAnswer('La ce ora aterizam?', await run('get_flight_details'))).toContain('14:10');
    expect(composeAnswer('Cat dureaza zborul?', await run('get_flight_details'))).toContain('2 ore și 25 de minute');
  });
  it.each(['Cat duureeaza zborul?', 'Cât durază zborul?', 'na cat drueaza zborul', 'Cât sttau în avion?', 'Cât stau în avoon?', 'How lng is the flight?', 'how log is the flight', 'How mnay hours will I be in the air?'])(
    'recognizes a common duration typo: %s', async (q) => {
      expect(composeAnswer(q, await run('get_flight_details'))).toMatch(/25|twenty/);
    },
  );
  it.each(['Cât stau în avion și la ce oră aterizez?', 'How long is the flight and which gate?', 'Cât durează verificarea la securitate?'])(
    'does not turn a mixed or unrelated question into a duration answer: %s', async (q) => {
      expect(composeAnswer(q, await run('get_flight_details'))).toBeNull();
    },
  );
  it('never invents a delay: no estimate means "I cannot say"', async () => {
    const a = composeAnswer('Am intarziere?', await run('get_flight_details'));
    expect(a).toMatch(/Nu am o estimare/);
  });
  it('leaves two intents in one question to the model', async () => {
    expect(composeAnswer('La ce ora decolam si am intarziere?', await run('get_flight_details'))).toBeNull();
  });
  it('gate: unconfirmed says so, never a guessed gate', async () => {
    const a = composeAnswer('Ce poarta am?', await run('get_gate'));
    expect(a).toMatch(/nu este confirmată/);
    expect(a).not.toMatch(/poarta.*\b[A-Z]\d{1,2}\b/);
  });
  it('time remaining uses the data, with the timetable caveat', async () => {
    const a = composeAnswer('Cat mai e pana decolam?', await run('get_time_remaining'));
    expect(a).toContain('3 ore și 45 de minute');
    expect(a).toMatch(/orar/);
    expect(a).toContain('date fictive');
  });
  it('answers the requested countdown target before and after scheduled departure', async () => {
    const before = await run('get_time_remaining');
    const landing = composeAnswer('Cât mai e până aterizăm?', before);
    expect(landing).toContain('6 ore și 10 minute');
    expect(landing).toContain('inclusiv timpul până la decolare');
    expect(landing).not.toContain('3 ore și 45 de minute');
    const later = { ...deps, now: () => new Date('2026-10-31T12:00:00Z') };
    const result = await executeToolCall(tools, 'get_time_remaining', {}, later);
    const after = [{ name: 'get_time_remaining', ok: result.ok, data: result.ok ? result.data : null }];
    const departure = composeAnswer('Cât mai e până decolăm?', after);
    expect(departure).toContain('Ora decolării programate');
    expect(departure).not.toContain('aterizarea programată');
  });
  it('uses natural Romanian forms for durations below and above twenty minutes', () => {
    const call = (text: string) => [{ name: 'get_time_remaining', ok: true, data: { flightNumber: 'RO311', result: { status: 'available', duration: { text } } } }];
    expect(composeAnswer('Cât mai e până aterizăm?', call('2h 10min'))).toContain('2 ore și 10 minute');
    expect(composeAnswer('Cât mai e până aterizăm?', call('2h 25min'))).toContain('2 ore și 25 de minute');
  });
  it('declines for a failed tool, several tools, or unrelated tools', async () => {
    expect(composeAnswer('x', [{ name: 'get_gate', ok: false, data: null }])).toBeNull();
    const two = [...(await run('get_gate')), ...(await run('get_time_remaining'))];
    expect(composeAnswer('poarta', two)).toBeNull();
    expect(composeAnswer('ce pot lua', [{ name: 'search_knowledge', ok: true, data: { documents: [] } }])).toBeNull();
    expect(composeAnswer('Unde e toaleta?', await run('get_gate'))).toBeNull();
    expect(composeAnswer('La ce oră decolăm?', await run('get_time_remaining'))).toBeNull();
    expect(composeAnswer('Cât mai e până aterizăm și care e poarta?', await run('get_time_remaining'))).toBeNull();
  });
  it('combines a confirmed gate and scheduled departure for the same flight', () => {
    const details = { name: 'get_flight_details', ok: true, data: { facts: 'flight: RO123 CRA->BGY\nscheduled departure: 2026-10-31T14:30:00+02:00\nprovider status: scheduled (third-party)', dataSource: 'airlabs' } };
    const gate = { name: 'get_gate', ok: true, data: { flightNumber: 'RO123', gate: 'B12', status: 'confirmed', providerStatus: 'scheduled', dataSource: 'airlabs' } };
    expect(composeAnswer('Care e poarta și la ce oră decolăm?', [details, gate], NOW)).toBe('Zborul RO123 are decolarea programată la 14:30 (ora locală), de la poarta B12. Poarta se poate schimba; verifică panourile aeroportului.');
    expect(composeAnswer('Which gate and when do we depart?', [gate, details], NOW)).toBe('Flight RO123 is scheduled to depart at 14:30 (local time) from gate B12. The gate can change; check the airport screens.');
  });
  it('declines multi-intent composition on mismatched flights, missing data or extra intents', () => {
    const details = { name: 'get_flight_details', ok: true, data: { facts: 'flight: RO123 CRA->BGY\nscheduled departure: 2026-10-31T14:30:00+02:00\nprovider status: scheduled (third-party)' } };
    const wrong = { name: 'get_gate', ok: true, data: { flightNumber: 'RO999', gate: 'B12', status: 'confirmed', providerStatus: 'scheduled' } };
    const unknown = { name: 'get_gate', ok: true, data: { flightNumber: 'RO123', gate: null, status: 'unconfirmed', providerStatus: 'scheduled' } };
    expect(composeAnswer('Care e poarta și la ce oră decolăm?', [details, wrong], NOW)).toBeNull();
    expect(composeAnswer('Care e poarta și la ce oră decolăm?', [details, unknown], NOW)).toBeNull();
    expect(composeAnswer('Care e poarta, când decolăm și avem întârziere?', [details, { ...wrong, data: { ...wrong.data, flightNumber: 'RO123' } }], NOW)).toBeNull();
  });
  it('copies short, topic-matched passenger guidance from the tool result', () => {
    const documents = [{ id: 'security-liquids-ro', title: 'Lichide', text: 'Recipientele de peste 100 ml nu trec de securitate. Verifică lista obiectelor interzise înainte să faci bagajul. Urmează indicațiile personalului.', mayBeOutdated: true }];
    const answer = composeAnswer('Pot lua lichide prin securitate?', [{ name: 'search_knowledge', ok: true, data: { documents } }]);
    expect(answer).toContain('100 ml');
    expect(answer).toContain('poate fi depășită');
    expect(answer).not.toContain('Urmează indicațiile');
  });
  it('does not compose an unrelated knowledge hit or unsupported powerbank guidance', () => {
    const documents = [{ id: 'missed-flight-ro', title: 'Zbor pierdut', text: 'Mergi la compania aeriană.' }];
    expect(composeAnswer('Pot lua un powerbank?', [{ name: 'search_knowledge', ok: true, data: { documents } }])).toBeNull();
    expect(composeAnswer('Pot lua lichide?', [{ name: 'search_knowledge', ok: true, data: { documents } }])).toBeNull();
  });
  it('does not introduce numbers or codes outside the two tool results', () => {
    const calls = [
      { name: 'get_flight_details', ok: true, data: { facts: 'flight: RO123 CRA->BGY\nscheduled departure: 2026-10-31T14:30:00+02:00\nprovider status: scheduled (third-party)' } },
      { name: 'get_gate', ok: true, data: { flightNumber: 'RO123', gate: 'B12', status: 'confirmed', providerStatus: 'scheduled' } },
    ];
    const answer = composeAnswer('Care e poarta și la ce oră decolăm?', calls, NOW)!;
    const source = JSON.stringify(calls);
    for (const token of answer.match(/[A-Z]{1,3}\d+|\d+(?::\d+)?/g) ?? []) expect(source).toContain(token);
  });
  const facts = (extra: string) => `flight: RO1 CRA->BGY\nscheduled departure: 2026-10-31T12:45:00+02:00\nscheduled arrival: 2026-10-31T14:10:00+01:00\n${extra}`;
  const asDetails = (extra: string, data: object = {}) => [{ name: 'get_flight_details', ok: true, data: { facts: facts(extra), dataSource: 'airlabs', ...data } }];
  it('a flight that is en route is composed (the provider type uses "en-route")', () => {
    expect(composeAnswer('La ce ora aterizam?', asDetails('provider status: en-route (third-party)'))).toContain('14:10');
  });
  it('"Decolăm la timp?" is a delay question, not a departure-time one; a time question plus a delay word goes to the model', () => {
    const v = { delay_verdict: { verdict: 'delayed', minutes: 25, basis: 'arrival' } };
    const a = composeAnswer('Decolăm la timp?', asDetails('estimated departure: 2026-10-31T13:10:00+02:00 (x)\nestimated arrival: 2026-10-31T14:35:00+01:00 (x)', v));
    expect(a).toMatch(/25 min întârziere/);
    expect(a).toContain('13:10'); // both legs shown, times copied from the data
    expect(composeAnswer('La ce ora decolam, e intarziat?', asDetails('', v))).toBeNull();
  });
  it('names the date when the flight is not today', () => {
    const tomorrow = new Date('2026-10-30T20:00:00+02:00');
    expect(composeAnswer('La ce ora decolam?', asDetails(''), tomorrow)).toContain('pe 31.10');
    expect(composeAnswer('La ce ora decolam?', asDetails(''), new Date('2026-10-31T08:00:00+02:00'))).not.toContain(' pe 31.10');
  });
  it('a gate question that reached get_flight_details is answered from its gate line', () => {
    expect(composeAnswer('Ce poarta am?', asDetails('gate: B4 (confirmed)'))).toContain('B4');
    expect(composeAnswer('Ce poarta am?', asDetails('gate: UNKNOWN (unconfirmed)'))).toMatch(/nu este confirmată/);
    expect(composeAnswer('Ce poarta am?', asDetails('gate: UNKNOWN (confirmed)'))).toMatch(/nu este confirmată/);
  });
  it('before scheduled departure, does not claim the flight has not left', async () => {
    const a = composeAnswer('Mai e mult?', await run('get_time_remaining'));
    expect(a).toMatch(/decolarea programată/);
    expect(a).not.toMatch(/nu a decolat încă/);
  });
  it('declines for a cancelled or diverted flight', () => {
    const facts = 'flight: RO1 CRA->BGY\nscheduled departure: 2026-10-31T12:45:00+02:00\nprovider status: cancelled (third-party)';
    expect(composeAnswer('La ce ora decolam?', [{ name: 'get_flight_details', ok: true, data: { facts, dataSource: 'airlabs' } }])).toBeNull();
    expect(composeAnswer('Ce poartă am?', [{ name: 'get_gate', ok: true, data: { flightNumber: 'RO1', gate: 'B4', status: 'confirmed', providerStatus: 'cancelled' } }])).toBeNull();
    expect(composeAnswer('Cât mai e?', [{ name: 'get_time_remaining', ok: true, data: { flightNumber: 'RO1', result: { status: 'available', duration: { text: '1h 20min' } }, providerStatus: 'diverted' } }])).toBeNull();
  });
  it('does not count down to a landing already reported by the provider', () => {
    const data = { flightNumber: 'RO311', providerStatus: 'landed', dataSource: 'airlabs', result: { status: 'available', duration: { text: '1h 20min' } } };
    const answer = composeAnswer('Cât mai e până aterizăm?', [{ name: 'get_time_remaining', ok: true, data }]);
    expect(answer).toContain('furnizorului terț');
    expect(answer).toContain('figurează ca aterizat');
    expect(answer).not.toContain('1 oră');
  });
  it('describes the last estimate without treating it as an actual delay after landing', () => {
    const facts = 'flight: RO311 CRA->BGY\nscheduled departure: 2026-10-31T12:45:00+02:00\nscheduled arrival: 2026-10-31T14:10:00+01:00\nprovider status: landed (third-party)';
    const data = { facts, dataSource: 'airlabs', delay_verdict: { verdict: 'delayed', minutes: 25, basis: 'arrival' } };
    const answer = composeAnswer('Avem întârziere?', [{ name: 'get_flight_details', ok: true, data }]);
    expect(answer).toContain('25 min mai târziu');
    expect(answer).toContain('nu am ora efectivă');
    expect(answer).not.toContain('ar urma');
  });
  it('composed sentences pass the answer guard on numbers and gates (status words are exempt by design)', async () => {
    for (const [q, tool] of [['La ce oră decolăm?', 'get_flight_details'], ['Ce poarta am?', 'get_gate'], ['Cat mai e pana decolam?', 'get_time_remaining']] as const) {
      const calls = await run(tool);
      const text = composeAnswer(q, calls)!;
      const messages = [{ role: 'user', content: q }, { role: 'tool', content: JSON.stringify({ result: calls[0].data }) }] as never;
      expect(guardToolAnswer(messages, text, q, ['DEMO123']).violations).toEqual([]);
    }
  });
});
