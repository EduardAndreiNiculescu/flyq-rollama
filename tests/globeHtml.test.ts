import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GLOBE_HTML } from '../src/lib/globeHtml';

describe('iOS globe page', () => {
  const script = /<script>([\s\S]*?)<\/script>\s*<\/body>/.exec(GLOBE_HTML)![1]!;
  it('its inline script is valid JavaScript', () => {
    expect(() => new Function(script)).not.toThrow();
  });
  it('speaks the protocol FlightGlobeMap expects', () => {
    for (const piece of ['window.__FLYQ__', 'window.flyq=', 'setPosition', "type:'ready'", "type:'error'", 'ReactNativeWebView']) expect(GLOBE_HTML).toContain(piece);
  });
  it.skipIf(!process.env.GLOBE_PREVIEW)('writes a preview file', () => {
    const cfg = { from: { code: 'CRA', lat: 44.318, lon: 23.889 }, to: { code: 'LTN', lat: 51.875, lon: -0.368 }, departureLabel: 'Decolare 10:40', arrivalLabel: 'Aterizare 11:50', position: { lat: 48.5, lon: 12, progress: 0.5, source: 'gps' } };
    writeFileSync(process.env.GLOBE_PREVIEW!, GLOBE_HTML.replace('<script src', `<script>window.__FLYQ__=${JSON.stringify(cfg)}</script><script src`));
  });
});
