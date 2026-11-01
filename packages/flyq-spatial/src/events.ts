/**
 * Typed view of the events sent by the native FlyQ spatial view.
 *
 * Native sends `{ name, payload }` where payload is a JSON string. Everything here is defensive:
 * a malformed payload becomes `{ type: 'unknown' }` instead of crashing the screen.
 */

export type SpatialMode =
  | 'map'
  | 'locating'
  | 'navigating'
  | 'calibrating'
  | 'recording';
export type PinConfidence = 'exact' | 'tracked' | 'estimated' | 'lost';
export type TrackingState = 'normal' | 'limited' | 'notAvailable';
export type MappingStatus = 'notAvailable' | 'limited' | 'extending' | 'mapped';
export type CameraPermission =
  | 'granted'
  | 'undetermined'
  | 'denied'
  | 'restricted'
  | 'unknown';

export interface LocalizedText {
  ro: string | null;
  en: string | null;
}

export interface VenueOption {
  id: string;
  name: LocalizedText | null;
}

export interface SpatialVenue {
  venueId: string;
  found: boolean;
  modelLoaded: boolean;
  modelLoading: boolean;
  name: LocalizedText | null;
  triangles: number | null;
  /** Width, height, depth in metres. */
  size: [number, number, number] | null;
  /** Every venue bundled with the app (the user can switch between them). */
  venues: VenueOption[];
}

export interface SavedCalibrationInfo {
  createdAt: string;
  rmsError: number | null;
  pairs: number;
  /** What made the saved memory (see VisualMapSource). */
  source: VisualMapSource;
}

/**
 * Who made the venue's "visual memory" on this phone (ARKit world map + alignment, what lets
 * iPhones without LiDAR find themselves): the automatic LiDAR localisation, a manual calibration,
 * a file received from another phone, or the copy shipped inside the app.
 */
export type VisualMapSource =
  | 'auto'
  | 'calibration'
  | 'import'
  | 'bundled'
  | 'extended';

export interface VisualMapInfo {
  createdAt: string;
  source: VisualMapSource;
  /** Feature points ARKit stored: a rough measure of how much of the place it covers. */
  featurePoints: number | null;
  /** Hardware id of the phone that made it, e.g. "iPhone14,3". */
  device: string | null;
  /** Made from a recording walk (kept as it is: the LiDAR phone does not save over it). */
  recorded: boolean;
}

export interface SpatialState {
  mode: SpatialMode;
  venueId: string;
  modelLoaded: boolean;
  hasCalibration: boolean;
  calibration: SavedCalibrationInfo | null;
  arSupported: boolean;
  arRunning: boolean;
  tracking: TrackingState;
  trackingReason: string | null;
  mapping: MappingStatus;
  relocalized: boolean;
  confidence: PinConfidence;
  follow: boolean;
  viewMode: '3d' | 'top';
  cameraExpanded: boolean;
  cameraPermission: CameraPermission;
  /** The venue has a localisation map: the phone can find itself without any calibration. */
  autoAvailable: boolean;
  /** LiDAR iPhone (automatic localisation works best). */
  lidar: boolean;
  /** Automatic localisation lost the match while navigating and is searching again. */
  trackingLost: boolean;
  /** How the current position is obtained. */
  method: LocalizationMethod | null;
  /** The visual memory saved on this phone, if any. */
  visualMap: VisualMapInfo | null;
  /** A LiDAR iPhone is saving the visual memory right now. */
  visualMapSaving: boolean;
  /** An import or export of the visual memory is in progress. */
  visualMapBusy: boolean;
  /** LiDAR iPhone: can record a visual memory where the venue has no map yet. */
  canRecord: boolean;
  /** LiDAR iPhone with a memory of this venue: can extend it (record starting from it). */
  canExtend: boolean;
  /** LiDAR: the walls check a position given by the visual memory (Settings switch). */
  memoryCheck: boolean;
  /** Visual memories shipped with the venue, one per part of it (0: none). */
  memoryZones: number;
  /** The venue ships a recorded walk that can be played back on the map (demo). */
  canReplay: boolean;
  /** A recorded walk is being played back (no camera). */
  replaying: boolean;
  /** Recordings kept on the phone, newest first. */
  recordings: RecordingInfo[];
  /** How the map is shown now (drawn map, 3D scan or 2D picture), where it came from and why. */
  mapView: MapViewStatus | null;
  /** The Settings choice for the map view. */
  mapPreference: MapViewPreference;
  /** What the phone can afford (decides the map view when the choice is automatic). */
  device: DeviceInfo | null;
  /** "Put me on the map": the next tap on the map is where the user is (no camera needed). */
  placeMode: boolean;
  /** The user stands at a position chosen on the map (not found by the camera). */
  placed: boolean;
  /** That position walks a route (the demo). */
  walking: boolean;
  /** The walking route to a point of interest, once one is chosen. */
  route: RouteStatus | null;
  /** The drawn map's points of interest (the carousel at the top). */
  places: Place[];
  /** The nearest points of interest and how far they are, once the user is on the map. */
  nearby: NearPlace[];
}

