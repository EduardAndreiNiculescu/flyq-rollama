import { create } from 'zustand';

// Animația de pornire: e vizibilă la lansare și poate fi reluată din secțiunea Demo a Profilului
interface SplashStore {
  visible: boolean;
  /** Crește la fiecare reluare, ca animația să pornească de la zero */
  runId: number;
  replay: () => void;
  hide: () => void;
}

export const useSplash = create<SplashStore>(set => ({
  visible: true,
  runId: 0,
  replay: () => set(s => ({ visible: true, runId: s.runId + 1 })),
  hide: () => set({ visible: false }),
}));
