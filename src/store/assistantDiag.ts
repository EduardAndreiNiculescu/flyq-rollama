import { create } from 'zustand';

/** The last few assistant turns, in plain text, for the "Diagnostic asistent" box in Mod test: what was asked, which path answered, which tool ran, what the model said, which documents were found. Not persisted. */
type State = { entries: string[]; push: (line: string) => void; clear: () => void };

export const useAssistantDiag = create<State>(set => ({
  entries: [],
  push: line => set(s => ({ entries: [line, ...s.entries].slice(0, 8) })),
  clear: () => set({ entries: [] }),
}));
