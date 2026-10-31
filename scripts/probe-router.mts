// Debug: what the deterministic layer decides for a question, before the model is involved.
//   npx tsx scripts/probe-router.mts "La ce ora e imbarcarea?" "am voie cu lichide"
import { capabilityBoundary } from '../src/core/capability';
import { routeDecision } from '../src/core/router';
import { tier1Capability, tier1FastTool } from '../src/core/tier1';
import { normalizePassengerQuery } from '../src/llm/rollama';
import { toolFor } from '../src/tools/fastPath';

const qs = process.argv.length > 2 ? process.argv.slice(2) : ['Ce loc am?', 'La ce oră e îmbarcarea?', 'Cât durează securitatea?', 'am voie cu lichide', 'Ce poartă am?', 'La ce oră decolăm?', 'mai am vreme de o țigară', 'Unde e toaleta?'];
for (const q of qs) {
  const clean = normalizePassengerQuery(q);
  const d = routeDecision(q, { flightNumber: 'W63541' });
  console.log(JSON.stringify({ q, clean, capability: capabilityBoundary(clean), tier1Cap: tier1Capability(clean), tier1Fast: tier1FastTool(clean), fastPathTool: toolFor(q), router: { action: d.action, evidence: d.evidence, candidates: d.candidates.map((c) => c.tool) } }));
}
