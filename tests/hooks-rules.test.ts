import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// "Rendered fewer hooks than expected" crashed the iPhone app the moment the model started answering: a screen background called
// `useProgress(...) || useModelUi(...)`, and when the first hook returned true the second was skipped. There is no eslint hooks plugin in this repo,
// so this test scans the sources for a hook placed behind a short-circuit or a ternary.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

describe('rules of hooks', () => {
  it('no hook is called conditionally behind ||, && or ?:', () => {
    const bad: string[] = [];
    for (const f of files('src')) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '');
        if (/(\|\||&&|\?\?|\?)\s*use[A-Z]\w*\(/.test(code) || /use[A-Z]\w*\([^;]*\)\s*(\|\||&&|\?\?)\s*use[A-Z]\w*\(/.test(code)) bad.push(`${f}:${i + 1}: ${code.trim()}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