export interface Place {
  id: string;
  kind: string;
  name: { ro: string; en: string };
  color: string;
}

export interface NearPlace {
  id: string;
  meters: number;
}

export interface RouteStatus {
  to: string;
  meters: number;
  /** At an ordinary walking pace. */
  seconds: number;
  arrived: boolean;
  /** False when no way there was found (the place is out of reach on this floor). */
  found: boolean;
}

/** 'plan': the drawn map; '3d': the light 3D scan; '2d': a picture of the scan from above. */
export type MapViewKind = 'plan' | '3d' | '2d';
export type MapViewPreference = 'auto' | 'plan' | '3d' | '2d';
export type MapViewReason =
  | 'drawn'
  | 'forced'
  | 'capable'
  | 'memory'
  | 'lowPower'
  | 'thermal'
  | 'only3d'
  | 'only2d';
export type MapViewSync =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'upToDate'
  | 'noPack'
  | 'offline'
  | 'error';

export interface MapViewStatus {
  kind: MapViewKind;
  /** The views this phone has for the place (an empty list from older native views). */
  available: MapViewKind[];
  /** 'bundled': inside the app; 'backend': downloaded from the FlyQ backend. */
  source: 'bundled' | 'backend';
  reason: MapViewReason;
  preference: MapViewPreference;
  bytes: number | null;
  /** Pack version on the backend (downloaded views only). */
  version: number | null;
  sync: MapViewSync;
  syncError: string | null;
  /** The app told the native view where the backend is. */
  backend: boolean;
}

export interface DeviceInfo {
  memoryMB: number;
  lowPower: boolean;
  /** 0 nominal, 1 fair, 2 serious, 3 critical. */
  thermal: number;
}

/** A recording kept on the phone (venue without a map yet). */
export interface RecordingInfo {
  file: string;
  createdAt: string;
  bytes: number;
  /** The automatic checkpoint of a walk that was not saved (interrupted or cancelled). */
  inProgress: boolean;
  featurePoints: number | null;
  /** 5 cm wall cells captured with LiDAR. */
  cells: number | null;
  seconds: number | null;
  distance: number | null;
}

/** Progress of a recording in progress. */
export interface RecordingStatus {
  active: boolean;
  saving: boolean;
  checkpointing: boolean;
  seconds: number;
  /** Metres walked. */
  distance: number;
  mapping: MappingStatus;
  tracking: TrackingState;
  meshAnchors: number;
  /** Wall cells in the last automatic checkpoint. */
  cells: number;
  canSave: boolean;
  hint: string | null;
  /** Seconds since the last automatic checkpoint (null before the first). */
  checkpointAgo: number | null;
  /** Extending the venue memory (started from it). */
  extending: boolean;
  /** Extension: waiting for the memory to recognise the place (nothing is recorded yet). */
  waiting: boolean;
}

export type LocalizationMethod = 'auto' | 'worldMap' | 'calibration';

/** Hint codes of the automatic localisation (shown one at a time). */
export type AutoHintCode =
  | 'AUTO_STARTING'
  | 'AUTO_TOO_FAST'
  | 'AUTO_LOW_DETAIL'
  | 'AUTO_HOLD_STILL'
  | 'AUTO_RAISE_PHONE'
  | 'AUTO_LOWER_PHONE'
  | 'AUTO_STEP_BACK'
  | 'AUTO_LOOK_AROUND'
  | 'AUTO_TURN_AROUND'
  | 'AUTO_WALK'
  | 'AUTO_NOT_RECOGNIZED'
  | 'AUTO_ALMOST'
  | 'AUTO_LOOK_ALONG'
  | 'AUTO_TURN_OTHER'
  | string;

