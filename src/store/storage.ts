import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

// Expo SDK 58 pins async-storage 2.x (the original front-end used the 3.x `createAsyncStorage`).
// Same behaviour: one namespace for all app data; "Șterge datele locale" empties it.
const NS = 'airport-app:';

export const appStorage = {
  getItem: (k: string) => AsyncStorage.getItem(NS + k),
  setItem: (k: string, v: string) => AsyncStorage.setItem(NS + k, v),
  removeItem: (k: string) => AsyncStorage.removeItem(NS + k),
  async clear() {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(NS));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  },
};

export const zustandStorage = createJSONStorage(() => appStorage);
