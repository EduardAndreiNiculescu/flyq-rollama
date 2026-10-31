// Tokenii „Liquid Glass & Sky” (Antigravity/airport-app-glass-sketches/DESIGN_SYSTEM_SPEC.md), doar temă luminoasă.
// Componentele citesc culorile doar de aici — nicio culoare scrisă direct în ecrane.

export const colors = {
  bg: '#EEF3FF',
  // Fundalul „Sky & Dawn”: cer sus, bandă de orizont lavandă și piersică, nori albi jos
  skyTop: '#AFC6FF',
  skyMid: '#C9D6FF',
  horizonLav: '#E4D9FF',
  horizonPeach: '#FFDCD2',
  cloudWhite: '#FFF3EE',
  // Soarele care răsare la orizont
  sunCore: '#FFF4E0',
  sunGlow: '#FFC9B0',
  // Aripa avionului din ilustrațiile cardurilor
  wingLight: '#F4F6FB',
  wingShade: '#A9B4CF',
  blob1: '#8DB6FF',
  blob2: '#C3B5FF',
  // Fundalul „cer” din modul avion: aceleași roluri, pete mai saturate
  skyBg: '#DDE8FF',
  skyBlob1: '#6E9BFF',
  skyBlob2: '#A592FF',

  text: '#0F172A',
  text2: '#334155',
  /** Doar pentru iconițe și chevron-uri; pentru text folosește textMuted */
  text3: '#94A3B8',
  /** Text estompat: etichete, ore, note mici. 4,58:1 pe sticla de deasupra cerului albastru (cel mai rău caz), 5,9:1 pe alb: trece WCAG AA */
  textMuted: '#56657D',

  accent: '#2E5BFF',
  accentText: '#2448D8',
  onAccent: '#FFFFFF',
  accentSoft: 'rgba(46,91,255,0.12)',
  accentLine: 'rgba(46,91,255,0.22)',
  // Gradientul „Arc” al butoanelor principale și al bulelor utilizatorului: albastru → indigo → violet
  accentIndigo: '#6366F1',
  accentViolet: '#8B5CF6',
  /** Fundalurile iconițelor colorate (pătrate rotunjite) din listele de acțiuni */
  indigoSoft: 'rgba(99,102,241,0.12)',
  violetSoft: 'rgba(139,92,246,0.12)',

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
  glassFrosted: 'rgba(255,255,255,0.50)',
  glassStrong: 'rgba(255,255,255,0.64)',
  /** Bara de tab-uri e opacă: pe Android, sticla translucidă lasă să se vadă conținutul derulat pe sub ea */
  glassBar: '#FBFCFF',
  /** Bara de scris a asistentului: sticlă cu tentă violet */
  inputTint: 'rgba(237,233,255,0.78)',
  glassSub: 'rgba(255,255,255,0.45)',
  glassSubBorder: 'rgba(255,255,255,0.70)',
  /** Sticlă aproape opacă, pentru banda care plutește peste conținutul derulat */
  glassSolid: 'rgba(255,255,255,0.96)',
  // Contur specular: lumina vine de sus-stânga, deci marginile de jos-dreapta sunt mai slabe
  glassEdgeLit: 'rgba(255,255,255,0.92)',
  glassEdgeShade: 'rgba(255,255,255,0.35)',
  sheen: 'rgba(255,255,255,0.22)',
  surfaceOpaque: '#FFFFFF',
  opaqueBorder: '#D3DCEE',
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
  shadow: '#1E3278',
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
  mapDotLit: '#2E5BFF',
  mapLabelNight: '#1E293B',
  cityCore: '#F59E0B',
  cityGlow: '#FFC46B',
  accentGlow: '#6FA8FF',
  // Animația de pornire și loader-ul
  splashTop: '#E8F0FE',
  splashMid: '#EEF2FF',
  scrim: 'rgba(11,20,48,0.18)',
  // Logo FlyQ (design/logo/02-avion): gradientul semnului și al literelor
  brandLight: '#6FA8FF',
  brandDeep: '#1B2F8F',
  brandInk: '#0B1430',
  brandSky: '#5B9BFF',
  brandPlane: '#3368FF',
  /** Umbre pentru boxShadow: doar pe elementele care plutesc (bara de tab-uri, sheet, comutator) */
  shadowFloat: 'rgba(27,47,143,0.15)',
  /** Umbra colorată a cardurilor de sticlă și a butoanelor cu gradient */
  shadowCard: 'rgba(46,91,255,0.10)',
  shadowHero: 'rgba(46,91,255,0.18)',
  shadowGlow: 'rgba(99,102,241,0.35)',
  shadowKnob: 'rgba(30,50,120,0.25)',
} as const;

/** Gradientul „Arc” (albastru → indigo → violet) al butoanelor principale */
export const ctaGradient = [colors.accent, colors.accentIndigo, colors.accentViolet] as const;

/** Gradientul barei de progres al zborului: bleumarin → albastru → cer */
export const progressGradient = [colors.brandDeep, colors.accent, colors.brandSky] as const;

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
