import { createTools, type ToolDef } from '../../src/tools/registry';
import type { LiveProvider } from './providers';

/**
 * The SAME tools (names, descriptions, argument schemas) as the app's registry; only the data source changes.
 * Tools that take a flight number first resolve it through the live provider, then run the original code.
 * That keeps the tool-calling contract identical for everyone who defines tools on top of it.
 */
export function liveTools(provider: Pick<LiveProvider, 'lookup'>): ToolDef[] {
  return createTools().map((t) => {
    if (!Object.prototype.hasOwnProperty.call(t.parameters.properties, 'flightNumber')) return t;
    return {
      ...t,
      execute: async (args, deps) => {
        const fn = args.flightNumber ?? deps.context.flightNumber;
        if (!fn) throw new Error('no flight number given: ask the passenger for it');
        const l = await provider.lookup(fn);
        if (!l.ok) {
          // Different situations get different wording, so "does not exist" is never confused with "provider down".
          throw new Error(l.reason === 'not_found' ? 'flight not found by the data provider' : `flight data unavailable right now (${l.reason})`);
        }
        if (!l.record) throw new Error('the provider has this flight but no usable schedule');
        // The record carries the IATA number (CX253) even when the passenger typed the callsign (CPA253): the inner tool matches on that.
        return t.execute({ ...args, flightNumber: l.record.flightNumber }, { ...deps, flights: [l.record] });
      },
    };
  });
}
