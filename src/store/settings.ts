import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Language } from '../i18n';
import { zustandStorage } from './storage';

interface SettingsState {
  language: Language;
  /** Înlocuiește sticla cu suprafețe opace (accesibilitate, telefoane lente) */
  reduceTransparency: boolean;
  /** Pentru accesibilitate: rutele de pe hartă folosesc liftul în locul scărilor */
  avoidStairs: boolean;
  landingLocalTime: boolean;
  landingAirplaneReminder: boolean;
  /** Local reminders for boarding and gate closing (scheduled on the phone, no server needed) */
  flightReminders: boolean;
  setLanguage: (language: Language) => void;
  setReduceTransparency: (value: boolean) => void;
  setAvoidStairs: (value: boolean) => void;
  setLandingLocalTime: (value: boolean) => void;
  setLandingAirplaneReminder: (value: boolean) => void;
  setFlightReminders: (value: boolean) => void;
  reset: () => void;
}

const defaults = {
  language: 'ro' as Language,
  reduceTransparency: false,
  avoidStairs: false,
  landingLocalTime: true,
  landingAirplaneReminder: true,
  flightReminders: true,
};

export const useSettings = create<SettingsState>()(
  persist(
    set => ({
      ...defaults,
      setLanguage: language => set({ language }),
      setReduceTransparency: reduceTransparency => set({ reduceTransparency }),
      setAvoidStairs: avoidStairs => set({ avoidStairs }),
      setLandingLocalTime: landingLocalTime => set({ landingLocalTime }),
      setLandingAirplaneReminder: landingAirplaneReminder => set({ landingAirplaneReminder }),
      setFlightReminders: flightReminders => set({ flightReminders }),
      reset: () => set(defaults),
    }),
    { name: 'settings', storage: zustandStorage },
  ),
);
