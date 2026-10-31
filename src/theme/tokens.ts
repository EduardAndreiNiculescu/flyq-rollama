// Paleta „Sunset 10.000 m” (amber + indigo de amurg). Tokenii „Liquid Glass & Sky” (Antigravity/airport-app-glass-sketches/DESIGN_SYSTEM_SPEC.md), doar temă luminoasă.
// Componentele citesc culorile doar de aici — nicio culoare scrisă direct în ecrane.

export const colors = {
  bg: '#FFF3EA',
  // Fundalul „Sky & Dawn”: cer sus, bandă de orizont lavandă și piersică, nori albi jos
  skyTop: '#FFE8D6',
  skyMid: '#FFD4BC',
  horizonLav: '#E8D5FF',
  horizonPeach: '#FFD9C2',
  cloudWhite: '#FFF8F2',
  // Soarele care răsare la orizont
  sunCore: '#FFF1DC',
  sunGlow: '#FFB27A',
  // Aripa avionului din ilustrațiile cardurilor
  wingLight: '#FFF6EE',
  wingShade: '#C9B2B0',
  blob1: '#FFB88A',
  blob2: '#C9B8FF',
  // Fundalul „cer” din modul avion: aceleași roluri, pete mai saturate
  skyBg: '#FFE3D0',
  skyBlob1: '#FF9E57',
  skyBlob2: '#8F86FF',

  text: '#0F172A',
  text2: '#334155',
  /** Doar pentru iconițe și chevron-uri; pentru text folosește textMuted */
  text3: '#94A3B8',
  /** Text estompat: etichete, ore, note mici. 4,58:1 pe sticla de deasupra cerului albastru (cel mai rău caz), 5,9:1 pe alb: trece WCAG AA */
  textMuted: '#56657D',

  accent: '#FF7A00',
  accentText: '#D95B00',
  onAccent: '#2B1200',
  accentSoft: 'rgba(255,122,0,0.12)',
  accentLine: 'rgba(255,122,0,0.24)',
  // Gradientul „Arc” al butoanelor principale și al bulelor utilizatorului: albastru → indigo → violet
  accentIndigo: '#4F46E5',
  accentViolet: '#818CF8',
  /** Rubin: mijlocul gradientului amber → rubin → indigo */
  accentRuby: '#E11D48',
  /** Text și iconițe pe gradientul rubin → indigo (alb pe amber ar avea doar 2,6:1) */
  onGradient: '#FFFFFF',
  /** Fundalurile iconițelor colorate (pătrate rotunjite) din listele de acțiuni */
  indigoSoft: 'rgba(79,70,229,0.12)',
  violetSoft: 'rgba(129,140,248,0.16)',

  success: '#0E9F6E',
  successSoft: '#DDF5EC',
  successGlow: 'rgba(16,185,129,0.30)',
  /** Punctul verde „activ” de pe avatarul asistentului */
  successDot: '#10B981',
  /** Verde pentru text pe fundal moale (4.67:1) */
  successText: '#0A7A55',
  warning: '#B86A00',
  warningSoft: '#FFF1DC',
  /** Portocaliu pentru text pe fundal moale (4.82:1) */
  warningText: '#9E5A00',
  danger: '#D93636',
  dangerSoft: '#FDE3E3',
  dangerLine: 'rgba(220,38,38,0.22)',

  // Sticlă translucidă: norii și culorile cerului se văd prin carduri (textul e închis, deci rămâne lizibil)
  glassFrosted: 'rgba(255,248,242,0.60)',
  glassStrong: 'rgba(255,248,242,0.76)',
  /** Bara de tab-uri e opacă: pe Android, sticla translucidă lasă să se vadă conținutul derulat pe sub ea */
  glassBar: '#FFFBF7',
  /** Bara de scris a asistentului: sticlă cu tentă violet */
  inputTint: 'rgba(255,236,224,0.82)',
  glassSub: 'rgba(255,248,242,0.52)',
  glassSubBorder: 'rgba(255,238,221,0.78)',
  /** Sticlă aproape opacă, pentru banda care plutește peste conținutul derulat */
  glassSolid: 'rgba(255,251,247,0.97)',
  /** Umplutura butoanelor secundare (iOS „secondarySystemFill”): translucidă, fără contur de sticlă */
  fillSecondary: 'rgba(11,20,48,0.06)',
  // Contur specular: lumina vine de sus-stânga, deci marginile de jos-dreapta sunt mai slabe
  glassEdgeLit: 'rgba(255,238,221,0.90)',
  glassEdgeShade: 'rgba(255,238,221,0.35)',
  sheen: 'rgba(255,255,255,0.22)',
  surfaceOpaque: '#FFFFFF',
  opaqueBorder: '#F0DCCB',
  overlay: 'rgba(11,20,48,0.86)',
  debugText: '#B9F6CA',
  white: '#FFFFFF',
  camera: '#0B0C10',
  cameraTorch: '#2A2E3A',
  cameraGlow: '#7FA3FF',
  paper: '#ECE9E0',
  paperInk: '#B9B5A9',
  barcodeInk: '#111111',
  glassOnDark: 'rgba(255,255,255,0.16)',
  glassOnDarkBorder: 'rgba(255,255,255,0.25)',
  flash: 'rgba(255,255,255,0.18)',
  tilePlain: 'rgba(255,255,255,0.75)',
  trackOff: 'rgba(11,20,48,0.14)',
  progressTrack: 'rgba(11,20,48,0.10)',
  warningGlass: 'rgba(255,241,220,0.9)',
  dangerGlass: 'rgba(253,227,227,0.86)',

  line: 'rgba(15,23,42,0.08)',
  /** Separatoare verticale între coloanele de cifre */
  lineVertical: 'rgba(15,23,42,0.08)',
  shadow: '#7A3A12',
  // Globul din ecranul Zbor (harta reală, în WebView): uscat alb, apă albastră, relief lavandă, cer de zori
  globeLand: '#FAFBFF',
  globeWater: '#9DBDF5',
  globeBorder: '#9DB3E6',
  globeText: '#27315A',
  globeWaterText: '#5E79C8',
  globeHalo: 'rgba(255,255,255,0.92)',
  globeRelief: '#6B7FE8',
  globeReliefAccent: '#A78BFA',
  globeSky: '#9DBDFF',
  globeSky2: '#BBCBFF',
  globeHorizon: '#E3DDFB',
  globeFog: '#FFE3D8',
  // Harta desenată (rezervă când globul nu poate porni): uscat deschis, mări albastre, munți violet
  mapLand: '#F6F8FD',
  mapSea: '#9DBEF5',
  mapCoast: '#6F98E6',
  mapMountain: '#6B52D9',
  mapMountainFill: 'rgba(107,82,217,0.16)',
  mapDot: 'rgba(112,140,214,0.42)',
  mapDotLit: '#FF7A00',
  mapLabelNight: '#1E293B',
  cityCore: '#F59E0B',
  cityGlow: '#FFC46B',
  accentGlow: '#818CF8',
  // Animația de pornire și loader-ul
  splashTop: '#FFEBDD',
  splashMid: '#FFF1E8',
  scrim: 'rgba(11,20,48,0.18)',
  // Logo FlyQ (design/logo/02-avion): gradientul semnului și al literelor
  brandLight: '#6FA8FF',
  brandDeep: '#1B2F8F',
  brandInk: '#0B1430',
  brandSky: '#5B9BFF',
  brandPlane: '#3368FF',
  /** Umbre pentru boxShadow: doar pe elementele care plutesc (bara de tab-uri, sheet, comutator) */
  shadowFloat: 'rgba(122,58,18,0.16)',
  /** Umbra colorată a cardurilor de sticlă și a butoanelor cu gradient */
  shadowCard: 'rgba(255,122,0,0.12)',
  shadowHero: 'rgba(217,91,0,0.20)',
  shadowGlow: 'rgba(225,29,72,0.30)',
  shadowKnob: 'rgba(90,40,0,0.25)',
} as const;

