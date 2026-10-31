import { AppState } from 'react-native';
import { benchState } from '../../bench/state';
import { useProgress } from '../../store/assistantUi';
import { engine } from './DeviceAssistantService';

// The Jetsam reports from the phone show FlightFlow at about 3.2 GB when iOS kills it, and the model's own buffers add up to about 3.1 GB of that
// (weights 2.68 GB, attention cache 0.3 GB, compute 0.09 GB, adapter 0.03 GB). The UI is a few percent. The app was "suspended" when it was killed:
// iOS suspends a backgrounded app within seconds, so a timer started on "background" never fires. The model is therefore released the moment the app
// goes to the background, and also when it has been idle in the foreground for a while. It is loaded again on the next question (about 3.5 s).

const IDLE_MS = 180_000;
let started = false;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

async function release(reason: string) {
  if (!engine.ready || benchState.active) return; // a benchmark driven from the laptop is not interrupted
  // Never in the middle of an answer: unloading during a generation makes that answer fail.
  if (useProgress.getState().active) return;
  try {
    await engine.unload();
    if (__DEV__) console.log(`[memoryGuard] model released: ${reason}`);
  } catch {
    /* an engine that is already stopped must not break the app */
  }
}

function armIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => void release('idle'), IDLE_MS);
}

export function startMemoryGuard() {
  if (started) return;
  started = true;
  AppState.addEventListener('change', state => {
    if (state === 'background') {
      if (idleTimer) clearTimeout(idleTimer);
      void release('background'); // no grace period: the app is suspended in a moment
    } else if (state === 'active') armIdle();
  });
  AppState.addEventListener('memoryWarning', () => void release('memory warning'));
  // Every answer that finishes restarts the idle clock.
  useProgress.subscribe((s, prev) => {
    if (prev.active && !s.active) armIdle();
  });
  armIdle();
}
