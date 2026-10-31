import { create } from 'zustand';
import type { ToolTiming } from '../tools/loop';

// Measurements of the last on-device answer, shown under the chat and collected by the benchmark.
export type AnswerStats = {
  mode: string; // which pipeline produced the answer
  via: string; // template | model | guard_fallback | clarification | tools | error
  modelUsed: boolean; // false = no successful model call (template, fast path, or failure)
  ttftMs: number | null;
  tokensPerSecond: number | null;
  tokens: number;
  totalMs: number;
  tools: string[];
  path?: 'fast' | 'composed' | 'model';
  timing?: ToolTiming;
  guardViolations?: string[];
  adapter: boolean;
};

export const useAnswerStats = create<{ last: AnswerStats | null; set: (s: AnswerStats) => void }>(set => ({ last: null, set: last => set({ last }) }));

export function statsLine(s: AnswerStats): string {
  const speed = s.tokensPerSecond !== null ? `${s.tokensPerSecond.toFixed(1)} tok/s` : '–';
  const ttft = s.ttftMs !== null ? `primul token ${(s.ttftMs / 1000).toFixed(1)} s` : '';
  const kind = s.via === 'error' ? `${s.mode} · eroare` : s.modelUsed ? `${s.mode}${s.adapter ? ' + adaptor' : ''}` : 'răspuns determinist (fără model)';
  const path = s.path === 'fast' ? 'cale:rapid' : s.path === 'composed' ? 'cale:compus' : s.path === 'model' ? 'cale:model' : '';
  return [kind, speed, ttft, `${(s.totalMs / 1000).toFixed(1)} s total`, s.tools.length ? `unelte: ${s.tools.join(', ')}` : '', path, s.guardViolations?.length ? `garda:${s.guardViolations.join('+')}` : ''].filter(Boolean).join(' · ');
}
