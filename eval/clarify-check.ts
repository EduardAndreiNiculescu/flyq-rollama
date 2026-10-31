import { readFileSync } from 'node:fs';
import { needsClarification } from '../src/core/clarify';
import { detectLang } from '../src/core/prompt';
import { retrieve } from '../src/core/knowledge';
import { routeIntents } from '../src/core/router';

type Q = { id: string; question: string; lang?: string };
const load = (f: string): Q[] => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const all = [...load('./questions.json'), ...load('./tool-cases.json')];

for (const hasFlight of [true, false]) {
let asked = 0;
console.log(`--- hasFlight=${hasFlight} ---`);
for (const q of all) {
  const lang = detectLang(q.question);
  const r = needsClarification({
    question: q.question,
    intents: routeIntents(q.question),
    hasFlight,
    retrievalHitCount: retrieve(q.question, lang, 3).length,
    corrections: 0,
    lang,
  });
  if (r) {
    asked++;
    console.log(`${q.id} [${r.reason}] ${q.question}\n      -> ${r.ask}`);
  }
}
console.log(`${asked}/${all.length} questions get a clarification`);
}
