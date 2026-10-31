/** OpenSky /states/all decoding. Pure functions, no network, no credentials. */

export type Observation = {
  icao24: string;
  callsign: string | null;
  observedAtSec: number | null; // time_position (NOT last_contact)
  lastContactSec: number;
  lat: number | null;
  lon: number | null;
  groundSpeedMps: number | null;
  trueTrackDeg: number | null;
  baroAltitudeM: number | null;
  verticalRateMps: number | null;
  onGround: boolean;
  positionSource: number | null;
  provider: 'opensky' | 'airlabs';
};

const finiteOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Decode one tuple (indexes per the OpenSky REST docs). Throws on malformed rows; never turns null into 0. */
export function decodeState(row: unknown): Observation {
  if (!Array.isArray(row) || row.length < 17) throw new Error('bad_state_shape');
  const icao24 = row[0];
  if (typeof icao24 !== 'string' || !/^[0-9a-f]{6}$/i.test(icao24)) throw new Error('bad_icao24');
  const contact = finiteOrNull(row[4]);
  if (contact === null || !Number.isInteger(contact)) throw new Error('bad_time');
  const lon = finiteOrNull(row[5]);
  const lat = finiteOrNull(row[6]);
  if ((lat !== null && Math.abs(lat) > 90) || (lon !== null && Math.abs(lon) > 180)) throw new Error('bad_coordinates');
  const speed = finiteOrNull(row[9]);
  if (speed !== null && speed < 0) throw new Error('bad_speed');
  if (typeof row[8] !== 'boolean') throw new Error('bad_ground_flag');
  const track = finiteOrNull(row[10]);
  return {
    icao24: icao24.toLowerCase(),
    callsign: typeof row[1] === 'string' ? row[1].trim() || null : null,
    observedAtSec: finiteOrNull(row[3]),
    lastContactSec: contact,
    lon,
    lat,
    baroAltitudeM: finiteOrNull(row[7]),
    onGround: row[8],
    groundSpeedMps: speed,
    trueTrackDeg: track === null ? null : ((track % 360) + 360) % 360,
    verticalRateMps: finiteOrNull(row[11]),
    positionSource: finiteOrNull(row[16]),
    provider: 'opensky',
  };
}

/** Parse the `{time, states}` envelope. `states: null` means "no observation", not "flight cancelled". */
export function parseStatesResponse(json: unknown): { time: number; observations: Observation[] } {
  if (!json || typeof json !== 'object') throw new Error('bad_response');
  const { time, states } = json as { time?: unknown; states?: unknown };
  if (typeof time !== 'number' || !Number.isFinite(time)) throw new Error('bad_response_time');
  if (states === null || states === undefined) return { time, observations: [] };
  if (!Array.isArray(states)) throw new Error('bad_states');
  return { time, observations: states.map(decodeState) };
}
