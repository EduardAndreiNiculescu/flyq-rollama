import placesData from '../data/places.json';

/**
 * Places in the airport that the assistant can answer "where is / where do I find" for, without the model and without fine-tuning: a catalogue with
 * many ways of saying each place, a matcher for the many ways of asking, and answers composed from the catalogue. The LiDAR indoor map plugs in with
 * `registerPlaces` (it adds or overrides places with their map node and a description) and keeps the same assistant code.
 */
export type Lang = 'ro' | 'en';
export type Place = {
  id: string;
  kind: string;
  names: { ro: string; en: string };
  /** Ways to say it, without diacritics and in lower case; multi-word aliases are matched as phrases, single words as prefixes of the typed word */
  aliases: string[];
  /** The node of the indoor map; when present the map can open on the place */
  nodeId?: string;
  /** The id of the place's label on the 3D terminal map (flyq-spatial): the map opens with a route to it */
  mapLabel?: string;
  /** Where it is, in words. null/absent: not known yet (the map will say) */
  where?: { ro: string; en: string } | null;
  /** A named venue ("Coco's bar") wins over a generic word ("mananc") when both match */
  named?: boolean;
};

const BASE: Place[] = (placesData as { places: Place[] }).places;
let provided: Place[] = [];

/** The map module (or anything that knows the real places) calls this: its places add to the catalogue and replace one with the same id. */
export function registerPlaces(places: Place[]): void {
  provided = places;
}
export const allPlaces = (): Place[] => {
  const ids = new Set(provided.map(p => p.id));
  return [...BASE.filter(p => !ids.has(p.id)), ...provided];
};

export const plainText = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The ways to ask "where": "unde e", "unde găsesc", "unde se află", "cum ajung la", "arată-mi", "where is", "how do I get to", "în ce parte", "la ce etaj"... (filler words in between do not matter) */
const WHERE =
  /\b(unde|undei|unde i|undeva|incotro|pe unde|in ce parte|la ce etaj|cum ajung|cum merg|cum gasesc|gasesc|gasim|gasesti|gasi|afla|arata mi|arata ma|spune mi unde|indica mi|duce ma|where|how do i get|how can i get|how do i find|show me|find|directions? to|which way)\b/;

const matchWord = (tok: string, alias: string) =>
  tok === alias || (alias.length >= 4 && tok.length >= alias.length && tok.startsWith(alias)) || (tok.length >= 5 && alias.length >= tok.length && alias.startsWith(tok));

/** The longest alias of the place that appears in the question, as a number of characters (0: it does not appear) */
function aliasScore(norm: string, tokens: string[], place: Place): number {
  let best = 0;
  for (const raw of place.aliases) {
    const a = plainText(raw);
    if (!a) continue;
    const words = a.split(' ');
    const hit =
      words.length > 1
        ? ` ${norm} `.includes(` ${a} `) || (words.length <= 3 && words.every(w => tokens.some(t => matchWord(t, w))))
        : tokens.some(t => matchWord(t, a));
    if (hit) best = Math.max(best, a.length);
  }
  return best;
}

export type PlaceQuery = { places: Place[]; gate?: string };

/**
 * Is this a "where is X" question about a place we know? null when it is not (no place word, or no way of asking where): the question then goes on to the
 * normal flow. Gates ("poarta 3") and check-in desks ("ghișeul 4") are recognised by their number.
 */
export function findPlaces(question: string, places: Place[] = allPlaces()): PlaceQuery | null {
  const norm = plainText(question);
  if (!WHERE.test(norm)) return null;
  const tokens = norm.split(' ').filter(Boolean);
  const gate = /\b(?:poarta|poarta nr|gate|poarta numarul)\s*(\d{1,2})\b/.exec(norm)?.[1];
  if (gate) return { places: [], gate };
  const desk = /\b(?:ghiseul|ghiseele|ghiseu|desk)\s*(\d{1,2})\b/.exec(norm)?.[1];
  if (desk) {
    const checkin = places.find(p => p.id === 'checkin');
    return checkin ? { places: [checkin] } : null;
  }
  const scored = places
    .map(p => {
      const s = aliasScore(norm, tokens, p);
      return { p, s: s > 0 && p.named ? s + 20 : s };
    })
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s);
  if (scored.length === 0) return null;
  const top = scored[0]!.s;
  // The most specific mention (the longest alias) wins; only a tie leaves several places (the passenger is then told there are several)
  const keep = scored.filter(x => x.s >= top).map(x => x.p);
  return { places: keep.slice(0, 3) };
}

const pick = (variants: string[], seed: string) => variants[[...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % variants.length]!;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export type PlaceAnswer = { text: string; open?: { destination: string; nodeId?: string; mapLabel?: string } };

/** The answer for a place question, from the catalogue only. `mapReady`: the app has a map to open (so "I opened the map" can be said). */
export function composePlaceAnswer(q: PlaceQuery, lang: Lang, seed: string, mapReady: boolean): PlaceAnswer {
  const ro = lang === 'ro';
  if (q.gate) {
    const n = q.gate;
    const text = ro
      ? pick([`Poarta ${n} e la etajul 1, în zona porților de îmbarcare.`, `Găsești poarta ${n} la etajul 1, după controlul de securitate.`], seed)
      : pick([`Gate ${n} is on floor 1, in the boarding gates area.`, `You will find gate ${n} on floor 1, after security.`], seed);
    return { text: mapReady ? `${text} ${ro ? 'Am deschis harta.' : 'I opened the map.'}` : text, open: { destination: ro ? `Poarta ${n}` : `Gate ${n}` } };
  }
  if (q.places.length === 1) {
    const p = q.places[0]!;
    const name = p.names[lang];
    const where = p.where?.[lang];
    if (where) {
      const text = ro
        ? pick([`${name}: ${lower(where)}.`, `${name} se află ${lower(where)}.`, `Îl găsești așa: ${lower(where)} (${name}).`], seed)
        : pick([`${name}: ${lower(where)}.`, `You will find ${name} ${lower(where)}.`], seed);
      const opens = (!!p.nodeId || !!p.mapLabel) && mapReady;
      return { text: opens ? `${text} ${ro ? 'Am deschis harta.' : 'I opened the map.'}` : text, open: p.nodeId || p.mapLabel ? { destination: name, nodeId: p.nodeId, mapLabel: p.mapLabel } : undefined };
    }
    if (p.mapLabel) {
      // No description in words, but the 3D terminal map has the place
      const text = ro ? `${name} e marcat pe harta 3D a terminalului.` : `${name} is marked on the 3D terminal map.`;
      return { text: mapReady ? `${text} ${ro ? 'Am deschis harta.' : 'I opened the map.'}` : text, open: { destination: name, mapLabel: p.mapLabel } };
    }
    return {
      text: ro
        ? `${name} este în terminal, dar poziția exactă o să apară pe hartă imediat ce harta aeroportului e conectată. Până atunci întreabă la ghișeul de informații.`
        : `${name} is in the terminal, but its exact position will appear on the map as soon as the airport map is connected. Until then ask at the information desk.`,
    };
  }
  const list = q.places.map(p => p.names[lang]).join(', ');
  return {
    text: ro
      ? `Am găsit mai multe locuri care se potrivesc: ${list}. Spune-mi care te interesează și îți arăt unde e.`
      : `I found several places that fit: ${list}. Tell me which one you mean and I will show you where it is.`,
  };
}
