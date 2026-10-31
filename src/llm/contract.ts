import { buildSystemMessage } from '../core/prompt';
import type { PassengerContext } from '../core/types';
import { createTools, toolSpecs, type ToolSpec } from '../tools/registry';
import { TOOL_MODE_NOTE } from '../tools/toolMode';
import { modelToolSpecs, STATIC_SYSTEM_V4 } from './contractV4';

/** Which prompt the model sees. v3 = what the shipped v3 adapter was trained on; v4 = the static compact contract (src/llm/contractV4.ts). */
export type Contract = 'v3' | 'v4';
export const contractFromEnv = (v: string | undefined): Contract => (v === 'v4' ? 'v4' : 'v3');

/** The system message and the tool list for tool mode, under one contract. The gateway, the evaluations and the training data all go through this. */
export function toolPrompt(contract: Contract, o: { now: Date; context: PassengerContext }): { system: string; specs: ToolSpec[] } {
  if (contract === 'v4') return { system: STATIC_SYSTEM_V4, specs: modelToolSpecs() };
  return {
    system: `${buildSystemMessage({ flightFacts: null, documents: '(none provided: call a tool when you need facts)', now: o.now, context: o.context })}\n\n${TOOL_MODE_NOTE}`,
    specs: toolSpecs(createTools()),
  };
}
