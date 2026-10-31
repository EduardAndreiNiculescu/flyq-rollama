import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { bearingDeg, interpolateGreatCircle, projectSchematic, type LatLon } from '../lib/geo';
import { colors, radii } from '../theme/tokens';
import type { Airport, FlightPosition, Landmark } from '../types';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Fereastra hărții: din Marea Nordului până în Grecia, cât să încapă ruta cu aer în jur.
// Proporțiile ferestrei se potrivesc cu W×H, ca harta să umple tot cardul (fără benzi goale).
const BOUNDS = { minLat: 37.8, maxLat: 58.2, minLon: -2.4, maxLon: 26.4 };
const W = 340;
const H = 360;
const SAMPLES = 64;
// Distanța dintre puncte (în unitățile hărții) și cât de lată e „culoarul” luminat din jurul rutei
const DOT_STEP = 5.4;
const CORRIDOR = 20;

// Contururi simplificate (lon, lat): mările și insulele. Uscatul e tot ce nu e mare (sau e insulă).
type Ring = [number, number][];
const SEAS: Ring[] = [
  // Atlanticul, Canalul Mânecii, Marea Nordului, Skagerrak, Kattegat și Marea Baltică
  [
    [-2.4, 58.2], [5.6, 58.2], [6.6, 58], [7.5, 58], [8.5, 58.2], [11.3, 58.2], [11.8, 57.6], [12, 57], [12.5, 56.3], [12.9, 55.6], [13, 55.4],
    [14.2, 55.4], [14.7, 56.1], [16, 56.2], [16.5, 57], [16.7, 57.8], [16.6, 58.2], [21.9, 58.2], [21.9, 57.6], [21.6, 57.3], [21, 56.8], [21.1, 56],
    [21.1, 55.3], [20, 54.9], [19.5, 54.4], [18.5, 54.7], [17.5, 54.8], [16.5, 54.5], [15.5, 54.2], [14.2, 53.95], [13.8, 54.1], [13, 54.4], [12.1, 54.2],
    [11.5, 54], [10.9, 54], [10, 54.5], [9.9, 54.8], [9.5, 55], [9.8, 55.7], [10.2, 56.1], [10.3, 56.6], [10.5, 57], [10.6, 57.7], [9.6, 57.4],
    [8.6, 57.1], [8.2, 57.1], [8.1, 56.5], [8.1, 55.6], [8.6, 55], [8.6, 54.5], [8.9, 54], [8.1, 53.6], [7, 53.5], [6, 53.4], [5, 53.2], [4.7, 52.9],
    [4.5, 52.4], [4.1, 51.9], [3.6, 51.4], [3, 51.2], [2.5, 51.05], [1.6, 50.4], [1.5, 50.1], [0.2, 49.7], [-1.2, 49.4], [-1.9, 49.7], [-1.9, 48.7],
    [-2.4, 48.65],
  ],
  // Golful Biscaya
  [[-2.4, 47.4], [-2.2, 47.2], [-2, 46.8], [-1.2, 46.2], [-1.1, 45.5], [-1.2, 44.6], [-1.5, 43.5], [-1.8, 43.4], [-2.4, 43.35]],
  // Marea Mediterană de vest, Ligurică și Tireniană
  [
    [-0.8, 37.8], [-0.5, 38.3], [-0.2, 39], [-0.3, 39.6], [0.2, 40], [0.9, 41], [2.2, 41.4], [3.1, 41.9], [3.2, 42.4], [3, 42.8], [3.3, 43.2], [4, 43.5],
    [4.8, 43.4], [5.4, 43.2], [6.2, 43.1], [7.2, 43.65], [8, 43.9], [8.8, 44.4], [9.5, 44.1], [10.1, 43.9], [10.3, 43.5], [10.5, 42.9], [11.1, 42.4],
    [11.8, 42.1], [12.4, 41.7], [13, 41.25], [13.7, 41.2], [14, 40.8], [14.5, 40.6], [15, 40.2], [15.6, 40], [15.8, 39.4], [16.1, 38.9], [15.7, 38.5],
    [15.6, 38.2], [15, 38.1], [13.4, 38.2], [12.4, 38], [12.2, 37.8],
  ],
  // Marea Adriatică
  [
    [12.3, 45.4], [13, 45.7], [13.6, 45.6], [13.6, 45.2], [14.3, 45.3], [14.9, 44.9], [15.5, 44.2], [16.4, 43.5], [17.6, 43], [18.5, 42.45], [19.4, 41.9],
    [19.5, 41], [19.3, 40.4], [18.5, 40], [18, 40.6], [17, 41.1], [16.1, 41.9], [15.3, 41.9], [14.7, 42.1], [14, 42.6], [13.6, 43.3], [13, 43.8], [12.4, 44.2],
    [12.3, 44.8],
  ],
  // Marea Ionică și Golful Taranto
  [
    [15.3, 37.8], [15.6, 38], [16, 38], [16.6, 38.4], [16.6, 38.9], [17.1, 39], [17.1, 39.4], [16.5, 39.7], [16.6, 40.1], [17.2, 40.4], [18, 40.3], [18.5, 40],
    [19.3, 40.4], [20, 39.7], [20.3, 39.3], [20.7, 38.9], [21.1, 38.5], [21.3, 38.3], [21.4, 37.8],
  ],
  // Marea Egee
  [[24, 37.8], [24, 38.2], [23.5, 38.5], [23.3, 39], [22.9, 39.4], [22.6, 40], [22.8, 40.5], [23.6, 40.6], [24.3, 40.8], [25, 40.95], [26, 40.8], [26.2, 40.3], [26.2, 39.6], [26.4, 39.4], [26.4, 37.8]],
];
const ISLANDS: Ring[] = [
  // Marea Britanie (partea din fereastră)
  [
    [-2.4, 57.7], [-1.8, 57.5], [-2.1, 57.1], [-2.5, 56.6], [-2.6, 56.2], [-2.1, 55.9], [-1.6, 55.6], [-1.3, 54.9], [-0.5, 54.5], [0, 54.1], [-0.2, 53.7],
    [0.1, 53.5], [0.3, 53.1], [0.9, 52.95], [1.7, 52.7], [1.75, 52.3], [1.5, 51.95], [0.9, 51.8], [0.6, 51.5], [1.4, 51.35], [1.1, 51.1], [0.3, 50.75],
    [-0.8, 50.75], [-1.3, 50.8], [-2, 50.6], [-2.4, 50.6],
  ],
  // Corsica și Sardinia
  [[9.4, 43], [9.6, 42.6], [9.5, 41.9], [9.2, 41.4], [8.8, 41.6], [8.6, 42], [8.6, 42.5], [9, 42.7]],
  [[9.6, 41.2], [9.8, 40.6], [9.6, 39.9], [9.6, 39.2], [9, 38.9], [8.4, 39], [8.4, 39.9], [8.2, 40.6], [8.6, 41], [9.2, 41.25]],
  // Mallorca
  [[2.4, 39.6], [3.2, 39.95], [3.5, 39.7], [3.1, 39.3], [2.6, 39.5]],
  // Insulele daneze (Zeelanda, Fionia) și cele suedeze (Gotland, Öland)
  [[11, 55.9], [12.6, 56], [12.4, 55.3], [11.8, 55.1], [11.1, 55.3]],
  [[9.8, 55.5], [10.8, 55.5], [10.6, 55], [10, 55.1]],
  [[18.1, 57.3], [18.7, 57.9], [19, 57.8], [18.8, 57.2], [18.2, 56.9]],
  [[16.4, 56.2], [16.7, 57.2], [17, 57.2], [16.6, 56.2]],
];

