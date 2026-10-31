import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Label = 'get_flight_details' | 'get_gate' | 'get_time_remaining' | 'get_live_tracking' | 'search_knowledge' | 'open_airport_map' | 'clarify' | 'none';
type Candidate = { text: string; lang?: string; origin?: string; source?: string; sourceLabel?: Label };

const root = process.cwd();
const cleaned = JSON.parse(readFileSync(join(root, 'finetune', 'intent_classifier', 'apify_cleaned.json'), 'utf8')).accepted as Array<{ text: string; lang: string; origin: string; label: Label }>;
const raw = JSON.parse(readFileSync(join(root, 'eval', 'apify-flight-discovery.json'), 'utf8')) as Array<{ question: string; lang: string; origin: string }>;

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const broken = (s: string) => /\.\.\.|…|·|read more|citește mai mult|https?:|©|cookie|privacy policy|^\d{1,2}\s+\p{L}+\s+\d{4}/iu.test(s) || s.length < 12 || s.length > 180;
const questionLike = (s: string) => /\?$/.test(s.trim()) || /^(what|how|can|could|do|does|is|are|where|when|why|which|who|ce|cum|pot|poate|care|unde|cand|când|de ce|cati|câți|cate|câte|trebuie)\b/i.test(s.trim());

function strictLabel(text: string): Label | null {
  const q = norm(text);
  if (/ignore|system prompt|jailbreak|developer mode|bypass|drop table|delete all|uita tot|ignora|fara restrictii/.test(q)) return 'none';
  if (/\b(bitcoin|reteta|fotbal|pariuri|windows|iphone|apartament|bursa|metrou|tren)\b|hotel marriott|curs valutar/.test(q)) return 'none';
  if (/compens|despagub|drept|regul|bagaj|bags?\b|baggage|luggage|suitcase|carry on|hand carry|checked bag|lichid|liquid|powerbank|bater|lithium|passport|pasaport|buletin|real id|document|viza|visa|boarding pass|bilet de imbarcare|check in|animal|pet|dog|cat\b|caine|pisic|wheelchair|scaun cu rotile|minor|copil|children|child\b|kids? fly alone|year old fly alone|baby|bebe|infant|security|securitate|customs|vama|medicament|medication|prescription|needle|insulin|anulat|cancelled|overbook|refund|ramburs|obiecte.*interzise|miss(ed|ing)? (my )?flight|pierzi avionul|prima data cu avionul|first time fly/.test(q)) return 'search_knowledge';
  if (/unde (este|e|gasesc|pot gasi)|where (is|are|can i find)|nearest|du ma la|take me to/.test(q) && /toalet|restroom|wc|caf|restaurant|bancomat|atm|farmacie|pharmacy|rent a car|car rental|birou|desk|check in|security|securitate/.test(q)) return 'open_airport_map';
  if (/unde este avionul|unde e avionul|where is (the|my) (plane|aircraft)|pozitia avionului|radar|live track|tracking live/.test(q)) return 'get_live_tracking';
  if (/cat (mai )?(timp|dureaza)|cate minute|peste cat timp|how long until|time remaining|minutes until/.test(q)) return 'get_time_remaining';
  if (/poarta|gate number|which gate|what gate|boarding gate/.test(q) && !/unde (este|e|gasesc)|where is/.test(q)) return 'get_gate';
  if (/status|intarzi|delay|ora (de )?(plecare|sosire)|departure time|arrival time|decoleaza|aterizeaza|depart|arriv|flight details|zborul meu/.test(q)) return 'get_flight_details';
  if (/^(zborul|flight|ajutor|help|arata mi|show me)[ ?!]*$/.test(q)) return 'clarify';
  return null;
}

const merged: Candidate[] = [
  ...cleaned.map((x) => ({ text: x.text, lang: x.lang, origin: x.origin, source: 'apify_cleaned', sourceLabel: x.label as Label })),
  ...raw.map((x) => ({ text: x.question, lang: x.lang, origin: x.origin, source: 'apify_discovery' })),
];
const seen = new Set<string>();
const buckets = new Map<Label, Array<Candidate & { label: Label }>>();
for (const c of merged) {
  if (broken(c.text)) continue;
  if (!questionLike(c.text)) continue;
  const key = norm(c.text);
  if (seen.has(key)) continue;
  seen.add(key);
  const label = strictLabel(c.text) ?? c.sourceLabel ?? null;
  if (!label) continue;
  const list = buckets.get(label) ?? [];
  list.push({ ...c, label });
  buckets.set(label, list);
}

const quotas: Record<Label, number> = {
  search_knowledge: 150,
  none: 50,
  get_flight_details: 40,
  get_gate: 25,
  get_time_remaining: 15,
  get_live_tracking: 5,
  open_airport_map: 10,
  clarify: 5,
};
const selected: Array<Candidate & { label: Label }> = [];
for (const [label, quota] of Object.entries(quotas) as Array<[Label, number]>) {
  const items = buckets.get(label) ?? [];
  selected.push(...items.slice(0, quota));
}
if (selected.length < 300) {
  const used = new Set(selected.map((x) => norm(x.text)));
  const remainder = [...buckets.values()].flat().filter((x) => !used.has(norm(x.text)));
  selected.push(...remainder.slice(0, 300 - selected.length));
}

const output = selected.slice(0, 300).map((x, i) => ({
  id: `web-control-${String(i + 1).padStart(3, '0')}`,
  question: x.text,
  lang: x.lang ?? 'unknown',
  expectedAny: x.label === 'none' || x.label === 'clarify' ? [] : [x.label],
  expectedAction: x.label === 'none' ? 'none' : x.label === 'clarify' ? 'clarify' : 'execute',
  forbidden: x.label === 'none' || x.label === 'clarify' ? ['get_flight_details', 'get_gate', 'get_time_remaining', 'get_live_tracking', 'search_knowledge', 'open_airport_map'] : [],
  origin: x.origin ?? 'unknown',
  source: x.source,
  annotation: 'strict-rule candidate; requires human review',
}));
writeFileSync(join(root, 'eval', 'apify-control-300.json'), JSON.stringify(output, null, 2), 'utf8');
console.log(JSON.stringify({ total: output.length, labels: Object.fromEntries(Object.keys(quotas).map((l) => [l, output.filter((x) => x.expectedAction === l || x.expectedAny.some((v) => v === l)).length])) }, null, 2));
