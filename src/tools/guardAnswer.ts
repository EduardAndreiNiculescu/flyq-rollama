import type { ChatMessage } from '../core/assistant';
import { checkAnswer, guardFallback, MESSAGE_SEP, type Violation } from '../core/guard';
import { detectLang } from '../core/prompt';
import { EU_EMERGENCY_NUMBER, isEmergencyRelated } from '../core/emergency';

/**
 * The same answer guard the app's grounded mode uses, for answers written after tool calls: the model's text is checked against everything it was
 * given. Current tool results support factual claims; the full prompt is used only for leak detection. An invented number, flight code, gate, status claim or prompt leak is replaced by an honest
 * fallback instead of being shown. Tool results are JSON strings, so escaped line breaks are turned back into real ones first (the guard reads status lines).
 */
export function guardToolAnswer(messages: ChatMessage[], text: string, question: string, known: string[] = []): { text: string; violations: Violation[] } {
  // `known` = facts the app itself holds but the tools do not repeat (the selected flight number): the model may name them.
  const context = [...messages.map(m => m.content.replace(/\\n/g, '\n')), ...known].join(MESSAGE_SEP);
  const lastUser = messages.map(m => m.role).lastIndexOf('user');
  const trustedEmergencyNumber = isEmergencyRelated(question) && messages.some(m => m.role === 'system' && m.content.includes(EU_EMERGENCY_NUMBER)) ? [EU_EMERGENCY_NUMBER] : [];
  const evidence = [...messages.slice(lastUser + 1).filter(m => m.role === 'tool').map(m => m.content.replace(/\\n/g, '\n')), ...known, ...trustedEmergencyNumber].join(MESSAGE_SEP);
  const lang = detectLang(question);
  const v = checkAnswer({ answer: text, context, evidence, lang });
  return v.ok ? { text, violations: [] } : { text: guardFallback(lang, v.violations), violations: v.violations };
}
