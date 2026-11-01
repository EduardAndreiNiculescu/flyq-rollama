// Light, like the rest of the app (it was a dark navy theme): the Aegean palette from src/theme/tokens.ts
export const colors = {
  background: '#EAF6FF',
  panel: 'rgba(255, 255, 255, 0.95)',
  panelBorder: 'rgba(2, 132, 199, 0.18)',
  card: 'rgba(2, 132, 199, 0.07)',
  text: '#0F172A',
  textMuted: 'rgba(15, 23, 42, 0.62)',
  accent: '#0284C7',
  accentLight: '#0369A1',
  success: '#34D399',
  warning: '#F5A623',
  danger: '#FF5555',
  lost: '#8A94A6',
} as const;

/** Same colours as the native calibration markers (SpatialColors.pairColor). */
export const pairColors = [
  '#FF5555',
  '#34D399',
  '#FFC833',
  '#BA66FF',
  '#33CCFF',
  '#FF8000',
] as const;

export function pairColor(index: number): string {
  return pairColors[
    ((index % pairColors.length) + pairColors.length) % pairColors.length
  ];
}
