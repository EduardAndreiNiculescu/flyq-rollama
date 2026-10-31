import { DEMO_BCBP } from '../../lib/bcbp';
import type { BarcodeScannerService } from '../types';

// Simulează camera: „găsește” codul biletului demo după câteva secunde.
export class MockBarcodeScannerService implements BarcodeScannerService {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private rejectPending: ((reason: Error) => void) | null = null;

  scan(): Promise<string> {
    this.cancel();
    return new Promise((resolve, reject) => {
      this.rejectPending = reject;
      this.timer = setTimeout(() => {
        this.timer = null;
        this.rejectPending = null;
        resolve(DEMO_BCBP);
      }, 3200);
    });
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.rejectPending?.(new Error('cancelled'));
    this.rejectPending = null;
  }
}
