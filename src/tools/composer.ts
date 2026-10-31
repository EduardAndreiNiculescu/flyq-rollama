import { detectLang } from '../core/prompt';
import { correctQuestion } from '../core/spell';

/**
 * Response Composer: for the plain flight questions the answer is a sentence built from the tool result, so the second
 * model call (the long one: ~100 tokens at phone speed) is skipped. The model still chose the tool from the passenger's words.
 * Returns null whenever the case is not clear-cut (no single intent, odd provider status, missing data): the model then answers as before.
 * Every number and time in a sentence is copied from the tool result; nothing is computed here except the calendar date comparison.
 */
export type ComposeCall = { name: string; ok: boolean; data: unknown };

type Lang = 'ro' | 'en';
const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const wall = (iso: unknown) => (typeof iso === 'string' ? /[T ](\d{2}:\d{2})/.exec(iso)?.[1] ?? null : null);
const day = (iso: unknown) => (typeof iso === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null);
const line = (facts: string, key: string) => new RegExp(`^${key}: (\\S+)`, 'm').exec(facts)?.[1] ?? null;
const duration = (s: string, lang: Lang) => {
  const m = /^(\d+)h (\d+)min$/.exec(s);
  if (!m) return s;
  if (lang === 'en') return `${m[1]} hr${m[1] === '1' ? '' : 's'}${m[2] === '0' ? '' : ` ${m[2]} min`}`;
  const minutes = Number(m[2]);
  return `${m[1]} ${m[1] === '1' ? 'oră' : 'ore'}${minutes === 0 ? '' : ` și ${m[2]} ${minutes === 1 ? 'minut' : minutes < 20 ? 'minute' : 'de minute'}`}`;
};

type Intent = 'departure' | 'arrival' | 'duration' | 'delay' | 'gate';
const ASKS_TIME = /\b(ce ora|la ce ora|cand|ora|what time|when)\b/;
const INTENTS: Array<[Intent, RegExp]> = [
  ['duration', /\bcat (?:dureaza|duureeaza|duraza|drueaza|tine) (?:zborul|zbor|avionul|avion)\b|\bcat (?:timp dureaza|timp tine|e zborul|st+au in (?:avion|avoon))\b|\bdurata (?:are )?(?:zborului|zborul|zbor)\b|\bhow (?:long|lng|log) (?:is|does) (?:the |my )?flight\b|\bhow (?:many|mnay) hours .*\b(?:flight|in the air)\b|\bflight time\b/],
  ['delay', /intarzi|delay|\blate\b|la timp|on time|devreme|\bearly\b|amanat|on schedule|running late/],
  ['departure', /decol|plec|pleac|depart|take ?off|leave|leaves|leaving/],
  ['arrival', /ateriz|sosi|ajung|arriv|\bland/],
  ['gate', /poart|\bgate\b|unde imbarc|where do i board/],
];
/**
 * Exactly one intent or nothing: "when do we leave and is it late" goes to the model. A delay word beats the departure/arrival word
 * ("Decolăm la timp?" asks about delay), unless the passenger also asks for a time ("La ce oră decolăm, e întârziat?").
 */
function intentOf(question: string): Intent | null {
  const hit = intentsOf(question);
  return hit.length === 1 ? hit[0] : null;
}
function intentsOf(question: string): Intent[] {
  const q = plain(correctQuestion(question).text); // the app's own typo repair, as for the knowledge search
  let hit = INTENTS.filter(([, re]) => re.test(q)).map(([i]) => i);
  if (hit.includes('delay') && !ASKS_TIME.test(q)) hit = hit.filter((i) => i === 'delay' || (i !== 'departure' && i !== 'arrival'));
  return hit;
}
function remainingOf(question: string): boolean {
  const q = plain(correctQuestion(question).text);
  const hits = INTENTS.filter(([, re]) => re.test(q)).map(([intent]) => intent);
  if (hits.some(i => i === 'gate' || i === 'delay' || i === 'duration') || (hits.includes('arrival') && hits.includes('departure'))) return false;
  return /\b(cat mai e pana|mai dureaza mult pana|in cat timp|cat timp mai avem de zbor|mai e mult|how long until|how much longer|are we almost there)\b/.test(q);
}

