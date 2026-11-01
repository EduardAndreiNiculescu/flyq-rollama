import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Flight } from '../api/backend';
import { type Lang, t } from '../i18n';
import { formatTime } from '../ui/format';
import { colors } from '../ui/theme';

export function FlightCard({ flight, lang }: { flight: Flight; lang: Lang }) {
  const other =
    flight.kind === 'departure' ? flight.destination : flight.origin;
  const city = other.name ? other.name[lang] : other.iata;
  const time = formatTime(flight.times.estimated ?? flight.times.scheduled);
  const arrow = flight.kind === 'departure' ? '→' : '←';
  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.code}>{flight.flightCode}</Text>
      <Text style={styles.main} numberOfLines={1}>
        {arrow} {city}
        {time ? ` · ${time}` : ''}
        {flight.gate ? ` · ${t(lang, 'flightGate')} ${flight.gate}` : ''}
      </Text>
      {flight.isDelayed ? (
        <Text style={styles.delay}>
          {t(lang, 'flightDelayed')} +{flight.delayMinutes ?? 0} min
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.panel,
    borderColor: colors.panelBorder,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  code: {
    color: colors.accentLight,
    fontSize: 13,
    fontWeight: '700',
  },
  main: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 13,
  },
  delay: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '600',
  },
});