export type ScanSource = 'mesh' | 'features' | 'planes' | 'none';

export interface AutoStatus {
  /** Searching right now (camera full screen or position lost). */
  active: boolean;
  available: boolean;
  lidar: boolean;
  attempts: number;
  /** Share of the directions already looked at (0..1). */
  coverage: number;
  searching: boolean;
  points: number;
  hint: AutoHintCode | null;
  verdict: string | null;
  /** 0..1, for a progress bar. */
  progress: number;
  score: number | null;
  ambiguity: number | null;
  inliers: number | null;
  floorSource: string | null;
  elapsed: number | null;
  /** 'auto' (matching against the localisation map) or 'worldMap' (visual memory). */
  method: LocalizationMethod | null;
  /** What the automatic matching saw: the LiDAR mesh or ARKit feature points (no LiDAR). */
  source: ScanSource | null;
  /** Visual-memory search: seconds left before switching to automatic matching. */
  fallbackIn: number | null;
  /** A test of one method on its own (no switching to the other one). */
  only: boolean;
}

export interface SpatialPose {
  x: number;
  y: number;
  z: number;
  headingDeg: number | null;
  confidence: PinConfidence;
}

export interface CalibrationPairInfo {
  ar: [number, number, number];
  model: [number, number, number];
  error: number | null;
}

export type CalibrationWarning =
  | 'POINTS_TOO_CLOSE'
  | 'POINTS_IN_LINE'
  | 'HIGH_ERROR'
  | 'SCALE_MISMATCH'
  | 'MAP_NOT_READY'
  | string;

export interface CalibrationStatus {
  active: boolean;
  pairs: CalibrationPairInfo[];
  pairCount: number;
  hasPendingCamera: boolean;
  hasPendingMap: boolean;
  mapping: MappingStatus;
  tracking: TrackingState;
  saving: boolean;
  canSave: boolean;
  warnings: CalibrationWarning[];
  spread: number | null;
  rmsError: number | null;
  scale: number | null;
  yawDeg: number | null;
}

/** Where the way leads, relative to where the phone points (for the haptic guide). Sent about twice a second while a route is followed with the camera. */
export interface RouteGuide {
  /** Degrees from the phone's direction to the way ahead; positive = turn right, within -180..180. */
  turnDeg: number;
  metersLeft: number;
}

export type SpatialEvent =
  | { type: 'state'; state: SpatialState }
  | { type: 'guide'; guide: RouteGuide }
  | { type: 'venue'; venue: SpatialVenue }
  | { type: 'pose'; pose: SpatialPose }
  | { type: 'calibration'; calibration: CalibrationStatus }
  | { type: 'auto'; auto: AutoStatus }
  | { type: 'recording'; recording: RecordingStatus }
  | { type: 'recordingSaved'; recording: RecordingInfo; verified: boolean }
  | {
      type: 'recordingExport';
      status: 'shared' | 'cancelled' | 'failed';
      activity: string | null;
    }
  | {
      type: 'journalExport';
      status: 'shared' | 'cancelled' | 'failed';
      activity: string | null;
    }
  | {
      type: 'localized';
      at: string;
      seconds: number | null;
      method: string | null;
    }
  | {
      type: 'calibrationSaved';
      rmsError: number | null;
      pairs: number;
      createdAt: string;
      worldMapBytes: number | null;
    }
  | {
      type: 'visualMapSaved';
      visualMap: VisualMapInfo;
      /** First save of this localisation session. */
      first: boolean;
      bytes: number | null;
    }
  | { type: 'visualMapSaveFailed'; message: string }
  | {
      type: 'memoryExtended';
      /** smaller: the new world map holds fewer points than the old memory (kept as a recording). */
      status: 'installed' | 'mismatch' | 'smaller' | 'failed';
      /** Share of the walk's walls on the venue map (0..1), when it was checked. */
      share: number | null;
      visualMap: VisualMapInfo | null;
    }
  | {
      type: 'visualMapImport';
      status: 'imported' | 'cancelled';
      visualMap: VisualMapInfo | null;
    }
  | {
      type: 'visualMapExport';
      status: 'shared' | 'cancelled' | 'failed';
      activity: string | null;
    }
  | { type: 'hint'; code: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'unknown'; name: string; payload: string };

