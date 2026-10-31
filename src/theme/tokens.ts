// Paleta „Aegean Horizon” (azur mediteranean + terracotta + sticlă de perlă). Tokenii „Liquid Glass & Sky” (Antigravity/airport-app-glass-sketches/DESIGN_SYSTEM_SPEC.md), doar temă luminoasă.
// Componentele citesc culorile doar de aici — nicio culoare scrisă direct în ecrane.

export const colors = {
  bg: '#EAF6FF',
  // Fundalul „Sky & Dawn”: cer sus, bandă de orizont lavandă și piersică, nori albi jos
  skyTop: '#BAE6FD',
  skyMid: '#E0F2FE',
  horizonLav: '#E6F1FB',
  horizonPeach: '#FED7AA',
  cloudWhite: '#F7FBFF',
  // Soarele care răsare la orizont
  sunCore: '#FFF3E0',
  sunGlow: '#FDBA74',
  // Aripa avionului din ilustrațiile cardurilor
  wingLight: '#F4FAFF',
  wingShade: '#A9C1D6',
  blob1: '#7DD3FC',
  blob2: '#FDBA74',
  // Fundalul „cer” din modul avion: aceleași roluri, pete mai saturate
  skyBg: '#D6EEFF',
  skyBlob1: '#38BDF8',
  skyBlob2: '#FB923C',

  text: '#0F172A',
  text2: '#334155',
  /** Doar pentru iconițe și chevron-uri; pentru text folosește textMuted */
  text3: '#94A3B8',
  /** Text estompat: etichete, ore, note mici. 4,58:1 pe sticla de deasupra cerului albastru (cel mai rău caz), 5,9:1 pe alb: trece WCAG AA */
  textMuted: '#56657D',

  accent: '#0284C7',
  accentText: '#0369A1',
  onAccent: '#FFFFFF',
  accentSoft: 'rgba(2,132,199,0.12)',
  accentLine: 'rgba(2,132,199,0.24)',
  // Gradientul „Arc” al butoanelor principale și al bulelor utilizatorului: albastru → indigo → violet
  accentIndigo: '#EA580C',
  accentViolet: '#FB923C',
  /** Azur deschis: mijlocul gradientului azur → cer → terracotta */
  accentMid: '#0EA5E9',
  /** Capătul cald al gradientului (portocaliu terracotta) */
  accentWarm: '#F97316',
  /** Text și iconițe pe suprafețele cu gradient albastru închis (bula utilizatorului, avatarul) */
  onGradient: '#FFFFFF',
  /** Fundalurile iconițelor colorate (pătrate rotunjite) din listele de acțiuni */
  indigoSoft: 'rgba(234,88,12,0.12)',
  violetSoft: 'rgba(251,146,60,0.16)',

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
  glassFrosted: 'rgba(240,249,255,0.58)',
  glassStrong: 'rgba(240,249,255,0.76)',
  /** Bara de tab-uri e opacă: pe Android, sticla translucidă lasă să se vadă conținutul derulat pe sub ea */
  glassBar: '#F8FCFF',
  /** Bara de scris a asistentului: sticlă cu tentă violet */
  inputTint: 'rgba(224,242,254,0.85)',
  glassSub: 'rgba(240,249,255,0.50)',
  glassSubBorder: 'rgba(255,255,255,0.82)',
  /** Sticlă aproape opacă, pentru banda care plutește peste conținutul derulat */
  glassSolid: 'rgba(247,252,255,0.97)',
  /** Umplutura butoanelor secundare (iOS „secondarySystemFill”): translucidă, fără contur de sticlă */
  fillSecondary: 'rgba(11,20,48,0.06)',
  // Contur specular: lumina vine de sus-stânga, deci marginile de jos-dreapta sunt mai slabe
  glassEdgeLit: 'rgba(255,255,255,0.95)',
  glassEdgeShade: 'rgba(255,255,255,0.40)',
  sheen: 'rgba(255,255,255,0.22)',
  surfaceOpaque: '#FFFFFF',
  opaqueBorder: '#C9DDEE',
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
  shadow: '#0B3A5C',
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
  mapDotLit: '#EA580C',
  mapLabelNight: '#1E293B',
  cityCore: '#F59E0B',
  cityGlow: '#FFC46B',
  accentGlow: '#38BDF8',
  // Animația de pornire și loader-ul
  splashTop: '#DFF1FF',
  splashMid: '#EEF8FF',
  scrim: 'rgba(11,20,48,0.18)',
  // Logo FlyQ (design/logo/02-avion): gradientul semnului și al literelor
  brandLight: '#6FA8FF',
  brandDeep: '#1B2F8F',
  brandInk: '#0B1430',
  brandSky: '#5B9BFF',
  brandPlane: '#3368FF',
  /** Umbre pentru boxShadow: doar pe elementele care plutesc (bara de tab-uri, sheet, comutator) */
  shadowFloat: 'rgba(3,105,161,0.16)',
  /** Umbra colorată a cardurilor de sticlă și a butoanelor cu gradient */
  shadowCard: 'rgba(2,132,199,0.12)',
  shadowHero: 'rgba(2,132,199,0.20)',
  shadowGlow: 'rgba(249,115,22,0.30)',
  shadowKnob: 'rgba(5,60,90,0.25)',
} as const;

/** Gradientul „Radar/CTA”: azur mediteranean → cer → terracotta */
export const ctaGradient = [colors.accent, colors.accentMid, colors.accentWarm] as const;

/** Suprafețe cu text alb (bula utilizatorului, avatarul asistentului, butonul de trimitere): doar partea albastră, închisă, ca albul să se citească (≥ 4:1) */
export const chatGradient = [colors.accent, colors.accentText] as const;

/** Gradientul barei de progres al zborului: azur închis → azur → terracotta */
export const progressGradient = [colors.accentText, colors.accent, colors.accentWarm] as const;

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
