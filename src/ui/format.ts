// Pure presentation helpers for assistant replies (no React / RN imports, unit-tested).
import type { AskResult } from '../core/assistant';

export type UiLang = 'ro' | 'en';
type Source = AskResult['source'];

const LABELS: Record<Source, Record<UiLang, string>> = {
  template: { ro: 'calculat din orar', en: 'computed from schedule' },
  model: { ro: 'model local', en: 'local model' },
  clarification: { ro: 'întrebare de clarificare', en: 'clarifying question' },
  guard_fallback: { ro: 'răspuns de siguranță', en: 'safety answer' },
};

/** Short badge text telling the passenger where the answer came from. */
export function sourceLabel(result: Pick<AskResult, 'source'>, lang: UiLang): string {
  return (LABELS[result.source] ?? LABELS.model)[lang === 'en' ? 'en' : 'ro'];
}

const pos = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * "TTFT 420 ms · 12.3 tok/s", only for answers the model actually generated.
 * Template/clarification answers (and null/zero/NaN stats) yield ''.
 */
export function metaLine(result: Pick<AskResult, 'source' | 'stats'>): string {
  if (result.source === 'template' || result.source === 'clarification') return '';
  const s = result.stats;
  if (!s) return '';
  const parts: string[] = [];
  if (pos(s.timeToFirstTokenMs)) parts.push(`TTFT ${Math.round(s.timeToFirstTokenMs)} ms`);
  if (pos(s.tokensPerSecond)) parts.push(`${s.tokensPerSecond.toFixed(1)} tok/s`);
  return parts.join(' · ');
}

/** 'am înțeles „bagajul" în loc de „bagjaul"'; '' when nothing was corrected. */
export function correctionNote(result: Pick<AskResult, 'corrections'>, lang: UiLang): string {
  const list = (result.corrections ?? []).filter((c) => c && c.from && c.to && c.from !== c.to);
  if (list.length === 0) return '';
  const [understood, instead] = lang === 'en' ? ['understood', 'instead of'] : ['am înțeles', 'în loc de'];
  const [open, close] = lang === 'en' ? ['\u201C', '\u201D'] : ['\u201E', '\u201D']; // English \u201C\u2026\u201D, Romanian \u201E\u2026\u201D
  return list
    .slice(0, 3)
    .map((c) => `${understood} ${open}${c.to}${close} ${instead} ${open}${c.from}${close}`)
    .join('; ');
}