type Json = Record<string, unknown>;

function parseObject(payload: string): Json | null {
  try {
    const value: unknown = JSON.parse(payload);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return value as Json;
    }
    return null;
  } catch {
    return null;
  }
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function vec3(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }
  const [a, b, c] = value.map(num);
  return a === null || b === null || c === null ? null : [a, b, c];
}

const MODES = [
  'map',
  'locating',
  'navigating',
  'calibrating',
  'recording',
] as const;
const CONFIDENCES = ['exact', 'tracked', 'estimated', 'lost'] as const;
const TRACKING = ['normal', 'limited', 'notAvailable'] as const;
const MAPPING = ['notAvailable', 'limited', 'extending', 'mapped'] as const;
const PERMISSIONS = [
  'granted',
  'undetermined',
  'denied',
  'restricted',
  'unknown',
] as const;
const MAP_SOURCES = [
  'auto',
  'calibration',
  'import',
  'bundled',
  'extended',
] as const;
const SCAN_SOURCES = ['mesh', 'features', 'planes', 'none'] as const;

function method(value: unknown): LocalizationMethod | null {
  return value === 'auto' || value === 'worldMap' || value === 'calibration'
    ? value
    : null;
}

function parseRecordingInfo(value: unknown): RecordingInfo | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const v = value as Json;
  const file = str(v.file);
  if (!file) {
    return null;
  }
  return {
    file,
    createdAt: str(v.createdAt),
    bytes: num(v.bytes) ?? 0,
    inProgress: bool(v.inProgress),
    featurePoints: num(v.featurePoints),
    cells: num(v.cells),
    seconds: num(v.seconds),
    distance: num(v.distance),
  };
}

function parseRecordings(value: unknown): RecordingInfo[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(parseRecordingInfo)
    .filter((r): r is RecordingInfo => r !== null);
}

function parseRecordingStatus(o: Json): RecordingStatus {
  return {
    active: bool(o.active),
    saving: bool(o.saving),
    checkpointing: bool(o.checkpointing),
    seconds: num(o.seconds) ?? 0,
    distance: num(o.distance) ?? 0,
    mapping: oneOf(o.mapping, MAPPING, 'notAvailable'),
    tracking: oneOf(o.tracking, TRACKING, 'notAvailable'),
    meshAnchors: num(o.meshAnchors) ?? 0,
    cells: num(o.cells) ?? 0,
    canSave: bool(o.canSave),
    hint: strOrNull(o.hint),
    checkpointAgo: num(o.checkpointAgo),
    extending: bool(o.extending),
    waiting: bool(o.waiting),
  };
}

function parseVisualMap(value: unknown): VisualMapInfo | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const v = value as Json;
  const createdAt = str(v.createdAt);
  if (!createdAt) {
    return null;
  }
  return {
    createdAt,
    source: oneOf(v.source, MAP_SOURCES, 'calibration'),
    featurePoints: num(v.featurePoints),
    device: strOrNull(v.device),
    recorded: bool(v.recorded),
  };
}