// Lanțurile muntoase (lon, lat), desenate cu violet ca să iasă în evidență pe uscat
const MOUNTAINS: Ring[] = [
  // Alpii
  [[6.2, 45], [7.2, 44.2], [8.6, 44.2], [9.5, 45.4], [10.8, 45.9], [12.4, 46.2], [13.8, 46.4], [15.2, 47], [14, 47.6], [12.2, 47.7], [10.5, 47.4], [9.2, 47.1], [7.8, 46.5], [6.6, 46.2], [5.9, 45.6]],
  // Pirineii
  [[-2.4, 43.25], [-1, 43.15], [0.5, 42.95], [1.8, 42.65], [3.2, 42.45], [3.2, 42.2], [1.8, 42.3], [0.5, 42.5], [-1, 42.7], [-2.4, 42.9]],
  // Carpații
  [[18.5, 49.6], [20.5, 49.5], [22.8, 49], [24.8, 48.4], [26.4, 47.9], [26.4, 46], [25.6, 45.4], [24.8, 45.5], [23.6, 45.5], [22.5, 45.3], [21.8, 45.2], [22.6, 45.8], [23.6, 46], [24.8, 46.4], [25.6, 46.8], [25.4, 47.5], [24.4, 47.9], [22.8, 48.3], [20.6, 48.7], [19, 48.8]],
  // Alpii Dinarici
  [[13.8, 45.6], [15, 45], [16.5, 44], [18, 43.2], [19.5, 42.6], [20.5, 42.4], [20.8, 43.2], [19.6, 44], [18.4, 44.6], [16.8, 45.2], [15.2, 45.7]],
  // Munții Balcani și Rila
  [[22.5, 43.2], [24, 43.1], [26.4, 43.1], [26.4, 42.6], [24, 42.6], [22.5, 42.7]],
  // Apeninii
  [[9.5, 44.5], [11, 44.2], [12.5, 43.3], [13.8, 42.3], [15, 41.4], [15.8, 40.2], [16, 39.4], [15.4, 39.4], [14.8, 40.6], [13.4, 41.8], [12, 42.8], [10.6, 43.9], [9.4, 44.3]],
];

