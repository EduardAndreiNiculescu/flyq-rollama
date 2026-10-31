import { Ban, Clock, DoorOpen, Luggage, PlaneLanding } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useLanguage } from '../i18n';
import { formatLocalTime } from '../lib/time';
import { colors, radii, spacing } from '../theme/tokens';
import type { Flight } from '../types';
import { AppText } from './AppText';
import { Glass } from './Glass';

/**
 * What the server says is different from the schedule: a delay (scheduled time struck through, new time), a cancellation, a diversion, boarding, gate
 * closing, landed (with the baggage belt). Nothing is shown for a flight that is simply on time, so it does not take space for nothing.
 */
export function FlightStatusChip({ flight, offsetMin }: { flight: Flight; offsetMin: number }) {
  const ro = useLanguage() === 'ro';
  const status = flight.status;
  const late = (flight.delayMin ?? 0) > 0;
  let text: string | null = null;
  let tone: 'danger' | 'warning' | 'success' = 'warning';
  let Icon = Clock;
  if (status === 'cancelled') (text = ro ? 'Zbor anulat' : 'Flight cancelled'), (tone = 'danger'), (Icon = Ban);
  else if (status === 'diverted') (text = ro ? 'Zbor deviat' : 'Flight diverted'), (tone = 'danger'), (Icon = Ban);
  else if (status === 'landed') (text = ro ? `A aterizat${flight.baggageBelt ? ` · banda ${flight.baggageBelt}` : ''}` : `Landed${flight.baggageBelt ? ` · belt ${flight.baggageBelt}` : ''}`), (tone = 'success'), (Icon = flight.baggageBelt ? Luggage : PlaneLanding);
  else if (status === 'gate_closing') (text = ro ? 'Poarta se închide' : 'Gate closing'), (tone = 'warning'), (Icon = DoorOpen);
  else if (status === 'boarding') (text = ro ? 'Îmbarcarea a început' : 'Boarding has started'), (tone = 'success'), (Icon = DoorOpen);
  if (late && status !== 'cancelled' && status !== 'landed') {
    const was = flight.scheduledDepartureUtc ? formatLocalTime(flight.scheduledDepartureUtc, offsetMin) : null;
    const now = formatLocalTime(flight.departureUtc, offsetMin);
    const delay = ro ? `Întârziere ${flight.delayMin} min${was ? ` · decolare ${was} → ${now}` : ''}` : `Delayed ${flight.delayMin} min${was ? ` · departure ${was} → ${now}` : ''}`;
    text = text ? `${text} · ${delay}` : delay;
    if (tone !== 'danger') tone = 'warning';
  }
  if (!text) return null;
  const color = tone === 'danger' ? colors.danger : tone === 'success' ? colors.successText : colors.warningText;
  return (
    <Glass tone="strong" radius={radii.pill} style={styles.chip} accessibilityRole="alert">
      <Icon size={18} color={color} strokeWidth={2.2} />
      <View style={styles.text}>
        <AppText variant="caption" weight="700" color={color}>{text}</AppText>
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  text: { flex: 1 },
});
