import { readFileSync } from 'node:fs';
import { routeIntents } from '../src/core/router';

const qs: { id: string; category: string; question: string }[] = JSON.parse(readFileSync(new URL('./questions.json', import.meta.url), 'utf8'));
for (const q of qs) {
  const r = routeIntents(q.question).map((i) => i.intent.replace('GET_', '').replace('_GUIDANCE', '') + (i.args.destination ? `(${i.args.destination})` : ''));
  console.log(`${q.id} [${q.category}] ${q.question}\n      -> ${r.join(' + ')}`);
}
