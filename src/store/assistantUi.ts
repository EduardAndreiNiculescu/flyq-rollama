import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from './storage';

// Starea ecranului Asistent: conversația (păstrată între sesiuni), progresul uneltelor, starea motorului și părerile utilizatorului.

export type ChatMessage = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  /** Uneltele chemate pentru acest răspuns, în ordine. */
  tools?: string[];
  reaction?: 'up' | 'down';
  /** Răspunsul a eșuat (motor oprit, model lipsă): se poate reîncerca. */
  failed?: boolean;
  /** Destinația hărții, dacă răspunsul a deschis harta. */
  destination?: string;
  /** Momentul răspunsului, pentru „actualizat acum”. */
  at?: string;
};

const KEEP = 40;

interface ChatState {
  messages: ChatMessage[];
  nextId: number;
  add: (m: Omit<ChatMessage, 'id'>) => number;
  patch: (id: number, p: Partial<ChatMessage>) => void;
  clear: () => void;
}

export const useChat = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      nextId: 1,
      add: m => {
        const id = get().nextId;
        set(s => ({ nextId: s.nextId + 1, messages: [...s.messages, { ...m, id }].slice(-KEEP) }));
        return id;
      },
      patch: (id, p) => set(s => ({ messages: s.messages.map(m => (m.id === id ? { ...m, ...p } : m)) })),
      clear: () => set({ messages: [] }),
    }),
    { name: 'assistant-chat', storage: zustandStorage, partialize: s => ({ messages: s.messages.filter(m => m.text), nextId: s.nextId }) },
  ),
);

/** Uneltele chemate în răspunsul care se scrie acum (pentru etapele de gândire). */
interface ProgressState {
  active: boolean;
  tools: { name: string; done: boolean }[];
  begin: () => void;
  tool: (name: string, phase: 'start' | 'done') => void;
  end: () => void;
}
export const useProgress = create<ProgressState>(set => ({
  active: false,
  tools: [],
  begin: () => set({ active: true, tools: [] }),
  tool: (name, phase) =>
    set(s => {
      if (phase === 'start') return { tools: [...s.tools, { name, done: false }] };
      const i = [...s.tools].reverse().findIndex(t => t.name === name && !t.done);
      if (i < 0) return s;
      const idx = s.tools.length - 1 - i;
      return { tools: s.tools.map((t, k) => (k === idx ? { ...t, done: true } : t)) };
    }),
  end: () => set({ active: false }),
}));

export type ModelPhase = 'ready' | 'preparing' | 'recovering' | 'missing' | 'failed';
export const useModelUi = create<{ phase: ModelPhase; set: (p: ModelPhase) => void }>(set => ({ phase: 'ready', set: phase => set({ phase }) }));

/** Păreri ale utilizatorului despre răspunsuri; rămân pe telefon și pot deveni cazuri de test. */
export type FeedbackItem = { question: string; answer: string; tools: string[]; verdict: 'up' | 'down' | 'wrong'; at: string };
export const useFeedback = create<{ items: FeedbackItem[]; add: (i: FeedbackItem) => void }>()(
  persist(set => ({ items: [], add: i => set(s => ({ items: [...s.items, i].slice(-200) })) }), { name: 'assistant-feedback', storage: zustandStorage }),
);

export const usePresentation = create<{ on: boolean; toggle: () => void }>(set => ({ on: false, toggle: () => set(s => ({ on: !s.on })) }));
