/** Deterministic typo injection for robustness benchmarks. */
export function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NEIGHBORS: Record<string, string> = {
  q: 'wa', w: 'qes', e: 'wrd', r: 'etf', t: 'ryg', y: 'tuh', u: 'yij', i: 'uok', o: 'ipl', p: 'ol',
  a: 'qsz', s: 'awdx', d: 'sefc', f: 'drgv', g: 'fthb', h: 'gyjn', j: 'hukm', k: 'jil', l: 'kop',
  z: 'asx', x: 'zsdc', c: 'xdfv', v: 'cfgb', b: 'vghn', n: 'bhjm', m: 'njk',
};

export type TypoOp = 'swap' | 'delete' | 'duplicate' | 'substitute';

/** Apply exactly one typo to a word (len >= 5): never touches the first letter. */
export function typo(word: string, rnd: () => number): string {
  const ops: TypoOp[] = ['swap', 'delete', 'duplicate', 'substitute'];
  const op = ops[Math.floor(rnd() * ops.length)];
  const i = 1 + Math.floor(rnd() * (word.length - 2)); // 1..len-2
  switch (op) {
    case 'swap': return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
    case 'delete': return word.slice(0, i) + word.slice(i + 1);
    case 'duplicate': return word.slice(0, i) + word[i] + word.slice(i);
    case 'substitute': {
      const n = NEIGHBORS[word[i].toLowerCase()];
      return n ? word.slice(0, i) + n[Math.floor(rnd() * n.length)] + word.slice(i + 1) : word;
    }
  }
}

/** Inject typos into about `rate` of the eligible words (letters only, len >= 5); at least one if any exist. */
export function injectTypos(text: string, rnd: () => number, rate = 0.35): string {
  const words = [...text.matchAll(/\p{L}{5,}/gu)];
  if (!words.length) return text;
  const chosen = new Set(words.map((_, i) => i).filter(() => rnd() < rate));
  if (!chosen.size) chosen.add(Math.floor(rnd() * words.length));
  let out = '';
  let last = 0;
  words.forEach((m, i) => {
    out += text.slice(last, m.index);
    out += chosen.has(i) ? typo(m[0], rnd) : m[0];
    last = (m.index ?? 0) + m[0].length;
  });
  return out + text.slice(last);
}
