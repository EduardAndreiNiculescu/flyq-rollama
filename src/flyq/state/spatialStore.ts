/**
 * Screen state built from the native spatial events (pure reducer, unit-tested).
 */
import type {
  AutoStatus,
  CalibrationStatus,
  RecordingStatus,
  SpatialEvent,
  SpatialPose,
  SpatialState,
  SpatialVenue,
} from 'flyq-spatial';

export interface Notice {
  id: number;
  kind: 'error' | 'hint' | 'success';
  code: string;
  detail?: string;
}

export interface ScreenState {
  native: SpatialState | null;
  venue: SpatialVenue | null;
  pose: SpatialPose | null;
  calibration: CalibrationStatus | null;
  auto: AutoStatus | null;
  recording: RecordingStatus | null;
  notice: Notice | null;
  localizedSeconds: number | null;
  noticeCounter: number;
  /** Last background save of the visual memory that failed (debug panel only). */
  visualMapError: string | null;
}

export const initialScreenState: ScreenState = {
  native: null,
  venue: null,
  pose: null,
  calibration: null,
  auto: null,
  recording: null,
  notice: null,
  localizedSeconds: null,
  noticeCounter: 0,
  visualMapError: null,
};

export type ScreenAction =
  | { type: 'event'; event: SpatialEvent }
  | { type: 'dismissNotice'; id: number };

function withNotice(
  state: ScreenState,
  kind: Notice['kind'],
  code: string,
  detail?: string,
): ScreenState {
  const id = state.noticeCounter + 1;
  return { ...state, noticeCounter: id, notice: { id, kind, code, detail } };
}

export function screenReducer(
  state: ScreenState,
  action: ScreenAction,
): ScreenState {
  if (action.type === 'dismissNotice') {
    return state.notice && state.notice.id === action.id
      ? { ...state, notice: null }
      : state;
  }
  const event = action.event;
  switch (event.type) {
    case 'state': {
      const next = { ...state, native: event.state };
      // The pose only makes sense while navigating.
      if (event.state.mode !== 'navigating') {
        next.pose = null;
      }
      return next;
    }
    case 'venue':
      return { ...state, venue: event.venue };
    case 'pose':
      return { ...state, pose: event.pose };
    case 'calibration':
      return { ...state, calibration: event.calibration };
    case 'auto':
      return { ...state, auto: event.auto };
    case 'recording':
      return { ...state, recording: event.recording };
    case 'recordingSaved':
      return withNotice(state, 'success', 'RECORDING_SAVED');
    case 'recordingExport':
      if (event.status === 'shared') {
        return withNotice(state, 'success', 'RECORDING_SHARED');
      }
      return event.status === 'failed'
        ? withNotice(state, 'error', 'RECORDING_EXPORT_FAILED')
        : state;
    case 'memoryExtended':
      if (event.status === 'installed') {
        return withNotice(state, 'success', 'MEMORY_EXTENDED');
      }
      return withNotice(
        state,
        'error',
        event.status === 'mismatch'
          ? 'MEMORY_EXTENSION_MISMATCH'
          : event.status === 'smaller'
          ? 'MEMORY_EXTENSION_SMALLER'
          : 'MEMORY_EXTENSION_FAILED',
      );
    case 'journalExport':
      if (event.status === 'shared') {
        return withNotice(state, 'success', 'JOURNAL_SHARED');
      }
      return event.status === 'failed'
        ? withNotice(state, 'error', 'JOURNAL_EXPORT_FAILED')
        : state;
    case 'localized':
      return withNotice(
        { ...state, localizedSeconds: event.seconds },
        'success',
        'LOCALIZED',
      );
    case 'calibrationSaved':
      return withNotice(state, 'success', 'CALIBRATION_SAVED');
    case 'visualMapSaved': {
      // Saved again every half minute while walking: only the first save is worth a notice.
      const next = { ...state, visualMapError: null };
      return event.first
        ? withNotice(next, 'success', 'VISUAL_MAP_SAVED')
        : next;
    }
    case 'visualMapSaveFailed':
      return { ...state, visualMapError: event.message || 'failed' };
    case 'visualMapImport':
      return event.status === 'imported'
        ? withNotice(state, 'success', 'VISUAL_MAP_IMPORTED')
        : state;
    case 'visualMapExport':
      if (event.status === 'shared') {
        return withNotice(state, 'success', 'VISUAL_MAP_SHARED');
      }
      return event.status === 'failed'
        ? withNotice(state, 'error', 'VISUAL_MAP_EXPORT_FAILED')
        : state;
    case 'hint':
      return withNotice(state, 'hint', event.code);
    case 'error':
      return withNotice(state, 'error', event.code, event.message);
    default:
      return state;
  }
}

