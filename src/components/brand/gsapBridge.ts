import { useRef } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

// GSAP nu are DOM în React Native, așa că animăm un obiect simplu (proxy) cu valori numerice.
// La fiecare cadru, GSAP scrie proxy-ul într-o valoare partajată Reanimated, iar SVG-ul și
// View-urile citesc din ea pe firul UI (doar transform, opacity și strokeDashoffset).
export function useGsapState<T extends Record<string, number>>(initial: T): {
  proxy: T;
  state: SharedValue<T>;
  sync: () => void;
} {
  const proxyRef = useRef<T>({ ...initial });
  const state = useSharedValue<T>({ ...initial });
  // GSAP își pune pe obiectul animat o proprietate internă (`_gsap`); copiem doar cheile noastre
  // numerice, altfel Reanimated nu poate transfera obiectul pe firul UI
  const keysRef = useRef(Object.keys(initial) as (keyof T)[]);
  const syncRef = useRef(() => {
    const next = {} as T;
    for (const key of keysRef.current) next[key] = proxyRef.current[key];
    state.value = next;
  });
  return { proxy: proxyRef.current, state, sync: syncRef.current };
}

/** Starea logo-ului animat; toate valorile sunt numere, ca GSAP să le poată interpola. */
export interface LogoState extends Record<string, number> {
  /** 0 → 1: cât din rama lentilei e desenat */
  rim: number;
  /** 0 → 1: cât din coada lentilei („Q”) e desenat */
  tail: number;
  /** 0 → 1: reflexul care trece pe ramă */
  glint: number;
  planeX: number;
  planeY: number;
  planeRot: number;
  planeOpacity: number;
  /** 0 → 1: dâra de condensare din spatele avionului */
  trail: number;
  trailOpacity: number;
  /** 0 → 1: inelul de radar care pornește din ramă */
  pulse: number;
  /** grade: arcul care orbitează în jurul lentilei */
  orbit: number;
  orbitOpacity: number;
}

export const LOGO_AT_REST: LogoState = {
  rim: 1,
  tail: 1,
  glint: 0,
  planeX: 0,
  planeY: 0,
  planeRot: -20,
  planeOpacity: 1,
  trail: 0,
  trailOpacity: 0,
  pulse: 0,
  orbit: 0,
  orbitOpacity: 0,
};
