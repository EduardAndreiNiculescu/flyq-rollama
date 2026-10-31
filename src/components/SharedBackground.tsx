import { createContext, useContext } from 'react';
import { create } from 'zustand';
import { GlassBackground } from './GlassBackground';

// Cerul „în zori” e desenat o singură dată, în spatele celor 5 tab-uri (nu câte unul pe ecran).
// Ecranele din tab-uri nu-și mai desenează fundalul și doar anunță ce variantă vor (default sau sky, în modul avion).
interface SkyState {
  variant: 'default' | 'sky';
  setVariant: (variant: 'default' | 'sky') => void;
}
export const useSharedSky = create<SkyState>(set => ({ variant: 'default', setVariant: variant => set({ variant }) }));

/** true cât timp ecranul e într-un navigator care are fundalul partajat */
export const SharedBackgroundContext = createContext(false);
export const useHasSharedBackground = () => useContext(SharedBackgroundContext);

export function SharedBackground() {
  const variant = useSharedSky(state => state.variant);
  return <GlassBackground variant={variant} />;
}
