import { Alert, Share } from 'react-native';
import type { FlightRecord } from '../../core/types';
import { createShare, stopShare, type ShareState } from './share';

/**
 * The "Send to family" flow, one place for every screen that has the button: explicit consent first (what is shared, for how long, how to stop),
 * then the link is created on the server and the iOS share sheet opens with it. Returns the share, or a message to show when it did not happen.
 */
export type ShareOutcome = { kind: 'shared'; share: ShareState } | { kind: 'cancelled' } | { kind: 'error'; message: string };

const ask = (ro: boolean) =>
  new Promise<boolean>(resolve =>
    Alert.alert(
      ro ? 'Trimite zborul familiei' : 'Share your flight with family',
      ro
        ? 'Cine are linkul vede zborul tău: poziția avionului, starea, poarta și ora estimată de aterizare. Nu se partajează numele, locul sau codul de rezervare. Linkul expiră după aterizare și îl poți opri oricând.'
        : 'Anyone with the link sees your flight: aircraft position, status, gate and estimated landing. Your name, seat and booking code are not shared. The link expires after landing and you can stop it any time.',
      [
        { text: ro ? 'Anulează' : 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: ro ? 'Creează link' : 'Create link', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );

export async function shareWithFamily(record: FlightRecord, ro: boolean): Promise<ShareOutcome> {
  if (!(await ask(ro))) return { kind: 'cancelled' };
  const r = await createShare(record);
  if (!r.ok) return { kind: 'error', message: r.message };
  await Share.share({ message: ro ? `Urmărește zborul meu live: ${r.share.url}` : `Follow my flight live: ${r.share.url}`, url: r.share.url }).catch(() => {});
  return { kind: 'shared', share: r.share };
}

export { stopShare };