export type Phase =
  | 'replaying'
  | 'placed'
  | 'loading'
  | 'needsCalibration'
  | 'ready'
  | 'locating'
  | 'navigating'
  | 'calibrating'
  | 'recording'
  | 'unsupported'
  | 'venueMissing';

/** What the bottom panel should show. */
export function phaseOf(state: ScreenState): Phase {
  const native = state.native;
  // A recording needs no venue model: it is shown even while the map is missing or loading.
  if (native?.mode === 'recording') {
    return 'recording';
  }
  if (state.venue && !state.venue.found && !state.venue.modelLoading) {
    return 'venueMissing';
  }
  if (!native || !native.modelLoaded) {
    return 'loading';
  }
  if (native.replaying) {
    return 'replaying';
  }
  if (native.placed && native.mode === 'map') {
    return 'placed';
  }
  if (!native.arSupported) {
    return 'unsupported';
  }
  switch (native.mode) {
    case 'locating':
      return 'locating';
    case 'navigating':
      return 'navigating';
    case 'calibrating':
      return 'calibrating';
    default:
      // A localisation map (automatic) or a saved calibration: the camera can find the user.
      return native.autoAvailable || native.hasCalibration
        ? 'ready'
        : 'needsCalibration';
  }
}

/**
 * True while a guided search runs (camera screen with hints and progress): the automatic
 * localisation, or ARKit recognising the place from the visual memory (phones without LiDAR).
 */
export function isAutoSearching(state: ScreenState): boolean {
  const native = state.native;
  if (!native) {
    return false;
  }
  if (native.method === 'auto') {
    return native.mode === 'locating' || native.trackingLost;
  }
  return native.method === 'worldMap' && native.mode === 'locating';
}

/** Status of the visual memory while a LiDAR iPhone walks (null: nothing to show). */
export type MemoryStatus = 'saving' | 'saved' | 'pending' | 'recorded';

export function memoryStatusOf(state: ScreenState): MemoryStatus | null {
  const native = state.native;
  if (
    !native ||
    !native.lidar ||
    native.method !== 'auto' ||
    native.mode !== 'navigating'
  ) {
    return null;
  }
  if (native.visualMapSaving) {
    return 'saving';
  }
  // A memory from a recording walk stays as it is (the phone does not save over it).
  if (native.visualMap?.recorded) {
    return 'recorded';
  }
  return native.visualMap?.source === 'auto' ? 'saved' : 'pending';
}

/** Which calibration step to explain next. */
export type CalibrationStep =
  | 'scan'
  | 'markCamera'
  | 'markMap'
  | 'more'
  | 'save';

export function calibrationStepOf(
  c: CalibrationStatus | null,
): CalibrationStep {
  if (!c) {
    return 'scan';
  }
  if (c.tracking !== 'normal') {
    return 'scan';
  }
  if (c.hasPendingCamera && !c.hasPendingMap) {
    return 'markMap';
  }
  if (c.hasPendingMap && !c.hasPendingCamera) {
    return 'markCamera';
  }
  if (c.pairCount < 3) {
    return c.pairCount === 0 ? 'markCamera' : 'more';
  }
  return 'save';
}

/**
 * The venue to show instead of the requested one when this build does not ship it (for example
 * the native assets were not reinstalled after an update): the first bundled venue. Null when
 * nothing has to change.
 */
export function venueFallbackOf(
  requested: string,
  venue: SpatialVenue | null,
): string | null {
  if (!venue || venue.found || venue.venueId !== requested) {
    return null;
  }
  if (venue.venues.length === 0 || venue.venues.some(v => v.id === requested)) {
    return null;
  }
  return venue.venues[0].id;
}
