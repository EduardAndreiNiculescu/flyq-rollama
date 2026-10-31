/**
 * Deterministic answers for flight questions that code can answer exactly. No model involved:
 * the wording is fixed, the numbers come from flight.ts. Used (a) instead of the LLM for these
 * questions and (b) as the safe fallback when the answer guard rejects a model answer.
 */
import { scheduledDuration, timeRemaining } from './flight';
import type { FlightRecord } from './types';

export type FlightQuestionType = 'gate' | 'remaining' | 'duration' | 'arrival' | 'departure' | 'status';
type Lang = 'ro' | 'en';

const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const GATE = /\b(la ce|care e|ce|spune|spune mi|spune imi|numarul) ?(poarta|portii)\b|\b(poarta|gate)\b.*\b(zbor|zborul|flight|plane|avion|boarding|imbarc)|\b(which|what) gate\b|\bgate (number|for)\b|\bmy gate\b|\bpoarta mea\b|\bunde imbarc\b|\bwhere do i board\b|^((si|and|dar|what about) )?(the |my )?(poarta|gate)$/;
const REMAINING = /\bcat (mai|timp mai)\b|\bin cat timp\b|\bhow (long|much)\b.*\b(until|left|remain|more)\b|\btime (left|remaining)\b|\bpana (la )?(aterizar|sosir|aterizam|ajungem|ajunge)|\buntil (we |it |the )?(land|arriv)/;
const DURATION = /\b(cat )?(dureaza|durata)\b|\bhow long (is|will|does)\b|\bflight (duration|time)\b|\bcat stau\b/;
const ARRIVAL = /\b(ateriz\w*|soseste|sosirea|ora sosirii|ajunge|ajung|land\w*|arrive\w*|arrival)\b/;
const DEPARTURE = /\b(decol\w*|pleaca|plecarea|ora plecarii|departures?|departs|departing|depart|take ?off|leave\w*|leaves)\b/;
const STATUS = /\b(intarzi\w*|intarziat|anulat\w*|anulare|delay\w*|cancel\w*|status|on time|la timp|unde e avionul|unde este avionul|where is (my|the) (plane|flight|aircraft)|a decolat|has the plane)\b/;

/** Which exact question is the passenger asking about their flight? Null when it is not a clear single one. */
export function flightQuestionType(question: string): FlightQuestionType | null {
  const t = plain(question);
  const found: FlightQuestionType[] = [];
  if (GATE.test(t)) found.push('gate');
  if (STATUS.test(t)) found.push('status');
  if (REMAINING.test(t)) found.push('remaining');
  else {
    if (DURATION.test(t)) found.push('duration');
    if (ARRIVAL.test(t)) found.push('arrival');
    if (DEPARTURE.test(t)) found.push('departure');
  }
  // Mixed questions ("când decolează și când ajunge?") go to the model, which sees both facts.
  return found.length === 1 ? found[0] : null;
}

const hhmm = (iso: string) => iso.slice(11, 16) + (iso.endsWith('Z') ? ' UTC' : '');
const hm = (m: number) => `${Math.floor(m / 60)}h ${m % 60}min`;

export type TemplateContext = { flight: FlightRecord; now: Date; question?: string; cities?: { dep?: string; arr?: string } };

