import flightsJson from '../../data/flights.json';
import { formatDuration, formatLocalTime, formatNumber } from '../../lib/time';
import type { Airport, FlightContext } from '../../types';
import type { AssistantService } from '../types';

const airports = (flightsJson as { airports: Airport[] }).airports;

// Răspunsuri predefinite, completate cu datele zborului. Interfața e aceeași pe care
// o va implementa modelul local real (ask → stream de text).
type Intent = (ctx: FlightContext) => string;

const INTENTS: { match: RegExp; answer: Record<'ro' | 'en', Intent> }[] = [
  {
    match: /\b(loc|locul|scaun|seat)\b/i,
    answer: {
      ro: c => `Ai locul ${c.ticket.pass.seat}${aisle(c.ticket.pass.seat, 'ro')}. Ești în grupa ${c.ticket.boardingGroup} la îmbarcare, care începe la ${dep(c, c.flight.boardingUtc)} la poarta ${c.flight.gate}.`,
      en: c => `You're in seat ${c.ticket.pass.seat}${aisle(c.ticket.pass.seat, 'en')}. You board with group ${c.ticket.boardingGroup}; boarding starts at ${dep(c, c.flight.boardingUtc)} at gate ${c.flight.gate}.`,
    },
  },
  {
    match: /(ateriz|ajungem|când ajung|cand ajung|land|arriv)/i,
    answer: {
      ro: c =>
        c.position
          ? `Estimez aterizarea pe la ${eta(c)} ora locală (${etaHome(c)} ora României). Mai sunt ${formatNumber(c.position.distanceRemainingKm)} km${c.position.source === 'estimate' ? ', dar e o estimare din orar până prindem GPS' : ''}.`
          : `După orar, aterizăm la ${arr(c)} ora locală (${formatLocalTime(c.flight.arrivalUtc, origin(c).utcOffsetMin)} ora României). Zborul durează ${formatDuration(totalMin(c), 'ro')}.`,
      en: c =>
        c.position
          ? `I estimate landing around ${eta(c)} local time (${etaHome(c)} Romanian time). ${formatNumber(c.position.distanceRemainingKm)} km to go${c.position.source === 'estimate' ? ' — an estimate from the schedule until we get GPS' : ''}.`
          : `By the schedule we land at ${arr(c)} local time. The flight takes ${formatDuration(totalMin(c), 'en')}.`,
    },
  },
  {
    match: /(îmbarc|imbarc|poart|board|gate)/i,
    answer: {
      ro: c => `Îmbarcarea începe la ${dep(c, c.flight.boardingUtc)} la poarta ${c.flight.gate}, la etajul 1. Poarta se închide la ${dep(c, c.flight.gateCloseUtc)}, așa că fii acolo cu 10 minute înainte.`,
      en: c => `Boarding starts at ${dep(c, c.flight.boardingUtc)} at gate ${c.flight.gate}, on floor 1. The gate closes at ${dep(c, c.flight.gateCloseUtc)}, so be there 10 minutes before.`,
    },
  },
  {
    match: /turbul/i,
    answer: {
      ro: () => 'E aer care se mișcă neregulat, cam ca valurile sub o barcă. Avionul e construit să o suporte fără probleme. Ține centura legată cât stai jos și urmează indicațiile echipajului.',
      en: () => "It's air moving unevenly, a bit like waves under a boat. The aircraft is built to handle it. Keep your seatbelt fastened while seated and follow the crew's instructions.",
    },
  },
  {
    match: /(powerbank|power bank|baterie extern)/i,
    answer: {
      ro: () => 'Da, și chiar trebuie: powerbank-urile merg doar în bagajul de mână, nu în cală. De regulă, până la 100 Wh nu ai nevoie de aprobare. Verifică totuși regulile companiei înainte de zbor.',
      en: () => 'Yes — in fact power banks must go in your cabin bag, never in the hold. Usually up to 100 Wh needs no approval, but check the airline rules before you fly.',
    },
  },
  {
    match: /(telefon|mod avion|phone|airplane mode|flight mode)/i,
    answer: {
      ro: () => 'Poți folosi telefonul în mod avion pe tot zborul. Eu funcționez complet offline, iar GPS-ul telefonului merge și în mod avion, de obicei mai bine lângă geam.',
      en: () => 'You can use your phone in airplane mode for the whole flight. I work fully offline, and GPS keeps working in airplane mode — usually better by the window.',
    },
  },
  {
    match: /(securit|lichid|security|liquid)/i,
    answer: {
      ro: () => 'La securitate durează de obicei 10–15 minute. Lichidele de max 100 ml merg într-o pungă transparentă de 1 L, iar laptopul și tableta se scot separat în tavă.',
      en: () => 'Security usually takes 10–15 minutes. Liquids up to 100 ml go in a 1 L clear bag, and laptops and tablets go in a separate tray.',
    },
  },
  {
    match: /(pașaport|pasaport|buletin|document|passport|\bID\b)/i,
    answer: {
      ro: c =>
        destination(c).schengen
          ? 'Zborul e în spațiul Schengen: îți ajunge cartea de identitate valabilă.'
          : `${destination(c).city} e în afara Schengen, deci treci prin controlul pașapoartelor, la etajul 1, după duty-free. Regulile de intrare în Regatul Unit se pot schimba, așa că verifică pe site-ul oficial dacă îți trebuie pașaport.`,
      en: c =>
        destination(c).schengen
          ? 'This flight is inside Schengen: a valid ID card is enough.'
          : `${destination(c).city} is outside Schengen, so you'll go through passport control on floor 1, after duty-free. UK entry rules can change — check the official site to see whether you need a passport.`,
    },
  },
];