const demoNote = (demo: boolean, lang: Lang) => (demo ? (lang === 'ro' ? ' (zbor demo, date fictive)' : ' (demo flight, fictional data)') : '');
/** " pe 31.10" when the flight is not on the device's calendar day; nothing when it is (then "today" is understood). */
function onDay(iso: unknown, now: Date | undefined, lang: Lang): string {
  const m = day(iso);
  if (!m || !now) return '';
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (`${m[1]}-${m[2]}-${m[3]}` === today) return '';
  return lang === 'ro' ? ` pe ${m[3]}.${m[2]}` : ` on ${m[3]}.${m[2]}`;
}

function details(question: string, data: Record<string, unknown>, lang: Lang, now?: Date): string | null {
  const facts = typeof data.facts === 'string' ? data.facts : null;
  const intent = intentOf(question);
  if (!facts || !intent) return null;
  const status = line(facts, 'provider status');
  if (status && !['scheduled', 'en-route', 'active', 'landed'].includes(status)) return null; // cancelled, diverted, ...: the model words that carefully
  const flight = /^flight: (\S+)/m.exec(facts)?.[1] ?? '';
  const demo = data.dataSource === 'demo';
  const schedDep = line(facts, 'scheduled departure'), schedArr = line(facts, 'scheduled arrival');
  const dep = wall(schedDep), arr = wall(schedArr);
  const estDep = wall(line(facts, 'estimated departure')), estArr = wall(line(facts, 'estimated arrival'));
  const note = demoNote(demo, lang);
  if (intent === 'departure' && dep) {
    const d = onDay(schedDep, now, lang);
    return lang === 'ro'
      ? `Zborul ${flight} are decolarea programată la ${dep}${d} (ora locală).${estDep && estDep !== dep ? ` Estimarea furnizorului (terță parte): ${estDep}.` : ''}${note}`
      : `Flight ${flight} is scheduled to depart at ${dep}${d} (local time).${estDep && estDep !== dep ? ` Third-party provider estimate: ${estDep}.` : ''}${note}`;
  }
  if (intent === 'arrival' && arr) {
    const d = onDay(schedArr, now, lang);
    return lang === 'ro'
      ? `Zborul ${flight} are aterizarea programată la ${arr}${d} (ora locală la destinație).${estArr && estArr !== arr ? ` Estimarea furnizorului (terță parte): ${estArr}.` : ''}${note}`
      : `Flight ${flight} is scheduled to land at ${arr}${d} (local time at the destination).${estArr && estArr !== arr ? ` Third-party provider estimate: ${estArr}.` : ''}${note}`;
  }
  if (intent === 'duration' && typeof data.scheduledDuration === 'string') {
    return lang === 'ro' ? `Durata programată a zborului ${flight} este ${duration(data.scheduledDuration, lang)}.${note}` : `The scheduled duration of flight ${flight} is ${duration(data.scheduledDuration, lang)}.${note}`;
  }
  if (intent === 'gate') {
    const g = /^gate: (\S+) \((\w+)\)/m.exec(facts);
    if (!g) return null;
    const confirmed = g[2] === 'confirmed' && g[1] !== 'UNKNOWN';
    return gate({ flightNumber: flight, gate: confirmed ? g[1] : null, status: confirmed ? 'confirmed' : 'unconfirmed', dataSource: data.dataSource }, lang);
  }
  if (intent === 'delay') {
    const v = data.delay_verdict as { verdict?: string; minutes?: number; basis?: string } | undefined;
    if (!v?.verdict) return null;
    if (v.verdict === 'unknown') {
      return lang === 'ro'
        ? `Nu am o estimare de la furnizor, deci nu pot spune dacă zborul ${flight} are întârziere. Orarul programat: decolare ${dep ?? '?'}, aterizare ${arr ?? '?'}.${note}`
        : `I have no provider estimate, so I cannot say whether flight ${flight} is delayed. Scheduled: departure ${dep ?? '?'}, arrival ${arr ?? '?'}.${note}`;
    }
    if (!['delayed', 'early', 'on_time'].includes(v.verdict) || typeof v.minutes !== 'number' || !Number.isFinite(v.minutes) || (v.basis !== 'departure' && v.basis !== 'arrival')) return null;
    const minutes = v.minutes;
    const m = Math.abs(minutes);
    if (status === 'landed') {
      const roLeg = v.basis === 'departure' ? 'decolarea' : 'aterizarea';
      const enLeg = v.basis === 'departure' ? 'departure' : 'arrival';
      const roOffset = minutes === 0 ? `${roLeg} la ora programată` : `${roLeg} cu ${m} min ${minutes > 0 ? 'mai târziu' : 'mai devreme'} decât ora programată`;
      const enOffset = minutes === 0 ? `${enLeg} at the scheduled time` : `${enLeg} ${m} min ${minutes > 0 ? 'later' : 'earlier'} than scheduled`;
      return lang === 'ro'
        ? `Ultima estimare a furnizorului terț indica ${roOffset}. Furnizorul marchează zborul ${flight} ca aterizat, dar nu am ora efectivă pentru a confirma diferența reală față de orar. Verifică informațiile companiei aeriene.${note}`
        : `The third-party provider's last estimate indicated ${enOffset}. The provider lists flight ${flight} as landed, but I have no actual landing time to confirm the real difference from the timetable. Check the airline's information.${note}`;
    }
    const at = v.basis === 'departure' ? { ro: 'la decolare', en: 'at departure' } : { ro: 'la aterizare', en: 'at arrival' };
    const ro = { delayed: `ar urma să ${v.basis === 'departure' ? 'decoleze' : 'aterizeze'} cu ${m} min întârziere`, early: `ar urma să ${v.basis === 'departure' ? 'decoleze' : 'aterizeze'} cu ${m} min mai devreme`, on_time: `nu apare ca întârziat ${at.ro}` } as Record<string, string>;
    const en = { delayed: `is estimated to ${v.basis === 'departure' ? 'depart' : 'land'} ${m} min late`, early: `is estimated to ${v.basis === 'departure' ? 'depart' : 'land'} ${m} min early`, on_time: `is not shown as delayed ${at.en}` } as Record<string, string>;
    if (!(v.verdict in ro)) return null;
    // Both legs, scheduled next to estimated, copied from the data: the passenger sees what the verdict rests on.
    const legs = (r: Lang) => [
      dep && estDep ? (r === 'ro' ? `decolare: programată ${dep}, estimată ${estDep}` : `departure: scheduled ${dep}, estimated ${estDep}`) : '',
      arr && estArr ? (r === 'ro' ? `aterizare: programată ${arr}, estimată ${estArr}` : `arrival: scheduled ${arr}, estimated ${estArr}`) : '',
    ].filter(Boolean).join('; ');
    const l = legs(lang);
    const comparison = l ? l[0].toUpperCase() + l.slice(1) : '';
    return lang === 'ro'
      ? `Conform estimării furnizorului (terță parte), zborul ${flight} ${ro[v.verdict]}. ${comparison ? `${comparison}; verifică panourile aeroportului.` : 'Verifică panourile aeroportului.'}${note}`
      : `According to the provider's estimate (third party), flight ${flight} ${en[v.verdict]}. ${comparison ? `${comparison}; check the airport screens too.` : 'Check the airport screens too.'}${note}`;
  }
  return null;
}

