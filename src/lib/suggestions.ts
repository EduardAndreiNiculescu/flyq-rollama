import type { Language } from '../i18n';

/**
 * Guided questions for the assistant tab. The chips change with the stage of the journey (long before boarding, boarding soon, climbing,
 * cruising, descending); a question that was asked leaves the list and another takes its place. Every question here is one the assistant
 * answers from its rules, its guide or the flight data (tests/suggestions.test.ts runs all of them through the same loop as the phone).
 */
export type Stage = 'early' | 'pre' | 'boarding' | 'climb' | 'cruise' | 'descent';
export type SuggestionIcon = 'seat' | 'clock' | 'shield' | 'landing' | 'wind' | 'phone' | 'map' | 'file' | 'bag' | 'drop' | 'chat';
export type Suggestion = { id: string; ro: string; en: string; icon: SuggestionIcon; phase: 'ground' | 'air'; stages: Stage[] };

const G = (id: string, ro: string, en: string, icon: SuggestionIcon, stages: Stage[]): Suggestion => ({ id, ro, en, icon, phase: 'ground', stages });
const A = (id: string, ro: string, en: string, icon: SuggestionIcon, stages: Stage[]): Suggestion => ({ id, ro, en, icon, phase: 'air', stages });

export const SUGGESTIONS: Suggestion[] = [
  // on the ground, long before boarding
  G('docs', 'Ce documente îmi trebuie?', 'What documents do I need?', 'file', ['early']),
  G('cabin', 'Ce dimensiuni are bagajul de mână?', 'What size can my cabin bag be?', 'bag', ['early', 'pre']),
  G('liquids', 'Am voie cu lichide?', 'Can I take liquids?', 'drop', ['early', 'pre']),
  G('powerbank', 'Pot lua un powerbank?', 'Can I bring a power bank?', 'bag', ['early', 'pre']),
  G('security-where', 'Unde e controlul de securitate?', 'Where is security control?', 'map', ['early']),
  G('info', 'Unde e ghișeul de informații?', 'Where is the information desk?', 'map', ['early']),
  G('eat', 'Unde pot mânca ceva?', 'Where can I get something to eat?', 'map', ['early', 'pre']),
  G('coco', 'Unde e barul lui Coco?', 'Where is Coco’s bar?', 'map', ['early', 'pre']),
  G('atm', 'Unde e un bancomat?', 'Where is an ATM?', 'map', ['early']),
  G('pharmacy', 'Unde găsesc o farmacie?', 'Where can I find a pharmacy?', 'map', ['early']),
  G('pets', 'Am voie cu animale de companie?', 'Can I travel with a pet?', 'chat', ['early']),
  G('wheelchair', 'Sunt în scaun cu rotile, am nevoie de asistență', 'I use a wheelchair and need assistance', 'chat', ['early']),
  // a bit later: seat, boarding, security time
  G('seat', 'Ce loc am?', 'What is my seat?', 'seat', ['early', 'pre', 'boarding']),
  G('boarding', 'La ce oră e îmbarcarea?', 'When does boarding start?', 'clock', ['early', 'pre']),
  G('security-time', 'Cât durează securitatea?', 'How long is security?', 'shield', ['pre']),
  G('gate', 'Pe ce poartă sunt?', 'What gate am I at?', 'map', ['pre', 'boarding']),
  G('departure', 'La ce oră decolăm?', 'When do we take off?', 'clock', ['pre', 'boarding']),
  G('knives', 'Pot lua cuțite?', 'Can I bring a knife?', 'bag', ['pre']),
  G('laptop', 'Pot lua laptop în bagajul de mână?', 'Can I take a laptop in my cabin bag?', 'bag', ['pre']),
  G('alcohol', 'Am voie cu alcool?', 'Can I bring alcohol?', 'drop', ['pre']),
  G('medicine', 'Pot lua medicamente la mine?', 'Can I bring medicines?', 'bag', ['pre']),
  G('toilet', 'Unde e toaleta?', 'Where is the restroom?', 'map', ['pre', 'boarding']),
  G('gate3', 'Unde e poarta 3?', 'Where is gate 3?', 'map', ['boarding']),
  G('flight-time', 'Cât durează zborul?', 'How long is the flight?', 'clock', ['boarding']),
  G('compensation', 'Primesc despăgubire dacă zborul e anulat?', 'Do I get compensation if my flight is cancelled?', 'file', ['pre', 'boarding']),
  G('china', 'Pot călători cu buletinul în China?', 'Can I travel to China with an ID card?', 'file', ['early']),
  G('usa', 'Pot intra în SUA cu pașaport românesc?', 'Can I enter the USA with a Romanian passport?', 'file', ['early', 'pre']),
  // in the air
  A('landing', 'Când aterizăm?', 'When do we land?', 'landing', ['climb', 'cruise', 'descent']),
  A('flight-length', 'Cât durează zborul?', 'How long is the flight?', 'clock', ['climb']),
  A('turbulence', 'Ce înseamnă turbulența?', 'What does turbulence mean?', 'wind', ['climb', 'cruise']),
  A('phone', 'Pot folosi telefonul?', 'Can I use my phone?', 'phone', ['climb', 'cruise']),
  A('docs-arrival', 'Ce documente îmi trebuie?', 'What documents do I need?', 'file', ['cruise', 'descent']),
  A('lost-bag', 'Mi-a pierdut bagajul, ce fac?', 'My bag was lost, what do I do?', 'bag', ['descent']),
  A('compensation-air', 'Primesc despăgubire dacă zborul e anulat?', 'Do I get compensation if my flight is cancelled?', 'file', ['cruise']),
  A('car', 'Unde pot închiria o mașină?', 'Where can I rent a car?', 'map', ['descent']),
  A('atm-arrival', 'Unde e un bancomat?', 'Where is an ATM?', 'map', ['descent']),
  A('pets-air', 'Am voie cu animale de companie?', 'Can I travel with a pet?', 'chat', ['cruise']),
  A('china-air', 'Pot călători cu buletinul în China?', 'Can I travel to China with an ID card?', 'file', ['cruise']),
];

