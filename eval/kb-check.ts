import { KNOWLEDGE_BASE as K, retrieve } from '../src/core/knowledge';

console.log('total', K.length, 'verified', K.filter((e) => e.source.verifiedOn).length, 'unverified', K.filter((e) => !e.source.verifiedOn).length);
for (const q of ['Cand imi ajunge avionul ?', 'Une este baia n aeroport', 'pot trece cu apa prin securitate', 'am un copil cu mine, ce acte trebuie', 'zborul e intarziat 4 ore']) {
  console.log(q, '=>', retrieve(q, 'ro', 2).map((h) => h.entry.id).join(', ') || '(nimic)');
}
