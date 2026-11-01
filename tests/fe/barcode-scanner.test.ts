import { describe, expect, it } from 'vitest';
import {
  BOARDING_PASS_BARCODES,
  CameraBarcodeScannerService,
  ScanCancelledError,
  cameraAccess,
  type ScannedBarcode,
} from '../../src/services/camera/CameraBarcodeScannerService';
import { DEMO_BCBP } from '../../src/lib/bcbp';

// CameraView simulat: ține handler-ul primit pe `onBarcodeScanned` și trimite coduri ca preview-ul real.
function fakeCameraView(onBarcodeScanned: (result: ScannedBarcode) => boolean) {
  return { emit: (data: string, type = 'pdf417') => onBarcodeScanned({ type, data }) };
}

describe('camera permission state', () => {
  it('null while the permission is still being read', () => {
    expect(cameraAccess(null)).toBe('checking');
  });

  it('granted → camera; never asked → ask; refused for good → Settings', () => {
    expect(cameraAccess({ granted: true, canAskAgain: true, status: 'granted' })).toBe('granted');
    expect(cameraAccess({ granted: false, canAskAgain: true, status: 'undetermined' })).toBe('ask');
    expect(cameraAccess({ granted: false, canAskAgain: false, status: 'denied' })).toBe('blocked');
  });
});

describe('CameraBarcodeScannerService', () => {
  it('scans the boarding pass formats: PDF417, Aztec, QR', () => {
    expect(BOARDING_PASS_BARCODES).toEqual(['pdf417', 'aztec', 'qr']);
  });

  it('resolves with the raw text of the code the camera reads', async () => {
    const scanner = new CameraBarcodeScannerService();
    const camera = fakeCameraView(scanner.handleBarcode);
    const scan = scanner.scan();
    expect(scanner.scanning).toBe(true);
    const raw = `${DEMO_BCBP}\n`;
    expect(camera.emit(raw)).toBe(true);
    await expect(scan).resolves.toBe(raw); // unchanged, even the trailing newline
    expect(scanner.scanning).toBe(false);
  });

  it('reads only once, even when the camera sends many events', async () => {
    const scanner = new CameraBarcodeScannerService();
    const camera = fakeCameraView(scanner.handleBarcode);
    const scan = scanner.scan();
    const used = ['FIRST', 'FIRST', 'SECOND', 'THIRD'].map(code => camera.emit(code));
    expect(used).toEqual([true, false, false, false]);
    await expect(scan).resolves.toBe('FIRST');
  });

  it('ignores empty codes and codes that arrive with no scan waiting', async () => {
    const scanner = new CameraBarcodeScannerService();
    const camera = fakeCameraView(scanner.handleBarcode);
    expect(camera.emit(DEMO_BCBP)).toBe(false); // before scan()
    const scan = scanner.scan();
    expect(camera.emit('')).toBe(false);
    expect(camera.emit('   ')).toBe(false);
    expect(camera.emit(DEMO_BCBP, 'qr')).toBe(true);
    await expect(scan).resolves.toBe(DEMO_BCBP);
  });

  it('cancel rejects the pending scan; later codes are ignored', async () => {
    const scanner = new CameraBarcodeScannerService();
    const camera = fakeCameraView(scanner.handleBarcode);
    const scan = scanner.scan();
    scanner.cancel();
    await expect(scan).rejects.toBeInstanceOf(ScanCancelledError);
    expect(camera.emit(DEMO_BCBP)).toBe(false);
    scanner.cancel(); // twice is harmless
  });

  it('a new scan cancels the old one and gets the next code', async () => {
    const scanner = new CameraBarcodeScannerService();
    const camera = fakeCameraView(scanner.handleBarcode);
    const first = scanner.scan();
    const second = scanner.scan();
    await expect(first).rejects.toBeInstanceOf(ScanCancelledError);
    camera.emit(DEMO_BCBP);
    await expect(second).resolves.toBe(DEMO_BCBP);
  });
});
