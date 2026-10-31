import { describe, expect, it } from 'vitest';
import { gateFromNotificationText } from '../src/services/live/notificationGate';

describe('gate in a notification text', () => {
  it('takes the new gate from a change message', () => {
    expect(gateFromNotificationText('Poarta s-a schimbat: 2 → 3')).toBe('3');
    expect(gateFromNotificationText('Gate changed from 2 to 3')).toBe('3');
    expect(gateFromNotificationText('FlyQ Poarta nouă: B7')).toBe('B7');
  });
  it('ignores messages that are not about the gate', () => {
    expect(gateFromNotificationText('Zborul W69901 are întârziere de 25 min')).toBeNull();
    expect(gateFromNotificationText('Îmbarcarea a început')).toBeNull();
  });
});
