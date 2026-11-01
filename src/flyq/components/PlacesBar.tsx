import React from 'react';
import {
  Image,
  type ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NearPlace, NextTurn, Place, RouteStatus } from 'flyq-spatial';

import { type Lang, t } from '../i18n';
import { Button } from '../ui/Button';
import { colors } from '../ui/theme';

/** The kinds' glyphs: the same pictures the map draws on its badges (ios/Assets/poi-<kind>.png). */
const GLYPHS: Record<string, ImageSourcePropType> = {
  info: require('../assets/poi/info.png'),
  shop: require('../assets/poi/shop.png'),
  food: require('../assets/poi/food.png'),
  wc: require('../assets/poi/wc.png'),
  medical: require('../assets/poi/medical.png'),
  vip: require('../assets/poi/vip.png'),
  exit: require('../assets/poi/exit.png'),
  security: require('../assets/poi/security.png'),
  checkin: require('../assets/poi/checkin.png'),
  gate: require('../assets/poi/gate.png'),
  stairs: require('../assets/poi/stairs.png'),
  elevator: require('../assets/poi/elevator.png'),
  atm: require('../assets/poi/atm.png'),
  baggage: require('../assets/poi/baggage.png'),
  parking: require('../assets/poi/parking.png'),
  taxi: require('../assets/poi/taxi.png'),
  other: require('../assets/poi/other.png'),
};

export function placeName(place: Place | undefined, lang: Lang): string {
  if (!place) {
    return '';
  }
  return lang === 'ro' ? place.name.ro : place.name.en;
}

/** "45 m · 1 min" (at least a minute; under a minute: "< 1 min"). */
export function routeLine(route: RouteStatus, lang: Lang): string {
  const minutes = Math.round(route.seconds / 60);
  const time =
    minutes < 1
      ? `< 1 ${t(lang, 'minuteShort')}`
      : `${minutes} ${t(lang, 'minuteShort')}`;
  return `${route.meters} m · ${time}`;
}

/** "12 m" under 20 m, then to the nearest 5 m ("45 m"), as in a maps app. */
export function aheadMeters(meters: number): string {
  return meters < 20
    ? `${Math.max(1, Math.round(meters))} m`
    : `${Math.round(meters / 5) * 5} m`;
}

const TURN_ARROWS: Record<NextTurn['kind'], string> = {
  left: '←',
  right: '→',
  slightLeft: '↖',
  slightRight: '↗',
  back: '↶',
  up: '⇡',
  down: '⇣',
  straight: '↑',
  arrive: '◎',
};

/** The next turn as an arrow and a line: "În 12 m, la dreapta", "Urcă scările", "Înainte, 40 m". */
export function nextTurnLine(
  next: NextTurn,
  lang: Lang,
): { arrow: string; text: string } {
  const arrow = TURN_ARROWS[next.kind];
  if (next.kind === 'arrive') {
    return { arrow, text: t(lang, 'turnArrive') };
  }
  if (next.kind === 'straight') {
    return {
      arrow,
      text:
        next.meters < 25
          ? `${t(lang, 'turnDestination')} ${aheadMeters(next.meters)}`
          : `${t(lang, 'turnStraight')}, ${aheadMeters(next.meters)}`,
    };
  }
  const key = `turn_${next.kind}` as const;
  const what = t(lang, key);
  if (next.meters < 5) {
    return { arrow, text: what.charAt(0).toUpperCase() + what.slice(1) };
  }
  return {
    arrow,
    text: `${t(lang, 'turnIn')} ${aheadMeters(next.meters)}, ${what}`,
  };
}

/**
 * The carousel's order: once the user is on the map, the nearest first; before that, as the plan
 * lists them. Each with its distance when known.
 */
export function orderPlaces(
  places: Place[],
  nearby: NearPlace[],
): Array<{ place: Place; meters: number | null }> {
  const metersOf = new Map(nearby.map(n => [n.id, n.meters]));
  const items = places.map(place => ({
    place,
    meters: metersOf.get(place.id) ?? null,
  }));
  if (nearby.length === 0) {
    return items;
  }
  return items.sort((a, b) => (a.meters ?? Infinity) - (b.meters ?? Infinity));
}

