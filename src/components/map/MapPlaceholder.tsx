import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useLocalized, useT } from '../../i18n';
import { terminalService } from '../../services';
import { colors } from '../../theme/tokens';
import type { IndoorPosition, Route, TerminalNode, Zone } from '../../types';

export interface IndoorMapProps {
  floor: number;
  route: Route | null;
  position: IndoorPosition | null;
  targetNodeId: string;
  showDebug: boolean;
  onReady?: () => void;
}

const W = 360;
const H = 468;
const PAD = 20;
const FLOOR_CONTROL_GUTTER = 54;
const FONT = 'System';

/** Plan 2D offline, construit exclusiv din terminal.json. */
export function MapPlaceholder({ floor, route, position, targetNodeId, showDebug, onReady }: IndoorMapProps) {
  const t = useT();
  const localized = useLocalized();
  const terminal = terminalService.getTerminal();
  const floorInfo = terminal.floors.find(item => item.id === floor);

  useEffect(() => onReady?.(), [onReady]);
  if (!floorInfo) return null;

  const nodes = terminal.nodes.filter(node => node.floor === floor);
  const zones = terminal.zones.filter(zone => zone.floor === floor);
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const routePoints = route?.points.filter(point => point.floor === floor) ?? [];
  const plotWidth = W - PAD * 2 - FLOOR_CONTROL_GUTTER;
  const point = (x: number, y: number) => ({
    x: PAD + (x / floorInfo.width) * plotWidth,
    y: PAD + (y / floorInfo.depth) * (H - PAD * 2),
  });
  const target = nodeById.get(targetNodeId);
  const location = position?.floor === floor ? position : null;

  return (
    <View style={styles.card} accessible accessibilityRole="image" accessibilityLabel={`${t('map.title')}, ${localized(floorInfo.name)}`}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        <Rect x={PAD} y={PAD} width={plotWidth} height={H - PAD * 2} rx={22} fill={colors.surfaceOpaque} stroke={colors.opaqueBorder} strokeWidth={1.5} />
        {zones.map(zone => <ZoneShape key={zone.id} zone={zone} point={point} label={zone.label ? localized(zone.label) : undefined} />)}
        {terminal.edges.filter(edge => nodeById.has(edge.from) && nodeById.has(edge.to)).map(edge => {
          const from = nodeById.get(edge.from)!;
          const to = nodeById.get(edge.to)!;
          const a = point(from.x, from.y);
          const b = point(to.x, to.y);
          return <Line key={`${edge.from}-${edge.to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#C8D4F2" strokeWidth={6} strokeLinecap="round" />;
        })}
        {routePoints.length > 1 ? (
          <Path
            d={routePoints.map((item, index) => {
              const p = point(item.x, item.y);
              return `${index === 0 ? 'M' : 'L'} ${p.x} ${p.y}`;
            }).join(' ')}
            fill="none"
            stroke={colors.accent}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {nodes.filter(isVisibleNode).map(node => (
          <NodeMarker key={node.id} node={node} point={point} label={node.landmark ? localized(node.landmark) : undefined} active={node.id === target?.id} />
        ))}
        {location ? <PositionMarker x={point(location.x, location.y).x} y={point(location.x, location.y).y} /> : null}
        {showDebug ? nodes.map(node => {
          const p = point(node.x, node.y);
          return <SvgText key={`debug-${node.id}`} x={p.x + 4} y={p.y - 5} fontFamily={FONT} fontSize={6.5} fill={colors.textMuted}>{node.id}</SvgText>;
        }) : null}
      </Svg>
    </View>
  );
}

function ZoneShape({ zone, point, label }: { zone: Zone; point: (x: number, y: number) => { x: number; y: number }; label?: string }) {
  const a = point(zone.x, zone.y);
  const b = point(zone.x + zone.w, zone.y + zone.d);
  const fill = zone.kind === 'security' || zone.kind === 'passport' ? colors.warningSoft : zone.kind === 'shop' ? colors.indigoSoft : 'rgba(255,255,255,0.58)';
  const wideEnough = b.x - a.x > 54;
  return <>
    <Rect x={a.x} y={a.y} width={b.x - a.x} height={b.y - a.y} rx={7} fill={fill} stroke={colors.opaqueBorder} strokeWidth={1} />
    {label && (wideEnough || zone.kind === 'desk') ? (
      <SvgText
        x={zone.kind === 'desk' ? (a.x + b.x) / 2 : a.x + 7}
        y={zone.kind === 'desk' ? (a.y + b.y) / 2 + 3 : a.y + 13}
        textAnchor={zone.kind === 'desk' ? 'middle' : 'start'}
        fontFamily={FONT}
        fontSize={8}
        fontWeight="700"
        fill={colors.textMuted}
      >{label}</SvgText>
    ) : null}
  </>;
}

function NodeMarker({ node, point, label, active }: { node: TerminalNode; point: (x: number, y: number) => { x: number; y: number }; label?: string; active: boolean }) {
  const p = point(node.x, node.y);
  const warning = node.kind === 'security' || node.kind === 'passport';
  const fill = active ? colors.accent : warning ? colors.warning : colors.text2;
  return <>
    {active ? <Circle cx={p.x} cy={p.y} r={13} fill={colors.accentSoft} /> : null}
    <Circle cx={p.x} cy={p.y} r={active ? 6.5 : 4.5} fill={fill} stroke={colors.white} strokeWidth={2} />
    {label ? <SvgText x={p.x + 8} y={p.y - 7} fontFamily={FONT} fontSize={9} fontWeight={active ? '800' : '600'} fill={colors.text}>{label}</SvgText> : null}
  </>;
}

function PositionMarker({ x, y }: { x: number; y: number }) {
  return <><Circle cx={x} cy={y} r={15} fill={colors.accent} fillOpacity={0.14} /><Circle cx={x} cy={y} r={7} fill={colors.accent} stroke={colors.white} strokeWidth={3} /></>;
}

function isVisibleNode(node: TerminalNode) {
  return node.kind === 'gate' || node.kind === 'entrance';
}

const styles = StyleSheet.create({
  card: { flex: 1, minHeight: 300, overflow: 'hidden', borderRadius: 24, backgroundColor: colors.glassStrong, borderWidth: 1, borderColor: colors.glassEdgeLit },
});
