// Debug: what the offline knowledge base returns for a question.
//   npx tsx scripts/probe-kb.mts "Cât durează securitatea?"
import { retrieve } from '../src/core/knowledge';

const qs = process.argv.length > 2 ? process.argv.slice(2) : ['Cât durează securitatea?', 'cat dureaza controlul de securitate', 'La ce oră e îmbarcarea?', 'am voie cu lichide'];
for (const q of qs) {
  const hits = retrieve(q, 'ro', 2);
  console.log(JSON.stringify({ q, hits: hits.map((h) => `${h.entry.id} (${h.score})`), top: hits[0]?.entry.body.slice(0, 110) ?? null }));
}
