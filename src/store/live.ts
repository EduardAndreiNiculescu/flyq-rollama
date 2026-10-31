import { Platform } from 'react-native';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from './storage';

export type AssistantSource = 'mock' | 'laptop' | 'device' | 'deviceTools';
export type TrackerSource = 'mock' | 'live';
export type ModelTier = 'no-ai' | 'rollama';
/** Where flights and live positions come from: the FlyQ test gateway (laptop) or the team's FlyQ server. */
export type Backend = 'gateway' | 'flyq';

// Setările modului de test: de unde vin zborul, poziția și răspunsurile asistentului.
// Tokenul rămâne în clar în AsyncStorage: e doar pentru gateway-ul de test din rețeaua locală.
interface LiveState {
  baseUrl: string;
  token: string;
  assistantSource: AssistantSource;
  trackerSource: TrackerSource;
  modelTier: ModelTier;
  /** Let the laptop send commands to this app (see deviceLink.ts). */
  linkEnabled: boolean;
  backend: Backend;
  /** FlyQ app key and session token live only in this phone's storage (set from the laptop or typed); they are never in git or in logs. */
  flyqKey: string;
  flyqSession: { token: string; expiresAt: string } | null;
  recent: string[];
  setBaseUrl: (v: string) => void;
  setToken: (v: string) => void;
  setAssistantSource: (v: AssistantSource) => void;
  setTrackerSource: (v: TrackerSource) => void;
  setModelTier: (v: ModelTier) => void;
  setLinkEnabled: (v: boolean) => void;
  setBackend: (v: Backend) => void;
  setFlyqKey: (v: string) => void;
  setFlyqSession: (v: { token: string; expiresAt: string } | null) => void;
  pushRecent: (flightNumber: string) => void;
}

// 10.0.2.2 = laptopul, văzut din emulatorul Android. Pe iPhone se pune IP-ul laptopului din Wi-Fi.
const DEFAULT_URL = Platform.OS === 'android' ? 'http://10.0.2.2:18090' : 'http://localhost:18090';

export const useLive = create<LiveState>()(
  persist(
    set => ({
      baseUrl: DEFAULT_URL,
      token: '',
      // The real assistant (on-device RoLlama + tools) is the default. 'mock' (canned answers) is for the emulator without a model; it looks identical
      // in the chat and answers with fixed sentences, so it must never be what a normal install uses.
      assistantSource: 'deviceTools',
      trackerSource: 'mock',
      modelTier: 'rollama',
      linkEnabled: true,
      backend: 'flyq', // the team's FlyQ server; 'gateway' is the laptop test gateway (Mod test)
      flyqKey: '',
      flyqSession: null,
      recent: [],
      setBaseUrl: baseUrl => set({ baseUrl: baseUrl.trim().replace(/\/+$/, '') }),
      setToken: token => set({ token: token.trim() }),
      setAssistantSource: assistantSource => set({ assistantSource }),
      setTrackerSource: trackerSource => set({ trackerSource }),
      setModelTier: modelTier => set({ modelTier }),
      setLinkEnabled: linkEnabled => set({ linkEnabled }),
      setBackend: backend => set({ backend }),
      setFlyqKey: flyqKey => set({ flyqKey: flyqKey.trim(), flyqSession: null }),
      setFlyqSession: flyqSession => set({ flyqSession }),
      pushRecent: n => set(s => ({ recent: [n, ...s.recent.filter(x => x !== n)].slice(0, 6) })),
    }),
    {
      name: 'live',
      storage: zustandStorage,
      // v1: installs that had stored the old default ('mock') move to the real assistant. v2: the default flight source is the FlyQ server.
      version: 2,
      migrate: (stored, version) => {
        let s = stored as Partial<LiveState>;
        if (version < 1 && s.assistantSource === 'mock') s = { ...s, assistantSource: 'deviceTools' };
        if (version < 2 && s.backend === 'gateway') s = { ...s, backend: 'flyq' }; // v2: flights come from the FlyQ server by default
        return s as LiveState;
      },
    },
  ),
);