function gate(data: Record<string, unknown>, lang: Lang): string | null {
  const flight = String(data.flightNumber ?? '');
  const note = demoNote(data.dataSource === 'demo', lang);
  if (data.status === 'confirmed' && typeof data.gate === 'string') {
    return lang === 'ro' ? `Poarta pentru ${flight} este ${data.gate} (confirmată). Se poate schimba; verifică panourile aeroportului.${note}` : `The gate for ${flight} is ${data.gate} (confirmed). It can change, so check the airport screens too.${note}`;
  }
  if (data.status === 'unconfirmed') {
    return lang === 'ro' ? `Poarta pentru ${flight} nu este confirmată încă. Verifică panourile aeroportului.${note}` : `The gate for ${flight} is not confirmed yet. Check the airport screens.${note}`;
  }
  return null;
}

function remaining(question: string, data: Record<string, unknown>, lang: Lang): string | null {
  const flight = String(data.flightNumber ?? '');
  const note = demoNote(data.dataSource === 'demo', lang);
  const r = data.result as { status?: string; untilDeparture?: { text: string }; untilArrival?: { text: string }; duration?: { text: string }; estimated?: { text: string } } | undefined;
  if (!r) return null;
  if (data.providerStatus === 'landed') {
    return lang === 'ro'
      ? `Potrivit furnizorului terț, zborul ${flight} figurează ca aterizat. Nu am confirmarea orei efective din urmărire live; verifică informațiile companiei aeriene.${note}`
      : `The third-party provider lists flight ${flight} as landed. I have no live confirmation of the actual landing time; check the airline's information.${note}`;
  }
  const target = intentOf(question);
  if (target === 'departure' && (r.status === 'available' || r.status === 'arrived_per_schedule')) {
    return lang === 'ro' ? `Ora decolării programate a zborului ${flight} a trecut. Nu am confirmarea decolării din urmărire live.${note}` : `The scheduled departure time of flight ${flight} has passed. I have no live confirmation of takeoff.${note}`;
  }
  if (target === 'arrival' && r.status === 'not_departed') {
    if (!r.untilArrival) return null;
    return lang === 'ro' ? `Până la aterizarea programată a zborului ${flight} mai sunt ${duration(r.untilArrival.text, lang)}, inclusiv timpul până la decolare, conform orarului.${note}` : `The scheduled landing of flight ${flight} is in ${duration(r.untilArrival.text, lang)}, including the time until departure, according to the timetable.${note}`;
  }
  if (r.status === 'not_departed' && r.untilDeparture) {
    return lang === 'ro' ? `Până la decolarea programată a zborului ${flight} mai sunt ${duration(r.untilDeparture.text, lang)}, conform orarului.${note}` : `The scheduled departure of flight ${flight} is in ${duration(r.untilDeparture.text, lang)}, according to the timetable.${note}`;
  }
  if (r.status === 'available' && r.duration) {
    return lang === 'ro'
      ? `Până la aterizarea programată a zborului ${flight} mai sunt ${duration(r.duration.text, lang)}, conform orarului.${r.estimated ? ` Estimarea furnizorului (terță parte): ${duration(r.estimated.text, lang)}.` : ''}${note}`
      : `The scheduled landing of flight ${flight} is in ${duration(r.duration.text, lang)}, according to the timetable.${r.estimated ? ` Third-party provider estimate: ${duration(r.estimated.text, lang)}.` : ''}${note}`;
  }
  if (r.status === 'arrived_per_schedule') {
    return lang === 'ro' ? `Ora aterizării programate a zborului ${flight} a trecut. Nu am confirmarea aterizării din urmărire live.${note}` : `The scheduled arrival time of flight ${flight} has passed. I have no live confirmation of landing.${note}`;
  }
  return null;
}

