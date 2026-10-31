# Integration contract (map / positioning team)

The AI module never imports map code. You pass context in and implement one handler.

```ts
import { FlightFlowAssistant, type NavigationHandler } from './src/core/assistant';
import type { PassengerContext } from './src/core/types';

const nav: NavigationHandler = {
  openAirportMap: ({ destination, fromZone }) => myMap.route(fromZone, destination), // you implement
};
const assistant = new FlightFlowAssistant(engine, { nav });

const result = await assistant.ask(
  'Unde este poarta?',
  { airportCode: 'CRA', journeyStage: 'airside', currentZone: 'T1-B', positionConfidence: 0.8, connectionAvailable: false },
  (partial) => render(partial),   // streams the accumulated text
);
// result: { text, intent, navigation, usedDocIds, missingInfo, stats }
```

- `PassengerContext` is defined in `src/core/types.ts` exactly as specified.
- Navigation intents are produced by deterministic routing + `parseIntent` validation (allow-listed args, max 64 chars, unsafe characters rejected). The LLM never executes anything.
- `missingInfo` lists what the assistant lacked (e.g. `destination`, `flight`); the model is told in-prompt to say so.
- Mock: `App.tsx` uses a console-logging nav handler and a hard-coded context – **mock only**, replace both.
- Inference works with `connectionAvailable: false`; nothing in `src/` performs network calls except one-time model download in `modelProvision.ts`.
