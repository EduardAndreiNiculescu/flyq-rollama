import type { Poi, PoiKind } from '../../types';

const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Words a passenger (or the model) uses for a place -> the kind of POI in pois.json.
const KIND_WORDS: [PoiKind, RegExp][] = [
  ['toilet', /toalet|\bwc\b|baie|bath|restroom|toilet|lavatory/],
  ['smoking', /fum|smok/],
  ['power', /incarc|charg|priz|outlet|power/],
  ['info', /info|ghiseu|desk|help/],
  ['stairs', /scari|stair/],
  ['lift', /lift|elevator|ascensor/],
  ['shop', /magazin|shop|duty|cafe|cafenea|restaurant|mancare|food|eat|bufet/],
];

/** Map a free-text destination to a POI of the front-end's terminal; null when nothing matches (the caller then says so, it never guesses). */
export function matchPoi(destination: string, pois: Poi[]): Poi | null {
  const d = plain(destination);
  const gate = /(?:poarta|gate)\s*(\d+)/.exec(d);
  if (gate) return pois.find(p => p.kind === 'gate' && p.nodeId.endsWith(`gate${gate[1]}`)) ?? null;
  for (const [kind, re] of KIND_WORDS) if (re.test(d)) return pois.find(p => p.kind === kind) ?? null;
  return pois.find(p => plain(p.label.ro) === d || plain(p.label.en) === d) ?? null;
}