function multiFlight(question: string, calls: ComposeCall[], lang: Lang, now?: Date): string | null {
  const intents = intentsOf(question);
  if (intents.length !== 2 || !intents.includes('gate') || !intents.includes('departure')) return null;
  const detailCall = calls.find(c => c.name === 'get_flight_details' && c.ok);
  const gateCall = calls.find(c => c.name === 'get_gate' && c.ok);
  if (!detailCall?.data || typeof detailCall.data !== 'object' || !gateCall?.data || typeof gateCall.data !== 'object') return null;
  const detail = detailCall.data as Record<string, unknown>;
  const gateData = gateCall.data as Record<string, unknown>;
  const facts = typeof detail.facts === 'string' ? detail.facts : '';
  const status = line(facts, 'provider status');
  if (status && !['scheduled', 'en-route', 'active'].includes(status)) return null;
  if (gateData.providerStatus && !['scheduled', 'en-route', 'active'].includes(String(gateData.providerStatus))) return null;
  const flight = /^flight: (\S+)/m.exec(facts)?.[1] ?? '';
  const gateFlight = typeof gateData.flightNumber === 'string' ? gateData.flightNumber : '';
  const departureIso = line(facts, 'scheduled departure');
  const departure = wall(departureIso);
  const gateCode = gateData.status === 'confirmed' && typeof gateData.gate === 'string' ? gateData.gate : null;
  if (!flight || flight !== gateFlight || !departure || !gateCode) return null;
  const date = onDay(departureIso, now, lang);
  const note = demoNote(detail.dataSource === 'demo' || gateData.dataSource === 'demo', lang);
  return lang === 'ro'
    ? `Zborul ${flight} are decolarea programată la ${departure}${date} (ora locală), de la poarta ${gateCode}. Poarta se poate schimba; verifică panourile aeroportului.${note}`
    : `Flight ${flight} is scheduled to depart at ${departure}${date} (local time) from gate ${gateCode}. The gate can change; check the airport screens.${note}`;
}

