import { useWindowDimensions } from 'react-native';
import { type } from './tokens';

// Breakpoint-urile din schițe, după lățime (pt/dp), nu după tipul de dispozitiv:
// funcționează la rotire, split-screen și pliabile.
export type SizeClass = 'compact' | 'regular' | 'medium' | 'expanded';

export function sizeClassFor(width: number): SizeClass {
  if (width < 360) return 'compact';
  if (width < 600) return 'regular';
  if (width < 840) return 'medium';
  return 'expanded';
}

// Pe ecrane mici totul se strânge puțin; pe tabletă cresc titlul și cifrele mari (DESIGN_SYSTEM_SPEC §3)
const compactScale: Partial<Record<keyof typeof type, number>> = {
  display: 42,
  countdown: 36,
  title: 22,
  headline: 16,
  body: 14,
};
const tabletScale: Partial<Record<keyof typeof type, number>> = { display: 56, countdown: 48, title: 28 };

export type TypeScale = {
  [K in keyof typeof type]: Omit<(typeof type)[K], 'fontSize'> & { fontSize: number };
};

export function typeFor(sizeClass: SizeClass): TypeScale {
  const overrides = sizeClass === 'compact' ? compactScale : sizeClass === 'regular' ? null : tabletScale;
  if (!overrides) return type;
  const keys = Object.keys(type) as (keyof typeof type)[];
  return Object.fromEntries(
    keys.map(key => [key, { ...type[key], fontSize: overrides[key] ?? type[key].fontSize }]),
  ) as TypeScale;
}

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const sizeClass = sizeClassFor(width);
  return {
    width,
    height,
    sizeClass,
    isLandscape: width > height,
    // Medium și Expanded folosesc două coloane; Expanded mută tab-urile într-un meniu lateral
    columns: sizeClass === 'medium' || sizeClass === 'expanded' ? 2 : 1,
    sideNav: sizeClass === 'expanded',
    type: typeFor(sizeClass),
  };
}