const FALLBACK: Record<'ro' | 'en', Intent> = {
  ro: c => `Pot să-ți răspund despre zborul ${c.flight.carrier} ${c.flight.flightNumber}: locul tău, îmbarcarea, ora aterizării, securitatea sau documentele. Încearcă una dintre sugestiile de mai jos.`,
  en: c => `I can help with flight ${c.flight.carrier} ${c.flight.flightNumber}: your seat, boarding, landing time, security or documents. Try one of the suggestions below.`,
};

const origin = (c: FlightContext) => airports.find(a => a.code === c.flight.from)!;
const destination = (c: FlightContext) => airports.find(a => a.code === c.flight.to)!;
const dep = (c: FlightContext, utc: string) => formatLocalTime(utc, origin(c).utcOffsetMin);
const arr = (c: FlightContext) => formatLocalTime(c.flight.arrivalUtc, destination(c).utcOffsetMin);
const totalMin = (c: FlightContext) => (Date.parse(c.flight.arrivalUtc) - Date.parse(c.flight.departureUtc)) / 60_000;
// Trackerul mock urmează orarul, deci ora estimată coincide cu ora programată
const etaDate = (c: FlightContext) => new Date(c.flight.arrivalUtc);
const eta = (c: FlightContext) => formatLocalTime(etaDate(c), destination(c).utcOffsetMin);
const etaHome = (c: FlightContext) => formatLocalTime(etaDate(c), origin(c).utcOffsetMin);

function aisle(seat: string, language: 'ro' | 'en'): string {
  const letter = seat.slice(-1);
  if (letter === 'A' || letter === 'F') return language === 'ro' ? ', la geam' : ', by the window';
  if (letter === 'C' || letter === 'D') return language === 'ro' ? ', la culoar' : ', on the aisle';
  return language === 'ro' ? ', la mijloc' : ', in the middle';
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(() => resolve(), ms));

export class MockAssistantService implements AssistantService {
  async *ask(question: string, context: FlightContext): AsyncIterable<string> {
    const intent = INTENTS.find(i => i.match.test(question));
    const text = (intent ? intent.answer[context.language] : FALLBACK[context.language])(context);
    // „Gândește” puțin, apoi trimite cuvânt cu cuvânt, ca un model local
    await sleep(450);
    for (const token of text.match(/\S+\s*/g) ?? []) {
      await sleep(28 + Math.random() * 40);
      yield token;
    }
  }
}