function parseState(o: Json): SpatialState {
  const cal = o.calibration;
  let calibration: SavedCalibrationInfo | null = null;
  if (cal !== null && typeof cal === 'object' && !Array.isArray(cal)) {
    const c = cal as Json;
    calibration = {
      createdAt: str(c.createdAt),
      rmsError: num(c.rmsError),
      pairs: num(c.pairs) ?? 0,
      source: oneOf(c.source, MAP_SOURCES, 'calibration'),
    };
  }
  return {
    mode: oneOf(o.mode, MODES, 'map'),
    venueId: str(o.venueId),
    modelLoaded: bool(o.modelLoaded),
    hasCalibration: bool(o.hasCalibration),
    calibration,
    arSupported: o.arSupported !== false,
    arRunning: bool(o.arRunning),
    tracking: oneOf(o.tracking, TRACKING, 'notAvailable'),
    trackingReason: strOrNull(o.trackingReason),
    mapping: oneOf(o.mapping, MAPPING, 'notAvailable'),
    relocalized: bool(o.relocalized),
    confidence: oneOf(o.confidence, CONFIDENCES, 'lost'),
    follow: bool(o.follow),
    viewMode: o.viewMode === 'top' ? 'top' : '3d',
    cameraExpanded: bool(o.cameraExpanded),
    cameraPermission: oneOf(o.cameraPermission, PERMISSIONS, 'unknown'),
    autoAvailable: bool(o.autoAvailable),
    lidar: bool(o.lidar),
    trackingLost: bool(o.trackingLost),
    method: method(o.method),
    visualMap: parseVisualMap(o.visualMap),
    visualMapSaving: bool(o.visualMapSaving),
    visualMapBusy: bool(o.visualMapBusy),
    canRecord: bool(o.canRecord),
    canExtend: bool(o.canExtend),
    memoryCheck: o.memoryCheck === true,
    memoryZones:
      typeof o.memoryZones === 'number' && o.memoryZones > 0
        ? Math.floor(o.memoryZones)
        : 0,
    canReplay: bool(o.canReplay),
    replaying: bool(o.replaying),
    recordings: parseRecordings(o.recordings),
    mapView: parseMapView(o.mapView),
    mapPreference: oneOf(o.mapPreference, MAP_PREFERENCES, 'auto'),
    device: parseDevice(o.device),
    placeMode: bool(o.placeMode),
    placed: bool(o.placed),
    walking: bool(o.walking),
    route: parseRoute(o.route),
    places: parsePlaces(o.places),
    nearby: parseNearby(o.nearby),
  };
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

function parsePlaces(value: unknown): Place[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: Place[] = [];
  for (const item of value.slice(0, 200)) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const o = item as Json;
    const name = (o.name && typeof o.name === 'object' ? o.name : {}) as Json;
    if (typeof o.id !== 'string' || !o.id || typeof o.kind !== 'string') {
      continue;
    }
    const ro = typeof name.ro === 'string' ? name.ro : o.id;
    out.push({
      id: o.id,
      kind: o.kind,
      name: { ro, en: typeof name.en === 'string' ? name.en : ro },
      color:
        typeof o.color === 'string' && HEX.test(o.color) ? o.color : '#636366',
    });
  }
  return out;
}

function parseNearby(value: unknown): NearPlace[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: NearPlace[] = [];
  for (const item of value.slice(0, 50)) {
    const o = (item ?? {}) as Json;
    const meters = num(o.meters);
    if (typeof o.id === 'string' && meters !== null && meters >= 0) {
      out.push({ id: o.id, meters: Math.round(meters) });
    }
  }
  return out;
}

function parseRoute(value: unknown): RouteStatus | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const o = value as Json;
  if (typeof o.to !== 'string' || !o.to) {
    return null;
  }
  const meters = num(o.meters) ?? 0;
  const seconds = num(o.seconds) ?? 0;
  return {
    to: o.to,
    meters: Math.max(0, Math.round(meters)),
    seconds: Math.max(0, Math.round(seconds)),
    arrived: bool(o.arrived),
    found: o.found === undefined ? true : bool(o.found),
  };
}

const MAP_KINDS = ['plan', '3d', '2d'] as const;
const MAP_PREFERENCES = ['auto', 'plan', '3d', '2d'] as const;
const MAP_REASONS = [
  'drawn',
  'forced',
  'capable',
  'memory',
  'lowPower',
  'thermal',
  'only3d',
  'only2d',
] as const;
const MAP_SYNC = [
  'idle',
  'checking',
  'downloading',
  'upToDate',
  'noPack',
  'offline',
  'error',
] as const;

function parseMapView(value: unknown): MapViewStatus | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const o = value as Json;
  if (o.kind !== 'plan' && o.kind !== '3d' && o.kind !== '2d') {
    return null;
  }
  const bytes = num(o.bytes);
  const version = num(o.version);
  const available = Array.isArray(o.available)
    ? MAP_KINDS.filter(kind => (o.available as unknown[]).includes(kind))
    : [];
  return {
    kind: o.kind,
    available,
    source: o.source === 'backend' ? 'backend' : 'bundled',
    reason: oneOf(o.reason, MAP_REASONS, 'capable'),
    preference: oneOf(o.preference, MAP_PREFERENCES, 'auto'),
    bytes: bytes !== null && bytes >= 0 ? Math.round(bytes) : null,
    version: version !== null && version > 0 ? Math.round(version) : null,
    sync: oneOf(o.sync, MAP_SYNC, 'idle'),
    syncError: strOrNull(o.syncError),
    backend: bool(o.backend),
  };
}

