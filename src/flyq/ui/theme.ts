export const colors = {
  background: '#0B1430',
  panel: 'rgba(11, 20, 48, 0.94)',
  panelBorder: 'rgba(141, 182, 255, 0.18)',
  card: 'rgba(255, 255, 255, 0.06)',
  text: '#FFFFFF',
  textMuted: 'rgba(255, 255, 255, 0.68)',
  accent: '#2E5BFF',
  accentLight: '#8DB6FF',
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