/** The fixed answer, or null if the data needed is missing. */
export function flightAnswer(type: FlightQuestionType, lang: Lang, c: TemplateContext): string | null {
  const f = c.flight;
  const demo = f.dataSource === 'demo' ? (lang === 'ro' ? ' Sunt date demo (fictive).' : ' This is demo (fictional) data.') : '';
  const src = f.dataSource === 'airlabs' ? (lang === 'ro' ? ' Sursa: AirLabs (nu este o confirmare oficială).' : ' Source: AirLabs (not an official confirmation).') : '';
  const tail = demo + src;
  // Times are printed in each airport's own zone; naming the city keeps that unambiguous.
  const label = (city?: string) => (city ? (lang === 'ro' ? ` (ora ${city})` : ` (${city} time)`) : '');
  const dep = label(c.cities?.dep);
  const arr = label(c.cities?.arr);
  // Provider (third-party) estimates are mentioned next to the schedule, only when they differ from it.
  const estNote = (kind: 'arrival' | 'departure') => {
    const est = kind === 'arrival' ? f.estimatedArrival : f.estimatedDeparture;
    const sched = kind === 'arrival' ? f.scheduledArrival : f.scheduledDeparture;
    if (!est || hhmm(est) === hhmm(sched)) return '';
    return lang === 'ro' ? ` Estimarea furnizorului: ${hhmm(est)} (se poate schimba).` : ` The provider's estimate: ${hhmm(est)} (may change).`;
  };
  switch (type) {
    case 'arrival':
      return lang === 'ro'
        ? `Sosirea programată pentru ${f.flightNumber} este la ${hhmm(f.scheduledArrival)}${arr}, conform orarului. Nu am informații în timp real despre întârzieri.${estNote('arrival')}${tail}`
        : `${f.flightNumber} is scheduled to arrive at ${hhmm(f.scheduledArrival)}${arr}, per the timetable. I have no real-time delay information.${estNote('arrival')}${tail}`;
    case 'departure':
      return lang === 'ro'
        ? `Decolarea programată pentru ${f.flightNumber} este la ${hhmm(f.scheduledDeparture)}${dep}. Nu am informații în timp real despre întârzieri.${estNote('departure')}${tail}`
        : `${f.flightNumber} is scheduled to depart at ${hhmm(f.scheduledDeparture)}${dep}. I have no real-time delay information.${estNote('departure')}${tail}`;
    case 'duration': {
      const d = scheduledDuration(f);
      if (!d) return null;
      return lang === 'ro' ? `Durata programată a zborului ${f.flightNumber} este de ${hm(d.minutes)}, conform orarului.${tail}` : `The scheduled duration of ${f.flightNumber} is ${hm(d.minutes)}, per the timetable.${tail}`;
    }
    case 'gate':
      return f.gate && f.gateStatus === 'confirmed'
        ? lang === 'ro'
          ? `Poarta confirmată în datele disponibile este ${f.gate}. Poarta se poate schimba, deci verifică ecranele din aeroport.${src}`
          : `The gate confirmed in the available data is ${f.gate}. Gates can change, so check the airport screens.${src}`
        : lang === 'ro'
          ? `Nu am o poartă confirmată pentru ${f.flightNumber}. Verifică panourile din aeroport sau întreabă personalul.${tail}`
          : `I don't have a confirmed gate for ${f.flightNumber}. Please check the airport screens or ask airport staff.${tail}`;
    case 'status':
      return lang === 'ro'
        ? `Nu am statusul real al zborului ${f.flightNumber} offline, doar orarul programat (plecare ${hhmm(f.scheduledDeparture)}, sosire ${hhmm(f.scheduledArrival)}). Verifică panourile din aeroport sau compania aeriană.${tail}`
        : `I don't have the live status of ${f.flightNumber} offline, only the scheduled times (departure ${hhmm(f.scheduledDeparture)}, arrival ${hhmm(f.scheduledArrival)}). Check the airport screens or your airline.${tail}`;
    case 'remaining': {
      const r = timeRemaining(f, c.now);
      const q = plain(c.question ?? '');
      const target = ARRIVAL.test(q) && !DEPARTURE.test(q) ? 'arrival' : DEPARTURE.test(q) && !ARRIVAL.test(q) ? 'departure' : null;
      if (target === 'departure' && (r.status === 'available' || r.status === 'arrived_per_schedule'))
        return lang === 'ro' ? `Ora decolării programate a trecut. Nu am confirmarea decolării în timp real.${tail}` : `The scheduled departure time has passed. I have no live confirmation of takeoff.${tail}`;
      if (r.status === 'available')
        return lang === 'ro'
          ? `Conform orarului, mai sunt aproximativ ${r.duration.text} până la sosirea programată. Este un calcul după orar, nu urmărire în timp real.${r.estimated ? ` Estimarea furnizorului: aproximativ ${r.estimated.text}.` : ''}${tail}`
          : `Per the schedule, about ${r.duration.text} remain until the scheduled arrival. This is calculated from the timetable, not live tracking.${r.estimated ? ` The provider's estimate: about ${r.estimated.text}.` : ''}${tail}`;
      if (r.status === 'not_departed' && target === 'arrival')
        return lang === 'ro'
          ? `Conform orarului, mai sunt aproximativ ${r.untilArrival.text} până la aterizarea programată, inclusiv timpul până la decolare.${tail}`
          : `Per the timetable, about ${r.untilArrival.text} remain until the scheduled landing, including the time until departure.${tail}`;
      if (r.status === 'not_departed')
        return lang === 'ro'
          ? `Ora decolării programate nu a sosit încă. Mai sunt aproximativ ${r.untilDeparture.text} până atunci, conform orarului.${tail}`
          : `The scheduled departure time has not arrived yet. About ${r.untilDeparture.text} remain until then, according to the timetable.${tail}`;
      if (r.status === 'arrived_per_schedule')
        return lang === 'ro' ? `Ora sosirii programate a trecut deja. Nu am informații în timp real despre aterizare.${tail}` : `The scheduled arrival time has already passed. I have no real-time information about landing.${tail}`;
      return null;
    }
  }
}