function parseDevice(value: unknown): DeviceInfo | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const o = value as Json;
  const memoryMB = num(o.memoryMB);
  if (memoryMB === null || memoryMB <= 0) {
    return null;
  }
  const thermal = num(o.thermal) ?? 0;
  return {
    memoryMB: Math.round(memoryMB),
    lowPower: bool(o.lowPower),
    thermal: Math.min(3, Math.max(0, Math.round(thermal))),
  };
}

function parseAuto(o: Json): AutoStatus {
  const progress = num(o.progress) ?? 0;
  const coverage = num(o.coverage) ?? 0;
  return {
    active: bool(o.active),
    available: bool(o.available),
    lidar: bool(o.lidar),
    attempts: num(o.attempts) ?? 0,
    coverage: Math.min(1, Math.max(0, coverage)),
    searching: bool(o.searching),
    points: num(o.points) ?? 0,
    hint: strOrNull(o.hint),
    verdict: strOrNull(o.verdict),
    progress: Math.min(1, Math.max(0, progress)),
    score: num(o.score),
    ambiguity: num(o.ambiguity),
    inliers: num(o.inliers),
    floorSource: strOrNull(o.floorSource),
    elapsed: num(o.elapsed),
    method: method(o.method),
    source:
      typeof o.source === 'string'
        ? oneOf(o.source, SCAN_SOURCES, 'none')
        : null,
    fallbackIn: num(o.fallbackIn),
    only: bool(o.only),
  };
}

function parseName(value: unknown): LocalizedText | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const n = value as Json;
    return { ro: strOrNull(n.ro), en: strOrNull(n.en) };
  }
  return null;
}

function parseVenues(value: unknown): VenueOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const venues: VenueOption[] = [];
  for (const item of value) {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      const v = item as Json;
      const id = str(v.id);
      if (id) {
        venues.push({ id, name: parseName(v.name) });
      }
    }
  }
  return venues;
}

function parseVenue(o: Json): SpatialVenue {
  const name = parseName(o.name);
  return {
    venueId: str(o.venueId),
    found: bool(o.found),
    modelLoaded: bool(o.modelLoaded),
    modelLoading: bool(o.modelLoading),
    name,
    triangles: num(o.triangles),
    size: vec3(o.size),
    venues: parseVenues(o.venues),
  };
}

function parseCalibration(o: Json): CalibrationStatus {
  const pairs: CalibrationPairInfo[] = [];
  if (Array.isArray(o.pairs)) {
    for (const item of o.pairs) {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        const p = item as Json;
        const ar = vec3(p.ar);
        const model = vec3(p.model);
        if (ar && model) {
          pairs.push({ ar, model, error: num(p.error) });
        }
      }
    }
  }
  const warnings = Array.isArray(o.warnings)
    ? o.warnings.filter((w): w is string => typeof w === 'string')
    : [];
  return {
    active: bool(o.active),
    pairs,
    pairCount: num(o.pairCount) ?? pairs.length,
    hasPendingCamera: bool(o.hasPendingCamera),
    hasPendingMap: bool(o.hasPendingMap),
    mapping: oneOf(o.mapping, MAPPING, 'notAvailable'),
    tracking: oneOf(o.tracking, TRACKING, 'notAvailable'),
    saving: bool(o.saving),
    canSave: bool(o.canSave),
    warnings,
    spread: num(o.spread),
    rmsError: num(o.rmsError),
    scale: num(o.scale),
    yawDeg: num(o.yawDeg),
  };
}