type Pt = { x: number; y: number };
const project = (ll: LatLon) => projectSchematic(ll, BOUNDS, W, H);
const projectRing = (ring: Ring): Pt[] => ring.map(([lon, lat]) => project({ lat, lon }));
const SEA_PX = SEAS.map(projectRing);
const ISLAND_PX = ISLANDS.map(projectRing);
const MOUNTAIN_PX = MOUNTAINS.map(projectRing);
const ringD = (polys: Pt[][]) => polys.map(poly => poly.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join('') + 'Z').join('');
const SEA_D = ringD(SEA_PX);
const ISLAND_D = ringD(ISLAND_PX);
const MOUNTAIN_D = ringD(MOUNTAIN_PX);

function inside(pt: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

// Punctele de uscat, calculate o singură dată: o grilă decalată pe rânduri (ca un fagure)
let landDots: { land: Pt[]; mountain: Pt[] } | null = null;
function getLandDots() {
  if (landDots) return landDots;
  const land: Pt[] = [];
  const mountain: Pt[] = [];
  for (let row = 0, y = DOT_STEP / 2; y < H; row++, y += DOT_STEP) {
    for (let x = row % 2 ? DOT_STEP : DOT_STEP / 2; x < W; x += DOT_STEP) {
      const pt = { x, y };
      const sea = SEA_PX.some(poly => inside(pt, poly)) && !ISLAND_PX.some(poly => inside(pt, poly));
      if (sea) continue;
      land.push(pt); // relief is not drawn: the purple mountain dots made the map hard to read
    }
  }
  landDots = { land, mountain };
  return landDots;
}

// Toate punctele într-un singur Path (mii de cercuri separate ar fi prea grele pentru SVG)
function dotsPath(dots: Pt[], r: number): string {
  return dots.map(d => `M${(d.x - r).toFixed(1)} ${d.y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`).join('');
}

function distToPolyline(pt: Pt, line: Pt[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy)));
  }
  return best;
}

interface Props {
  from: Airport;
  to: Airport;
  landmarks: Landmark[];
  position: FlightPosition | null;
  accessibilityLabel: string;
  estimateLabel: string;
}

