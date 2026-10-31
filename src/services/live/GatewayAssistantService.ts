import type { FlightContext } from '../../types';
import type { AssistantService } from '../types';
import { useAnswerStats } from '../../store/stats';
import { askLaptop } from './gatewayClient';
import { flightKey } from './livePosition';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const FAIL = {
  ro: 'Nu pot ajunge la laptop (gateway). Verifică adresa și tokenul în ecranul „Mod test”.',
  en: 'I cannot reach the laptop gateway. Check the address and token on the "Test mode" screen.',
};

/** The desktop model (Ollama + the same tools as the app) behind the test gateway. Lets us test the whole flow before the phone has a model. */
export class GatewayAssistantService implements AssistantService {
  async *ask(question: string, context: FlightContext): AsyncIterable<string> {
    let text: string;
    try {
      const a = await askLaptop(question, flightKey(context.flight));
      text = a.text;
      useAnswerStats.getState().set({ mode: 'Laptop', via: 'tools', modelUsed: true, ttftMs: null, tokensPerSecond: null, tokens: 0, totalMs: a.ms, tools: a.tools, adapter: true });
    } catch {
      text = FAIL[context.language];
      useAnswerStats.getState().set({ mode: 'Laptop', via: 'error', modelUsed: false, ttftMs: null, tokensPerSecond: null, tokens: 0, totalMs: 0, tools: [], adapter: false });
    }
    // The gateway answers in one piece; show it word by word like a stream.
    for (const part of text.split(/(\s+)/)) {
      if (!part) continue;
      yield part;
      await sleep(12);
    }
  }
}