export function PlaceBadge({
  kind,
  color,
  size = 26,
}: {
  kind: string;
  color: string;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
      ]}
    >
      <Image
        source={GLYPHS[kind] ?? GLYPHS.other}
        style={{ width: size * 0.62, height: size * 0.62 }}
        resizeMode="contain"
      />
    </View>
  );
}

/** The places at the top of the map, to choose where to go. */
export function PlacesBar({
  places,
  nearby,
  activeId,
  lang,
  onPick,
}: {
  places: Place[];
  nearby: NearPlace[];
  activeId: string | null;
  lang: Lang;
  onPick: (id: string) => void;
}) {
  if (places.length === 0) {
    return null;
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.bar}
      keyboardShouldPersistTaps="handled"
    >
      {orderPlaces(places, nearby).map(({ place, meters }) => {
        const active = place.id === activeId;
        return (
          <Pressable
            key={place.id}
            accessibilityRole="button"
            accessibilityLabel={`${t(lang, 'routeTo')} ${placeName(
              place,
              lang,
            )}`}
            onPress={() => onPick(place.id)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <PlaceBadge kind={place.kind} color={place.color} />
            <Text
              style={[styles.chipText, active && styles.chipTextActive]}
              numberOfLines={1}
            >
              {placeName(place, lang)}
            </Text>
            {meters !== null ? (
              <Text
                style={[styles.chipMeters, active && styles.chipTextActive]}
              >
                {meters} m
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** The route in the bottom panel: where to, how far, and walking it (the demo) or stopping. */
export function RouteCard({
  route,
  place,
  lang,
  canWalk,
  walking,
  onWalk,
  onClear,
}: {
  route: RouteStatus;
  place: Place | undefined;
  lang: Lang;
  canWalk: boolean;
  walking: boolean;
  onWalk: () => void;
  onClear: () => void;
}) {
  const name = placeName(place, lang);
  if (route.arrived) {
    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          {place ? (
            <PlaceBadge kind={place.kind} color={place.color} size={34} />
          ) : null}
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{`${t(
              lang,
              'routeArrived',
            )} ${name}`}</Text>
          </View>
        </View>
        <Button label={t(lang, 'routeDone')} compact onPress={onClear} />
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        {place ? (
          <PlaceBadge kind={place.kind} color={place.color} size={34} />
        ) : null}
        <View style={styles.cardText}>
          <Text style={styles.cardTitle} numberOfLines={1}>{`${t(
            lang,
            'routeTo',
          )} ${name}`}</Text>
          <Text style={styles.cardSmall}>
            {route.found ? routeLine(route, lang) : t(lang, 'routeNotFound')}
          </Text>
        </View>
      </View>
      {route.found && route.next ? (
        <NextTurnRow next={route.next} lang={lang} />
      ) : null}
      <View style={styles.cardButtons}>
        {canWalk && route.found ? (
          <Button
            label={walking ? t(lang, 'routeWalking') : t(lang, 'routeWalk')}
            variant="primary"
            compact
            disabled={walking}
            onPress={onWalk}
            style={styles.flex1}
          />
        ) : null}
        <Button
          label={t(lang, 'routeCancel')}
          compact
          onPress={onClear}
          style={styles.flex1}
        />
      </View>
    </View>
  );
}

function NextTurnRow({ next, lang }: { next: NextTurn; lang: Lang }) {
  const line = nextTurnLine(next, lang);
  return (
    <View style={styles.next} accessibilityLiveRegion="polite">
      <Text style={styles.nextArrow}>{line.arrow}</Text>
      <Text style={styles.nextText} numberOfLines={2}>
        {line.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    gap: 8,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    flexDirection: 'row',
    gap: 7,
    paddingLeft: 5,
    paddingRight: 12,
    paddingVertical: 5,
    shadowColor: '#1F2733',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  chipActive: {
    backgroundColor: colors.accent,
  },
  chipText: {
    color: '#1F2733',
    fontSize: 14,
    fontWeight: '600',
    maxWidth: 170,
  },
  chipMeters: {
    color: '#5E6878',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    gap: 10,
  },
  cardRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  cardSmall: {
    color: colors.textMuted,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  next: {
    alignItems: 'center',
    backgroundColor: '#EEF5FF',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  nextArrow: {
    color: colors.accent,
    fontSize: 20,
    width: 22,
    textAlign: 'center',
  },
  nextText: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  cardButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  flex1: {
    flex: 1,
  },
});