type KnowledgeDocument = { id?: unknown; title?: unknown; text?: unknown; mayBeOutdated?: unknown };
const KNOWLEDGE_KIND: Array<[RegExp, RegExp]> = [
  [/\b(lichid\w*|liquids?|juice|apa|water)\b/, /security-liquids/i],
  [/\b(bagaj\w*|baggage|luggage|valiz\w*|suitcase|cabin bag|hand baggage)\b/, /baggage-allowance/i],
  [/\b(animale?|pets?|pisic\w*|caine|dog|cat|ferret|dihor)\b/, /(?:^|_)pets|pets-/i],
  [/\b(compens\w*|despagub\w*|entitled|rights|drepturi|anulat|cancelled|canceled)\b/, /rights-delay/i],
  [/\b(powerbank|power bank|baterie externa|external battery)\b/, /(?:powerbank|battery)/i],
];

function knowledge(question: string, data: Record<string, unknown>, lang: Lang): string | null {
  const q = plain(correctQuestion(question).text);
  const idPattern = KNOWLEDGE_KIND.find(([questionPattern]) => questionPattern.test(q))?.[1];
  if (!idPattern || !Array.isArray(data.documents)) return null;
  const doc = (data.documents as KnowledgeDocument[]).find(d => typeof d.id === 'string' && idPattern.test(d.id));
  if (!doc || typeof doc.text !== 'string') return null;
  const sentences = doc.text.trim().split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 2);
  if (!sentences.length) return null;
  const body = sentences.join(' ');
  const caveat = doc.mayBeOutdated === true
    ? (lang === 'ro' ? ' Informația poate fi depășită; verifică sursa și compania aeriană.' : ' This information may be outdated; check the source and your airline.')
    : '';
  return `${body}${caveat}`;
}

/** Grounded deterministic answer for a supported single call or the explicit gate+departure pair. */
export function composeAnswer(question: string, calls: ComposeCall[], now?: Date): string | null {
  const lang = langOf(question);
  if (calls.length === 2) return multiFlight(question, calls, lang, now)?.replace(/\.( \((?:zbor demo|demo flight)[^)]*\))$/, '$1.') ?? null;
  if (calls.length !== 1 || !calls[0].ok) return null;
  const { name, data } = calls[0];
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.providerStatus && !['scheduled', 'en-route', 'active', 'landed'].includes(String(d.providerStatus))) return null;
  const text = name === 'get_flight_details' ? details(question, d, lang, now)
    : name === 'get_gate' && intentOf(question) === 'gate' ? gate(d, lang)
      : name === 'get_time_remaining' && remainingOf(question) ? remaining(question, d, lang)
        : name === 'search_knowledge' ? knowledge(question, d, lang)
          : null;
  return text && text.replace(/\.( \((?:zbor demo|demo flight)[^)]*\))$/, '$1.');
}

/** detectLang calls diacritic-free Romanian ("Cat mai e pana decolam?") English; a Romanian word settles it. */
const RO_HINT = /\b(cat|pana|mai|zbor\w*|poarta|decol\w*|ateriz\w*|ora|ce|sunt|avion\w*|intarzi\w*|dureaza)\b/;
function langOf(question: string): Lang {
  return detectLang(question) === 'en' && !RO_HINT.test(plain(question)) ? 'en' : 'ro';
}
