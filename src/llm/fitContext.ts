import type { ChatMessage } from '../core/assistant';

/** The prompt cannot be made to fit the context window. The caller shows a plain message; the engine is not touched. */
export class ContextOverflowError extends Error {
  constructor(public tokens: number, public budget: number) {
    super(`prompt of ${tokens} tokens does not fit ${budget}`);
    this.name = 'ContextOverflowError';
  }
}

type Doc = Record<string, unknown> & { text?: string };

/** One step of shortening a tool result: drop the last document, else shorten the last document's text, else cut the string. Null = nothing left to cut. */
function shorten(content: string, cutChars: number): string | null {
  try {
    const j = JSON.parse(content) as { result?: { documents?: Doc[] } };
    const docs = j.result?.documents;
    if (Array.isArray(docs) && docs.length) {
      if (docs.length > 1) docs.pop();
      else if (typeof docs[0].text === 'string' && docs[0].text.length > 160) docs[0].text = `${docs[0].text.slice(0, Math.max(120, docs[0].text.length - cutChars))}…`;
      else return null;
      return JSON.stringify(j);
    }
  } catch {
    /* not JSON: cut the text */
  }
  return content.length > 200 ? `${content.slice(0, Math.max(160, content.length - cutChars))}…` : null;
}

/**
 * A prompt longer than the context window must never reach llama.cpp: with `ctx_shift` off the call fails, and on the iPhone one such call aborted the whole app
 * (ggml_abort in the Metal encoder). The second step of a rules question (system + tools + question + three knowledge-base documents) was 2.1k tokens against a 2048 window.
 * Here the prompt is measured with the model's own tokenizer and, if it is too long, the LAST tool result is shortened (documents first) until it fits.
 * `budget` is the window minus the room kept for the answer.
 */
export async function fitToContext(
  messages: ChatMessage[],
  render: (m: ChatMessage[]) => string,
  count: (text: string) => Promise<number>,
  budget: number,
): Promise<{ messages: ChatMessage[]; tokens: number; trimmed: boolean }> {
  let msgs = messages;
  let trimmed = false;
  let n = await count(render(msgs));
  for (let i = 0; i < 12 && n > budget; i++) {
    const at = msgs.map(m => m.role).lastIndexOf('tool');
    const cut = shorten(at >= 0 ? msgs[at].content : '', Math.ceil((n - budget) * 3.2));
    if (at < 0 || cut === null) throw new ContextOverflowError(n, budget);
    msgs = msgs.map((m, k) => (k === at ? { ...m, content: cut } : m));
    trimmed = true;
    n = await count(render(msgs));
  }
  if (n > budget) throw new ContextOverflowError(n, budget);
  return { messages: msgs, tokens: n, trimmed };
}
