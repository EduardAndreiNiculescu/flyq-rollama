import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';

// Funcții native (haptic, voce, clipboard) într-un singur loc. Orice eroare = nu se întâmplă nimic, ecranul merge mai departe.

export function haptic(kind: 'tap' | 'success' | 'warning' = 'tap') {
  try {
    if (kind === 'tap') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else void Haptics.notificationAsync(kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
  } catch {
    /* nu contează */
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    return await Clipboard.setStringAsync(text);
  } catch {
    return false;
  }
}

let speaking = false;
export const isSpeaking = () => speaking;
export function speak(text: string, lang: 'ro' | 'en', onDone?: () => void): boolean {
  const done = () => {
    speaking = false;
    onDone?.();
  };
  try {
    Speech.stop();
    speaking = true;
    Speech.speak(text, { language: lang === 'ro' ? 'ro-RO' : 'en-US', onDone: done, onStopped: done, onError: done });
    return true;
  } catch {
    done();
    return false;
  }
}
export function stopSpeaking() {
  try {
    Speech.stop();
  } catch {
    /* nu contează */
  }
  speaking = false;
}
