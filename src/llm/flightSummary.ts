/**
 * A short, honest summary of the flight from get_flight_details' result, for flight questions the composer has no single sentence for
 * ("how is my flight?"). Times are copied from the tool's facts (local wall clock of each airport); nothing is computed.
 */
const wall = (iso: string | null | undefined) => (iso ? /[T ](\d{2}:\d{2})/.exec(iso)?.[1] ?? null : null);
const line = (facts: string, key: string) => new RegExp(`^${key}: (\\S+)`, 'm').exec(facts)?.[1] ?? null;

export function flightSummary(result: Record<string, unknown>, ro: boolean): string | null {
  const facts = typeof result.facts === 'string' ? result.facts : null;
  if (!facts) return null;
  const flight = /^flight: (\S+)/m.exec(facts)?.[1] ?? '';
  const dep = wall(line(facts, 'scheduled departure'));
  const arr = wall(line(facts, 'scheduled arrival'));
  if (!dep && !arr) return null;
  const gate = /^gate: (\S+) \((\w+)\)/m.exec(facts);
  const gateText = gate && gate[2] === 'confirmed' ? gate[1] : null;
  const demo = result.dataSource === 'demo';
  if (ro) {
    return `Zborul ${flight}: decolare ${dep ?? '?'}, aterizare ${arr ?? '?'} (ore locale, după orar). ${gateText ? `Poarta ${gateText} (confirmată).` : 'Poarta nu este confirmată încă.'}${demo ? ' (zbor demo, date fictive)' : ''}`;
  }
  return `Flight ${flight}: departure ${dep ?? '?'}, arrival ${arr ?? '?'} (local time, per the schedule). ${gateText ? `Gate ${gateText} (confirmed).` : 'The gate is not confirmed yet.'}${demo ? ' (demo flight, fictional data)' : ''}`;
}
