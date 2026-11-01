import type { BarcodeType } from 'expo-camera';
import type { BarcodeScannerService } from '../types';

// Camera reală (expo-camera). Ecranul de scanare pune `handleBarcode` pe `onBarcodeScanned` al lui CameraView;
// serviciul rezolvă `scan()` cu primul cod citit și le ignoră pe celelalte (camera trimite același cod de zeci de ori pe secundă).
// Fișierul nu importă nimic nativ, ca să poată fi testat în Node.

/** Formatele cărților de îmbarcare (IATA BCBP): PDF417 pe hârtie, Aztec și QR în aplicațiile companiilor. */
export const BOARDING_PASS_BARCODES: BarcodeType[] = ['pdf417', 'aztec', 'qr'];

/** Ce trimite CameraView la fiecare cod văzut (doar câmpurile de care avem nevoie). */
export interface ScannedBarcode {
  type: string;
  data: string;
}

export class ScanCancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'ScanCancelledError';
  }
}

export class CameraBarcodeScannerService implements BarcodeScannerService {
  private pending: { resolve: (code: string) => void; reject: (reason: Error) => void } | null = null;

  /** Așteaptă următorul cod citit de cameră. O scanare nouă o anulează pe cea veche. */
  scan(): Promise<string> {
    this.cancel();
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
    });
  }

  cancel(): void {
    const pending = this.pending;
    this.pending = null;
    pending?.reject(new ScanCancelledError());
  }

  /** E o scanare în așteptare? */
  get scanning(): boolean {
    return this.pending !== null;
  }

  /**
   * Pentru `onBarcodeScanned`. Primul cod cu text rezolvă scanarea cu textul brut, neschimbat;
   * restul evenimentelor (sau cele venite fără scanare în așteptare) sunt ignorate. Întoarce `true` dacă l-a folosit.
   */
  handleBarcode = (result: ScannedBarcode): boolean => {
    const pending = this.pending;
    if (!pending || typeof result.data !== 'string' || result.data.trim() === '') return false;
    this.pending = null;
    pending.resolve(result.data);
    return true;
  };
}

/** Starea camerei pentru ecran, din răspunsul `useCameraPermissions` (null cât timp încă se verifică). */
export type CameraAccess = 'checking' | 'ask' | 'granted' | 'blocked';

export function cameraAccess(permission: { granted: boolean; canAskAgain: boolean; status: string } | null): CameraAccess {
  if (!permission) return 'checking';
  if (permission.granted) return 'granted';
  // Pe iOS, după un „Nu permite”, sistemul nu mai arată fereastra: rămân doar Setările.
  return permission.canAskAgain ? 'ask' : 'blocked';
}
