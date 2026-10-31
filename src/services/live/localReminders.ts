import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useSettings } from '../../store/settings';
import { useTickets } from '../../store/tickets';
import { clock, flightData } from '../index';
import { planKey, planReminders, REMINDER_PREFIX } from './reminderPlan';

/**
 * Schedules the flight reminders on the phone itself (boarding in 15 min, boarding started, gate closing), from the active ticket and the server's
 * latest delay and gate. It does not need the FlyQ server, APNs or an internet connection once scheduled, so it is the safety net when push fails.
 * Called by the flight sync after every server read and when the setting changes; an unchanged plan is not rescheduled.
 */
let lastKey = '';

async function permitted(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  const p = await Notifications.getPermissionsAsync();
  if (p.granted) return true;
  if (p.canAskAgain && p.status === Notifications.PermissionStatus.UNDETERMINED) return (await Notifications.requestPermissionsAsync()).granted;
  return false;
}

async function cancelOurs(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(all.filter(n => n.identifier.startsWith(REMINDER_PREFIX)).map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

/** Re-plan the reminders for the active ticket. Never throws. Returns how many are scheduled (0 when off, no ticket or no permission). */
export async function syncReminders(): Promise<number> {
  try {
    const { flightReminders, language } = useSettings.getState();
    const { tickets, activeTicketId } = useTickets.getState();
    const ticket = tickets.find(t => t.id === activeTicketId);
    const flight = ticket ? flightData.getFlight(ticket.flightId) : null;
    if (!flightReminders || !ticket || !flight) {
      if (lastKey) await cancelOurs();
      lastKey = '';
      return 0;
    }
    const plan = planReminders({
      flightNumber: `${flight.carrier} ${flight.flightNumber}`,
      from: flight.from,
      to: flight.to,
      boardingUtc: flight.boardingUtc,
      gateCloseUtc: flight.gateCloseUtc,
      departureUtc: flight.departureUtc,
      gate: flight.gate,
      delayMin: 0, // the flight the screens hold is already shifted by the server's delay
      language,
      nowMs: clock.now().getTime(),
    });
    const key = planKey(plan);
    if (key === lastKey) return plan.length;
    if (!(await permitted())) return 0;
    await cancelOurs();
    for (const r of plan) {
      await Notifications.scheduleNotificationAsync({
        identifier: r.id,
        content: { title: r.title, body: r.body, data: { kind: 'reminder' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(r.atMs) },
      });
    }
    lastKey = key;
    return plan.length;
  } catch {
    return 0;
  }
}