// Harta de zbor luminoasă: Europa din puncte albastre, un culoar mai intens de-a lungul rutei,
// orașele ca puncte calde, ruta parcursă cu gradient și avionul cu puls de radar.
export const FlightRouteMap = memo(function FlightRouteMap({ from, to, landmarks, position, accessibilityLabel, estimateLabel }: Props) {
  const reduceMotion = useReducedMotion();

  // Ruta pe arc de cerc mare, eșantionată ca o curbă netedă
  const route = useMemo(() => Array.from({ length: SAMPLES + 1 }, (_, i) => interpolateGreatCircle(from, to, i / SAMPLES)), [from, to]);
  const routePx = useMemo(() => route.map(project), [route]);
  const { baseD, litD } = useMemo(() => {
    const base: Pt[] = [];
    const lit: Pt[] = [];
    const { land } = getLandDots();
    for (const d of land) (distToPolyline(d, routePx) < CORRIDOR ? lit : base).push(d);
    return { baseD: dotsPath(base, 1.15), litD: dotsPath(lit, 1.5) };
  }, [routePx]);

  const progress = position?.progress ?? 0;
  const split = Math.max(1, Math.round(progress * SAMPLES));
  const here = position ? { lat: position.lat, lon: position.lon } : { lat: from.lat, lon: from.lon };
  const ahead = interpolateGreatCircle(from, to, Math.min(1, progress + 0.02));
  const rotation = bearingDeg(here, ahead) - 90; // în SVG, 0° = spre dreapta
  const hp = project(here);
  const estimate = position?.source === 'estimate';
  const toD = (arr: LatLon[]) => arr.map((ll, i) => {
    const q = project(ll);
    return `${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
  }).join(' ');
  const flownD = position ? toD(route.slice(0, split + 1).concat([here])) : '';
  const remainingD = toD(position ? [here, ...route.slice(split)] : route);

  // Linia rămasă „curge” spre destinație; avionul are un puls de radar
  const dash = useSharedValue(0);
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    dash.value = withRepeat(withTiming(-18, { duration: 1400, easing: Easing.linear }), -1, false);
    pulse.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
  }, [dash, pulse, reduceMotion]);
  const dashProps = useAnimatedProps(() => ({ strokeDashoffset: dash.value }));
  const pulseProps = useAnimatedProps(() => ({ r: 9 + pulse.value * 16, opacity: 0.5 * (1 - pulse.value) }));

  // Etichetele orașelor stau de partea opusă rutei, ca linia să nu le taie
  const labels = landmarks.filter(l => l.kind === 'city').map(l => {
    const pin = project(l);
    let nearest = routePx[0]!;
    let best = Infinity;
    for (const q of routePx) {
      const d = Math.hypot(q.x - pin.x, q.y - pin.y);
      if (d < best) {
        best = d;
        nearest = q;
      }
    }
    return { l, pin, above: pin.y < nearest.y };
  });

  return (
    <View style={styles.card} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View style={styles.aspect}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
          <Defs>
            <RadialGradient id="corridorGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={colors.accent} stopOpacity={0.35} />
              <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="cityLight" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={colors.cityGlow} stopOpacity={0.9} />
              <Stop offset="0.3" stopColor={colors.cityGlow} stopOpacity={0.4} />
              <Stop offset="1" stopColor={colors.cityGlow} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="airportLight" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={colors.accent} stopOpacity={0.9} />
              <Stop offset="0.3" stopColor={colors.accentGlow} stopOpacity={0.5} />
              <Stop offset="1" stopColor={colors.accentGlow} stopOpacity={0} />
            </RadialGradient>
            <LinearGradient id="flown" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.accentWarm} />
              <Stop offset="1" stopColor={colors.accentIndigo} />
            </LinearGradient>
          </Defs>

          {/* Uscatul deschis, mările albastre și punctele de pe uscat (fără relief) */}
          <Rect width={W} height={H} fill={colors.mapLand} />
          <Path d={SEA_D} fill={colors.mapSea} stroke={colors.mapCoast} strokeWidth={0.8} />
          <Path d={ISLAND_D} fill={colors.mapLand} stroke={colors.mapCoast} strokeWidth={0.8} />
          <Path d={baseD} fill={colors.mapDot} />
          <Path d={litD} fill={colors.mapDotLit} />

          {/* Luminile orașelor de pe traseu; munții au doar eticheta */}
          {labels.map(({ l, pin, above }) => (
            <G key={l.id}>
              {l.kind === 'city' ? (
                <>
                  <Circle cx={pin.x} cy={pin.y} r={13} fill="url(#cityLight)" />
                  <Circle cx={pin.x} cy={pin.y} r={1.8} fill={colors.cityCore} />
                </>
              ) : (
                <Path d={`M${pin.x - 4} ${pin.y + 3}L${pin.x} ${pin.y - 4}L${pin.x + 4} ${pin.y + 3}Z`} fill={colors.mapMountain} />
              )}
              <SvgText
                x={pin.x}
                y={above ? pin.y - 9 : pin.y + 16}
                fontSize={10}
                fontWeight="800"
                letterSpacing={0.8}
                fill={colors.mapLabelNight}
                fillOpacity={0.95}
                textAnchor="middle"
              >
                {l.name.toUpperCase()}
              </SvgText>
            </G>
          ))}

          {/* Ruta: rămasă (punctată, animată) și parcursă (gradient violet → albastru, cu strălucire) */}
          <AnimatedPath d={remainingD} fill="none" stroke={colors.mapDotLit} strokeOpacity={0.95} strokeWidth={2.4} strokeDasharray="5 5" strokeLinecap="round" animatedProps={dashProps} />
          {position ? (
            <G opacity={estimate ? 0.55 : 1}>
              <Path d={flownD} fill="none" stroke={colors.accentGlow} strokeOpacity={0.3} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
              <Path d={flownD} fill="none" stroke="url(#flown)" strokeWidth={4.2} strokeLinecap="round" strokeLinejoin="round" />
            </G>
          ) : null}

          {/* Aeroporturile: lumini albe-albastre și codul, cu orașul dedesubt */}
          {[from, to].map(a => {
            const q = project(a);
            const below = a === from;
            // Lângă margini, textul se aliniază spre interior, ca să nu fie tăiat
            const anchor = q.x < 60 ? 'start' : q.x > W - 60 ? 'end' : 'middle';
            const tx = anchor === 'start' ? Math.max(6, q.x - 14) : anchor === 'end' ? Math.min(W - 6, q.x + 14) : q.x;
            return (
              <G key={a.code}>
                <Circle cx={q.x} cy={q.y} r={18} fill="url(#airportLight)" />
                <Circle cx={q.x} cy={q.y} r={4} fill={colors.accent} stroke={colors.white} strokeWidth={1.4} />
                <SvgText x={tx} y={below ? q.y + 22 : q.y - 14} fontSize={13} fontWeight="900" letterSpacing={1.2} fill={colors.text} textAnchor={anchor}>
                  {a.code}
                </SvgText>
                <SvgText x={tx} y={below ? q.y + 33 : q.y - 26} fontSize={9} fontWeight="800" letterSpacing={0.8} fill={colors.accentText} textAnchor={anchor}>
                  {a.city.toUpperCase()}
                </SvgText>
              </G>
            );
          })}

          {/* Avionul: zonă estimată fără GPS, puls de radar cu GPS */}
          {estimate ? (
            <G>
              <Ellipse cx={hp.x} cy={hp.y} rx={34} ry={20} fill={colors.warning} fillOpacity={0.16} stroke={colors.cityGlow} strokeDasharray="4 4" />
              {/* Deasupra zonei, ca să nu se suprapună cu eticheta aeroportului de plecare */}
              <SvgText
                x={Math.min(W - 8, Math.max(8, hp.x))}
                y={hp.y - 26}
                fontSize={8.5}
                fontWeight="700"
                letterSpacing={0.8}
                fill={colors.warningText}
                textAnchor={hp.x > W - 50 ? 'end' : hp.x < 50 ? 'start' : 'middle'}
              >
                {estimateLabel.toUpperCase()}
              </SvgText>
            </G>
          ) : position ? (
            <G>
              <Circle cx={hp.x} cy={hp.y} r={22} fill="url(#corridorGlow)" />
              <AnimatedCircle cx={hp.x} cy={hp.y} fill="none" stroke={colors.accentGlow} strokeWidth={1.4} animatedProps={pulseProps} />
            </G>
          ) : null}
          <G transform={`translate(${hp.x} ${hp.y}) rotate(${rotation}) scale(1.4)`} opacity={estimate ? 0.7 : 1}>
            <Path d="M11 0 4-2-1-10h-3l2 8h-8l-2-3h-2l1 5-1 5h2l2-3h8l-2 8h3l5-8z" fill={colors.accent} stroke={colors.white} strokeWidth={1.2} />
          </G>
        </Svg>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { overflow: 'hidden', borderRadius: radii.xl, borderCurve: 'continuous', backgroundColor: colors.mapSea, borderWidth: 1, borderColor: colors.glassEdgeLit, boxShadow: `0 16px 36px ${colors.shadowHero}` },
  aspect: { width: '100%', aspectRatio: W / H },
});
