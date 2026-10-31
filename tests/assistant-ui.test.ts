import { describe, expect, it } from 'vitest';
import { buildCards, buildSteps, countdownText, expandSlash, followUps, freshness, guessTools, heroCountdown, slashMatches, sourceChip, splitAnswer, statusPill, stepLabel } from '../src/lib/assistantUi';

describe('assistant steps', () => {
  it('starts with understanding, lists the real tools, ends with writing', () => {
    const s = buildSteps([{ name: 'get_gate', done: true }], false, 'ro');
    expect(s.map(x => x.state)).toEqual(['done', 'done', 'pending']);
    expect(s[1].label).toBe('Verific poarta');
  });
  it('marks the tool that is running and the writing step', () => {
    expect(buildSteps([{ name: 'get_gate', done: false }], false, 'en').map(x => x.state)).toEqual(['done', 'run', 'pending']);
    expect(buildSteps([{ name: 'get_gate', done: true }], true, 'en').map(x => x.state)).toEqual(['done', 'done', 'run']);
    expect(buildSteps([], false, 'ro')[0].state).toBe('run');
  });
  it('has a label for every registered tool and a safe fallback', () => {
    for (const t of ['get_flight_details', 'get_gate', 'get_time_remaining', 'get_live_tracking', 'search_knowledge', 'open_airport_map']) expect(stepLabel(t, 'en')).not.toMatch(/Using a tool/);
    expect(stepLabel('nope', 'en')).toBe('Using a tool');
  });
  it('guesses a tool from the question only for the demo path', () => {
    expect(guessTools('La ce poartă sunt?')).toEqual(['get_gate']);
    expect(guessTools('Pot lua lichide?')).toEqual(['search_knowledge']);
    expect(guessTools('Unde este toaleta?')).toEqual(['open_airport_map']);
  });
});

describe('answer helpers', () => {
  it('keeps short answers whole and folds long ones after the first sentence', () => {
    expect(splitAnswer('Poarta ta este B4.').rest).toBe('');
    const long = 'Poarta ta este B4, confirmată de furnizor. ' + 'Îmbarcarea începe la 14:25 și se închide la 14:45. '.repeat(4);
    const s = splitAnswer(long);
    expect(s.lead).toBe('Poarta ta este B4, confirmată de furnizor. Îmbarcarea începe la 14:25 și se închide la 14:45.');
    expect(`${s.lead} ${s.rest}`.replace(/\s+/g, ' ')).toBe(long.trim().replace(/\s+/g, ' '));
  });
  it('expands slash commands and lists matches', () => {
    expect(expandSlash('/poarta', 'ro')).toBe('La ce poartă sunt?');
    expect(expandSlash('/nimic', 'ro')).toBeNull();
    expect(slashMatches('/p', 'en').map(x => x.cmd)).toEqual(['/poarta']);
    expect(slashMatches('salut', 'ro')).toEqual([]);
  });
  it('suggests follow-ups by the last tool', () => {
    expect(followUps(['get_gate'], 'ro', ['x'])[0]).toBe('Când începe îmbarcarea?');
    expect(followUps([], 'ro', ['x'])).toEqual(['x']);
  });
  it('reports the age of the data and refuses to guess', () => {
    const now = new Date('2026-10-29T12:30:00Z');
    expect(freshness('2026-10-29T12:28:00Z', now, 'ro')).toEqual({ text: 'actualizat acum 2 min', level: 'fresh' });
    expect(freshness('2026-10-29T10:30:00Z', now, 'en')).toEqual({ text: 'updated 2 h ago', level: 'old' });
    expect(freshness(null, now, 'ro').level).toBe('unknown');
  });
  it('names the source of rule answers', () => {
    expect(sourceChip(['search_knowledge'], 'ro')).toBe('Ghid pasageri · offline');
    expect(sourceChip(['get_gate'], 'ro')).toBeNull();
  });
});

describe('flight card', () => {
  const t = { boarding: 1000 * 60 * 100, departure: 1000 * 60 * 140, arrival: 1000 * 60 * 250 };
  it('counts down to boarding, then departure, then arrival', () => {
    expect(heroCountdown(0, t)).toEqual({ minutes: 100, kind: 'boarding' });
    expect(heroCountdown(1000 * 60 * 120, t)).toEqual({ minutes: 20, kind: 'departure' });
    expect(heroCountdown(1000 * 60 * 200, t)).toEqual({ minutes: 50, kind: 'arrival' });
    expect(heroCountdown(1000 * 60 * 300, t).kind).toBe('done');
  });
  it('writes minutes under two hours and h:mm above', () => {
    expect(countdownText(84)).toEqual({ value: '84', unit: 'min' });
    expect(countdownText(125)).toEqual({ value: '2:05', unit: 'h' });
  });
  it('never says "on time" without live data', () => {
    expect(statusPill(undefined, false, 'ro')).toEqual({ text: 'Programat', tone: 'neutral' });
    expect(statusPill(0, true, 'ro')).toEqual({ text: 'La timp', tone: 'good' });
    expect(statusPill(25, true, 'en')).toEqual({ text: 'Delayed 25 min', tone: 'warn' });
  });
});

describe('fact cards', () => {
  const facts = { gate: 'B4', boarding: '14:25', departure: '14:40', arrival: '16:05', remaining: '1 h 52 min' };
  it('builds cards from the data, per tool', () => {
    expect(buildCards(['get_gate'], facts, 'ro').map(c => c.kind)).toEqual(['gate', 'boarding']);
    expect(buildCards(['get_flight_details'], facts, 'en').map(c => c.value)).toEqual(['14:40', '16:05']);
    expect(buildCards(['get_time_remaining'], facts, 'ro')[0].value).toBe('1 h 52 min');
  });
  it('says the gate is unconfirmed instead of showing a dash as a gate', () => {
    const c = buildCards(['get_gate'], { gate: '—' }, 'ro')[0];
    expect(c.value).toBe('—');
    expect(c.note).toBe('neconfirmată');
  });
  it('shows nothing for tools without facts and never more than three cards', () => {
    expect(buildCards(['search_knowledge'], facts, 'ro')).toEqual([]);
    expect(buildCards(['get_gate', 'get_flight_details', 'get_time_remaining'], facts, 'ro').length).toBe(3);
  });
});