export function parseSpatialEvent(name: string, payload: string): SpatialEvent {
  const o = parseObject(payload);
  if (!o) {
    return { type: 'unknown', name, payload };
  }
  switch (name) {
    case 'state':
      return { type: 'state', state: parseState(o) };
    case 'venue':
      return { type: 'venue', venue: parseVenue(o) };
    case 'pose': {
      const x = num(o.x);
      const y = num(o.y);
      const z = num(o.z);
      if (x === null || y === null || z === null) {
        return { type: 'unknown', name, payload };
      }
      return {
        type: 'pose',
        pose: {
          x,
          y,
          z,
          headingDeg: num(o.headingDeg),
          confidence: oneOf(o.confidence, CONFIDENCES, 'lost'),
        },
      };
    }
    case 'guide': {
      const turnDeg = num(o.turnDeg);
      const metersLeft = num(o.metersLeft);
      if (turnDeg === null || metersLeft === null) {
        return { type: 'unknown', name, payload };
      }
      return { type: 'guide', guide: { turnDeg, metersLeft } };
    }
    case 'calibration':
      return { type: 'calibration', calibration: parseCalibration(o) };
    case 'auto':
      return { type: 'auto', auto: parseAuto(o) };
    case 'localized':
      return {
        type: 'localized',
        at: str(o.at),
        seconds: num(o.seconds),
        method: strOrNull(o.method),
      };
    case 'calibrationSaved':
      return {
        type: 'calibrationSaved',
        rmsError: num(o.rmsError),
        pairs: num(o.pairs) ?? 0,
        createdAt: str(o.createdAt),
        worldMapBytes: num(o.worldMapBytes),
      };
    case 'visualMapSaved': {
      const visualMap = parseVisualMap(o);
      if (!visualMap) {
        return { type: 'unknown', name, payload };
      }
      return {
        type: 'visualMapSaved',
        visualMap,
        first: bool(o.first),
        bytes: num(o.bytes),
      };
    }
    case 'recording':
      return { type: 'recording', recording: parseRecordingStatus(o) };
    case 'recordingSaved': {
      const recording = parseRecordingInfo(o);
      if (!recording) {
        return { type: 'unknown', name, payload };
      }
      return { type: 'recordingSaved', recording, verified: bool(o.verified) };
    }
    case 'recordingExport':
    case 'journalExport':
      return {
        type: name,
        status: oneOf(
          o.status,
          ['shared', 'cancelled', 'failed'] as const,
          'cancelled',
        ),
        activity: strOrNull(o.activity),
      };
    case 'visualMapSaveFailed':
      return { type: 'visualMapSaveFailed', message: str(o.message) };
    case 'memoryExtended':
      return {
        type: 'memoryExtended',
        status: oneOf(
          o.status,
          ['installed', 'mismatch', 'smaller', 'failed'] as const,
          'failed',
        ),
        share: num(o.share),
        visualMap: parseVisualMap(o),
      };
    case 'visualMapImport':
      return {
        type: 'visualMapImport',
        status: o.status === 'imported' ? 'imported' : 'cancelled',
        visualMap: parseVisualMap(o),
      };
    case 'visualMapExport':
      return {
        type: 'visualMapExport',
        status: oneOf(
          o.status,
          ['shared', 'cancelled', 'failed'] as const,
          'cancelled',
        ),
        activity: strOrNull(o.activity),
      };
    case 'hint':
      return { type: 'hint', code: str(o.code, 'UNKNOWN') };
    case 'error':
      return {
        type: 'error',
        code: str(o.code, 'UNKNOWN'),
        message: str(o.message),
      };
    default:
      return { type: 'unknown', name, payload };
  }
}

/** Commands understood by the native view (see FlyQSpatialHostView.handle). */
export type SpatialCommand =
  | 'sync'
  | 'startLocalization'
  | 'stopLocalization'
  | 'startCalibration'
  | 'calibrationMarkCamera'
  | 'calibrationConfirmPair'
  | 'calibrationUndo'
  | 'calibrationSave'
  | 'calibrationCancel'
  | 'deleteCalibration'
  | 'exportVisualMap'
  | 'importVisualMap'
  | 'startRecording'
  | 'saveRecording'
  | 'cancelRecording'
  | 'exportRecording'
  | 'exportJournal'
  | 'setMemoryCheck'
  | 'setBackend'
  | 'setMapView'
  | 'setLanguage'
  | 'setPlaceMode'
  | 'clearPlace'
  | 'routeTo'
  | 'clearRoute'
  | 'walkRoute'
  | 'focusLabel'
  | 'startReplay'
  | 'stopReplay'
  | 'setFollow'
  | 'setViewMode'
  | 'recenter'
  | 'overview'
  | 'setCameraExpanded'
  | 'setOverlayInsets';

/** The arguments of 'setLanguage': the language of the map's labels (anything but 'ro' is English). */
export function languageArgs(lang: string): { lang: 'ro' | 'en' } {
  return { lang: lang === 'ro' ? 'ro' : 'en' };
}