/** The stage from what the app knows: minutes to boarding on the ground, flight progress (0–1) in the air */
export function stageOf(inAir: boolean, minutesToBoarding: number, progress: number | null | undefined): Stage {
  if (inAir) {
    const p = progress ?? 0.5;
    return p < 0.2 ? 'climb' : p > 0.8 ? 'descent' : 'cruise';
  }
  return minutesToBoarding > 150 ? 'early' : minutesToBoarding > 15 ? 'pre' : 'boarding';
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** The ids of the suggestions a typed or tapped question corresponds to (same text in either language), so it leaves the list whichever way it was asked */
export function suggestionIdsFor(question: string): string[] {
  const q = norm(question);
  return SUGGESTIONS.filter(s => norm(s.ro) === q || norm(s.en) === q).map(s => s.id);
}

/**
 * The next chips: not yet asked, for the current phase, the ones that fit the stage first. When everything for this phase was asked,
 * the list starts over (the asked set is ignored) instead of going empty.
 */
export function nextSuggestions(inAir: boolean, stage: Stage, lang: Language, asked: ReadonlySet<string>, count = 4): { id: string; text: string; icon: SuggestionIcon }[] {
  const phase = SUGGESTIONS.filter(s => (s.phase === 'air') === inAir);
  const seenText = new Set<string>();
  const pool = (skipAsked: boolean) =>
    phase
      .filter(s => !(skipAsked && asked.has(s.id)))
      .sort((a, b) => Number(b.stages.includes(stage)) - Number(a.stages.includes(stage))) // stable: the bank order holds inside each group
      .filter(s => {
        const key = norm(s[lang]); // two entries can share a text (documents, compensation): shown once
        if (seenText.has(key)) return false;
        seenText.add(key);
        return true;
      });
  let list = pool(true);
  if (list.length === 0) {
    seenText.clear();
    list = pool(false);
  }
  return list.slice(0, count).map(s => ({ id: s.id, text: s[lang], icon: s.icon }));
}