/** Gradientul „Radar/CTA”: amber → rubin → indigo (apus deasupra Alpilor) */
export const ctaGradient = [colors.accent, colors.accentRuby, colors.accentIndigo] as const;

/** Suprafețe cu text alb (bula utilizatorului, avatarul asistentului, butonul de trimitere): doar partea rece, ca albul să se citească */
export const chatGradient = [colors.accentRuby, colors.accentIndigo] as const;

/** Gradientul barei de progres al zborului: indigo → rubin → amber */
export const progressGradient = [colors.accentIndigo, colors.accentRuby, colors.accent] as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radii = { sm: 10, md: 14, lg: 20, xl: 28, hero: 32, pill: 999 } as const;

// Scara de tipografie: 7 trepte; 400 pentru text, 700 pentru titluri, 800 doar pentru cifrele mari. Valorile sunt pentru telefon
// (Regular); `typeFor()` le micșorează pe Compact și mărește titlul pe tabletă.
export const type = {
  display: { fontSize: 52, fontWeight: '800', letterSpacing: -1.8 },
  countdown: { fontSize: 44, fontWeight: '800', letterSpacing: -1.4 },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.6 },
  headline: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  body: { fontSize: 15, fontWeight: '400' },
  caption: { fontSize: 13, fontWeight: '400' },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
} as const;

export const touchTarget = 48;

// Mișcare: același „spring” la apăsare peste tot (strâns la apăsare, elastic la eliberare)
export const motion = {
  pressIn: { damping: 20, stiffness: 520, mass: 0.6 },
  pressOut: { damping: 14, stiffness: 320, mass: 0.6 },
} as const;

/** Lățimile maxime ale conținutului pe tablete: coloană îngustă (formulare, bilet) și lată (zbor, chat) */
export const layout = { columnNarrow: 560, columnWide: 760 } as const;

export type Colors = typeof colors;
