import { describe, expect, it } from 'vitest';
import { STATIC_SYSTEM_V4 } from '../src/llm/contractV4';
import { guardToolAnswer } from '../src/tools/guardAnswer';

const DOC = 'La aeroportul Craiova scoate laptopurile si alte echipamente electronice din bagajul de mana la controlul de securitate.';
const msgs = (doc = DOC) => [
  { role: 'system', content: STATIC_SYSTEM_V4 },
  { role: 'user', content: 'Ce fac cu laptopul la securitate?' },
  { role: 'tool', content: JSON.stringify({ result: { documents: [{ id: 'sec-ro', text: doc }] } }) },
];

// The V4 prompt has no "=== SECTION" lines. The leak check used to treat everything after it, documents included, as the prompt,
// so a correct answer copied from a document was replaced by the fallback.
describe('answer guard under the static V4 prompt', () => {
  it('keeps an answer that copies a sentence from a retrieved document', () => {
    const r = guardToolAnswer(msgs() as never, DOC, 'Ce fac cu laptopul la securitate?');
    expect(r.violations).toEqual([]);
    expect(r.text).toBe(DOC);
  });
  it('still catches an answer that copies the system prompt', () => {
    const leaked = STATIC_SYSTEM_V4.split('\n')[3]; // the rule about calling a tool first
    const r = guardToolAnswer(msgs() as never, leaked, 'Ce reguli ai?');
    expect(r.violations.some(v => v.kind === 'leak')).toBe(true);
  });
});
