import {
  FlyQSpatialView,
  type FlyQSpatialViewHandle,
  languageArgs,
  type SpatialCommand,
  type SpatialEvent,
  type SpatialState,
} from 'flyq-spatial';
import * as Haptics from 'expo-haptics';
import * as React from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  type LayoutChangeEvent,
  Linking,
  PanResponder,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import { Box, Compass, Search, Settings as SettingsIcon, Square, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CalibrationPanel } from '../components/CalibrationPanel';
import { HapticGuide } from '../lib/hapticGuide';
import { PdrSession } from '../lib/pdr';
import { DebugPanel } from '../components/DebugPanel';
import { FlightCard } from '../components/FlightCard';
import { PlacesBar, placeName, RouteCard } from '../components/PlacesBar';
import { SettingsSheet } from '../components/SettingsSheet';
import { appKey, VENUE_ID } from '../config';
import { useBackend } from '../hooks/useBackend';
import { codeText, type Lang, type StringKey, t } from '../i18n';
import {
  initialScreenState,
  isAutoSearching,
  memoryStatusOf,
  type Phase,
  phaseOf,
  screenReducer,
  venueFallbackOf,
} from '../state/spatialStore';
import { Button } from '../ui/Button';
import { formatCount, formatDuration, formatTime } from '../ui/format';
import { colors } from '../ui/theme';

function statusKey(phase: Phase, native: SpatialState | null): StringKey {
  const confidence = native?.confidence;
  switch (phase) {
    case 'loading':
      return 'loadingMap';
    case 'replaying':
      return 'statusReplaying';
    case 'placed':
      return native?.walking ? 'statusPlacedWalking' : 'statusPlaced';
    case 'venueMissing':
      return 'venueMissing';
    case 'unsupported':
      return 'arUnsupported';
    case 'needsCalibration':
      return 'statusNeedsCalibration';
    case 'locating':
      return 'statusLocating';
    case 'calibrating':
      return 'statusCalibrating';
    case 'recording':
      return 'statusRecording';
    case 'ready':
      return native?.autoAvailable ? 'statusReadyAuto' : 'statusMap';
    case 'navigating':
      if (native?.trackingLost) {
        return 'statusNavigatingRelocating';
      }
      switch (confidence) {
        case 'exact':
          return 'statusNavigatingExact';
        case 'tracked':
          return 'statusNavigatingTracked';
        case 'estimated':
          return 'statusNavigatingEstimated';
        default:
          return 'statusNavigatingLost';
      }
    default:
      return 'statusMap';
  }
}

function statusColor(phase: Phase, confidence: string | undefined): string {
  if (phase === 'placed') {
    return colors.success;
  }
  if (phase === 'navigating') {
    if (confidence === 'exact' || confidence === 'tracked') {
      return colors.success;
    }
    return confidence === 'estimated' ? colors.warning : colors.lost;
  }
  if (
    phase === 'locating' ||
    phase === 'calibrating' ||
    phase === 'recording'
  ) {
    return colors.accentLight;
  }
  if (
    phase === 'needsCalibration' ||
    phase === 'venueMissing' ||
    phase === 'unsupported'
  ) {
    return colors.warning;
  }
  return colors.textMuted;
}

export function MapScreen({ initialRoute }: { initialRoute?: string } = {}) {
  const insets = useSafeAreaInsets();
  const spatialRef = React.useRef<FlyQSpatialViewHandle>(null);
  const [state, dispatch] = React.useReducer(screenReducer, initialScreenState);
  const [lang, setLang] = React.useState<Lang>('ro');
  const [debug, setDebug] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [venueId, setVenueId] = React.useState(VENUE_ID);
  const backend = useBackend();

  const phase = phaseOf(state);
  const native = state.native;

  // A venue this build does not ship: show one it does.
  const fallbackVenue = venueFallbackOf(venueId, state.venue);
  React.useEffect(() => {
    if (fallbackVenue) {
      setVenueId(fallbackVenue);
    }
  }, [fallbackVenue]);

  const send = React.useCallback(
    (command: SpatialCommand, args?: Record<string, unknown>) => {
      spatialRef.current?.send(command, args);
    },
    [],
  );

  // Where the backend is: the native view asks it for newer map views (3D or 2D) and downloads the
  // one this phone shows. Sent again if the native view lost it (a new view instance).
  const nativeKnowsBackend = native?.mapView?.backend === true;
  React.useEffect(() => {
    if (backend.status === 'online') {
      send('setBackend', { url: backend.url, appKey: appKey() });
    }
  }, [backend.status, backend.url, nativeKnowsBackend, send]);
  // The language of the map's labels (points of interest); sent again once a native view reports.
  const nativeReady = native !== null;
  React.useEffect(() => {
    if (nativeReady) {
      send('setLanguage', languageArgs(lang));
    }
  }, [lang, nativeReady, send]);
  // The 2D map is a picture from above: no 3D / top switch.
  const flatMap = native?.mapView?.kind === '2d';

  // Haptic guidance along the route (eyes-free): on by default when a screen reader is running, switchable from the route card
  const [hapticOn, setHapticOn] = React.useState(false);
  React.useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then(on => on && setHapticOn(true));
  }, []);
  const lastPoseRef = React.useRef<{ x: number; z: number } | null>(null);
  const pdrRef = React.useRef<PdrSession | null>(null);
  const [sensorsOn, setSensorsOn] = React.useState(true);
  const hapticOnRef = React.useRef(hapticOn);
  hapticOnRef.current = hapticOn;
  const guide = React.useMemo(
    () =>
      new HapticGuide(
        {
          tap: strong => void Haptics.impactAsync(strong ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light),
          success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
          warning: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
        },
        text => AccessibilityInfo.announceForAccessibility(text),
      ),
    [],
  );
  const onEvent = React.useCallback(
    (event: SpatialEvent) => {
      dispatch({ type: 'event', event });
      if (event.type === 'localized' || event.type === 'calibrationSaved') {
        Vibration.vibrate();
      }
      if (event.type === 'pose') {
        lastPoseRef.current = { x: event.pose.x, z: event.pose.z };
        pdrRef.current?.moveTo(event.pose.x, event.pose.z); // chosen on the map, or the end of a walk: the steps go on from there
      }
      if (event.type === 'guide' && hapticOnRef.current) {
        guide.update(event.guide.turnDeg, event.guide.metersLeft);
      }
    },
    [guide],
  );

  // Ask the native view for a full snapshot once the listener is surely attached.
  React.useEffect(() => {
    const timer = setTimeout(() => send('sync'), 400);
    return () => clearTimeout(timer);
  }, [send]);

  // Tell the native view how much of the screen the overlays cover, so the map (and the small
  // camera preview) use the free area in between.
  const [overlayTop, setOverlayTop] = React.useState(0);
  const [overlayBottom, setOverlayBottom] = React.useState(0);
  // The search bar filters the carousel of places; Enter goes to the first match
  const [query, setQuery] = React.useState('');
  // The bottom sheet can be pulled down to a strip and up again
  const sheetY = React.useRef(new Animated.Value(0)).current;
  const sheetOpen = React.useRef(true);
  const collapsedOffset = React.useRef(0);
  const sheetPan = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: (_, g) => {
          const base = sheetOpen.current ? 0 : collapsedOffset.current;
          sheetY.setValue(Math.min(Math.max(base + g.dy, 0), collapsedOffset.current));
        },
        onPanResponderRelease: (_, g) => {
          const base = sheetOpen.current ? 0 : collapsedOffset.current;
          const open = Math.abs(g.dy) < 4 ? !sheetOpen.current : base + g.dy < collapsedOffset.current / 2;
          sheetOpen.current = open;
          Animated.spring(sheetY, { toValue: open ? 0 : collapsedOffset.current, useNativeDriver: true, bounciness: 0 }).start();
        },
      }),
    [sheetY],
  );
  const onTopLayout = React.useCallback((e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    setOverlayTop(Math.round(y + height));
  }, []);
  const onBottomLayout = React.useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setOverlayBottom(h);
    collapsedOffset.current = Math.max(0, h - 96); // a strip with the handle and the first line stays visible
  }, []);
  React.useEffect(() => {
    const timer = setTimeout(
      () =>
        send('setOverlayInsets', { top: overlayTop, bottom: overlayBottom }),
      60,
    );
    return () => clearTimeout(timer);
  }, [send, overlayTop, overlayBottom, native?.mode]);

  // Notices disappear on their own.
  const notice = state.notice;
  React.useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = setTimeout(
      () => dispatch({ type: 'dismissNotice', id: notice.id }),
      notice.kind === 'error' ? 6000 : 4000,
    );
    return () => clearTimeout(timer);
  }, [notice]);

  const venueName =
    state.venue?.name?.[lang] ?? state.venue?.venueId ?? venueId;
  const confidence = native?.confidence;
  const showFlight =
    backend.flight !== null &&
    (phase === 'ready' ||
      phase === 'navigating' ||
      phase === 'needsCalibration');

  const startCalibration = () => {
    setSettingsOpen(false);
    send('startCalibration');
  };

  const autoSearching = isAutoSearching(state);
  const memorySearch = native?.method === 'worldMap';
  const auto = state.auto;
  const locatingBody: StringKey = auto?.only
    ? memorySearch
      ? 'locatingOnlyMemoryBody'
      : 'locatingOnlyWallsBody'
    : memorySearch
    ? 'locatingMemoryBody'
    : 'locatingAutoBody';
  const autoHint =
    autoSearching && auto?.hint ? codeText(lang, 'auto_', auto.hint) : null;

  // LiDAR iPhone walking with the automatic method: is the visual memory for the others saved?
  const memoryStatus = memoryStatusOf(state);
  let memoryLine: string | null = null;
  if (memoryStatus === 'saving') {
    memoryLine = t(lang, 'memoryStatusSaving');
  } else if (memoryStatus === 'pending') {
    memoryLine = t(lang, 'memoryStatusPending');
  } else if (
    (memoryStatus === 'saved' || memoryStatus === 'recorded') &&
    native?.visualMap
  ) {
    const at = formatTime(native.visualMap.createdAt);
    const points = native.visualMap.featurePoints;
    memoryLine = [
      t(
        lang,
        memoryStatus === 'recorded'
          ? 'memoryStatusRecorded'
          : 'memoryStatusSaved',
      ),
      at,
      points !== null
        ? `${formatCount(points, lang)} ${t(lang, 'visualMemoryPoints')}`
        : null,
      native.memoryZones > 1
        ? `${native.memoryZones} ${t(lang, 'memoryZones')}`
        : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  const renderAutoProgress = () => (
    <View style={styles.gap}>
      <Text style={styles.hintText}>
        {autoHint ?? t(lang, 'auto_AUTO_LOOK_AROUND')}
      </Text>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.round((auto?.progress ?? 0) * 100)}%` },
          ]}
        />
      </View>
    </View>
  );

  const places = native?.places ?? [];
  const plain = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const filteredPlaces = query.trim() ? places.filter(p => plain(placeName(p, lang)).includes(plain(query.trim()))) : places;
  // Compass + steps move the pin when the user was put on the map (no camera): the accelerometer counts steps, the compass gives the way
  const placedNow = native?.placed ?? false;
  const walkingNow = native?.walking ?? false;
  React.useEffect(() => {
    if (!placedNow || walkingNow || !sensorsOn || !lastPoseRef.current) {
      pdrRef.current?.stop();
      pdrRef.current = null;
      return;
    }
    const session = new PdrSession(lastPoseRef.current.x, lastPoseRef.current.z, {
      onPose: pose => send('setPose', pose),
      onHeading: headingDeg => send('setHeading', { headingDeg }),
    });
    pdrRef.current = session;
    void session.start();
    return () => {
      session.stop();
      if (pdrRef.current === session) {
        pdrRef.current = null;
      }
    };
  }, [placedNow, walkingNow, sensorsOn, send]);

  // Opened from the assistant ("where is ..."): the route to that place starts once the map knows its places
  const routedInitial = React.useRef(false);
  React.useEffect(() => {
    if (initialRoute && !routedInitial.current && places.some(p => p.id === initialRoute)) {
      routedInitial.current = true;
      send('routeTo', { id: initialRoute });
    }
  }, [initialRoute, places, send]);
  const route = native?.route ?? null;
  const routePlace = route ? places.find(p => p.id === route.to) : undefined;
  // The route ended or was cleared: the guide stops; arrival is felt once
  const arrived = route?.arrived ?? false;
  const hasRoute = route !== null;
  React.useEffect(() => {
    if (arrived && hapticOnRef.current) {
      guide.arrived();
    } else if (!hasRoute || !hapticOn) {
      guide.stop();
    }
  }, [arrived, hasRoute, hapticOn, guide]);
  const renderRoute = () =>
    route ? (
      <>
        <RouteCard
        route={route}
        place={routePlace}
        lang={lang}
        canWalk={native?.placed ?? false}
        walking={native?.walking ?? false}
        onWalk={() => send('walkRoute')}
        onClear={() => send('clearRoute')}
        />
        <Button
          label={lang === 'ro' ? (sensorsOn ? 'Senzori (busolă + pași): pornit' : 'Senzori (busolă + pași): oprit') : sensorsOn ? 'Sensors (compass + steps): on' : 'Sensors (compass + steps): off'}
          compact
          onPress={() => setSensorsOn(v => !v)}
        />
        <Button
          label={lang === 'ro' ? (hapticOn ? 'Ghid haptic: pornit' : 'Ghid haptic: oprit') : hapticOn ? 'Haptic guide: on' : 'Haptic guide: off'}
          compact
          onPress={() => setHapticOn(v => !v)}
        />
      </>
    ) : null;

  const renderPanel = () => {
    switch (phase) {
      case 'placed':
        return (
          <View style={styles.gap}>
            {route ? (
              renderRoute()
            ) : (
              <>
                <Text style={styles.panelTitle}>{t(lang, 'placedTitle')}</Text>
                <Text style={styles.panelSmall}>{t(lang, 'placedBody')}</Text>
              </>
            )}
            <View style={styles.row}>
              <Button
                label={
                  native?.follow ? t(lang, 'following') : t(lang, 'follow')
                }
                compact
                active={native?.follow ?? false}
                onPress={() =>
                  native?.follow
                    ? send('setFollow', { enabled: false })
                    : send('recenter')
                }
                style={styles.flex1}
              />
              <Button
                label={
                  native?.viewMode === 'top'
                    ? t(lang, 'view3d')
                    : t(lang, 'topView')
                }
                compact
                onPress={() =>
                  send('setViewMode', {
                    mode: native?.viewMode === 'top' ? '3d' : 'top',
                  })
                }
                style={styles.flex1}
              />
              <Button
                label={t(lang, 'placeLeave')}
                compact
                onPress={() => send('clearPlace')}
                style={styles.flex1}
              />
            </View>
          </View>
        );
      case 'replaying':
        return (
          <View style={styles.gap}>
            <Text style={styles.panelText}>{t(lang, 'replayBody')}</Text>
            <Button
              label={t(lang, 'stopReplay')}
              onPress={() => send('stopReplay')}
            />
          </View>
        );
      case 'loading':
        return (
          <View style={styles.centerRow}>
            <ActivityIndicator color={colors.accentLight} />
            <Text style={styles.panelText}>{t(lang, 'loadingMap')}</Text>
          </View>
        );
      case 'venueMissing':
      case 'unsupported':
        return (
          <Text style={styles.panelText}>
            {t(lang, statusKey(phase, native))}
          </Text>
        );
      case 'needsCalibration':
        return (
          <View style={styles.gap}>
            <Text style={styles.panelText}>
              {t(lang, 'statusNeedsCalibration')}
            </Text>
            <Button
              label={t(lang, 'calibrate')}
              variant="primary"
              onPress={startCalibration}
            />
            <View style={styles.row}>
              {flatMap ? null : (
                <Button
                  label={
                    native?.viewMode === 'top'
                      ? t(lang, 'view3d')
                      : t(lang, 'topView')
                  }
                  compact
                  onPress={() =>
                    send('setViewMode', {
                      mode: native?.viewMode === 'top' ? '3d' : 'top',
                    })
                  }
                  style={styles.flex1}
                />
              )}
              <Button
                label={t(lang, 'settings')}
                compact
                onPress={() => setSettingsOpen(true)}
                style={styles.flex1}
              />
            </View>
          </View>
        );
      case 'ready':
        return (
          <View style={styles.gap}>
            <Button
              label={t(lang, 'findMe')}
              variant="primary"
              onPress={() => send('startLocalization')}
            />
            <View style={styles.row}>
              {flatMap ? null : (
                <Button
                  label={
                    native?.viewMode === 'top'
                      ? t(lang, 'view3d')
                      : t(lang, 'topView')
                  }
                  compact
                  onPress={() =>
                    send('setViewMode', {
                      mode: native?.viewMode === 'top' ? '3d' : 'top',
                    })
                  }
                  style={styles.flex1}
                />
              )}
              <Button
                label={t(lang, 'overview')}
                compact
                onPress={() => send('overview')}
                style={styles.flex1}
              />
              <Button
                label={t(lang, 'settings')}
                compact
                onPress={() => setSettingsOpen(true)}
                style={styles.flex1}
              />
            </View>
          </View>
        );
      case 'locating':
        if (autoSearching) {
          return (
            <View style={styles.gap}>
              <Text style={styles.panelTitle}>
                {t(
                  lang,
                  memorySearch ? 'locatingMemoryTitle' : 'locatingAutoTitle',
                )}
              </Text>
              {renderAutoProgress()}
              <Text style={styles.panelSmall}>{t(lang, locatingBody)}</Text>
              <Button
                label={t(lang, 'cancel')}
                onPress={() => send('stopLocalization')}
              />
            </View>
          );
        }
        return (
          <View style={styles.gap}>
            <Text style={styles.panelTitle}>{t(lang, 'locatingTitle')}</Text>
            <Text style={styles.panelText}>{t(lang, 'locatingBody')}</Text>
            <Button
              label={t(lang, 'cancel')}
              onPress={() => send('stopLocalization')}
            />
          </View>
        );
      case 'navigating':
        return (
          <View style={styles.gap}>
            {renderRoute()}
            {autoSearching ? renderAutoProgress() : null}
            {memoryLine ? (
              <Text style={styles.panelSmall} numberOfLines={2}>
                {memoryLine}
              </Text>
            ) : null}
            <View style={styles.row}>
              <Button
                label={
                  native?.follow ? t(lang, 'following') : t(lang, 'follow')
                }
                compact
                active={native?.follow ?? false}
                onPress={() =>
                  native?.follow
                    ? send('setFollow', { enabled: false })
                    : send('recenter')
                }
                style={styles.flex1}
              />
              {flatMap ? null : (
                <Button
                  label={
                    native?.viewMode === 'top'
                      ? t(lang, 'view3d')
                      : t(lang, 'topView')
                  }
                  compact
                  onPress={() =>
                    send('setViewMode', {
                      mode: native?.viewMode === 'top' ? '3d' : 'top',
                    })
                  }
                  style={styles.flex1}
                />
              )}
              <Button
                label={
                  native?.cameraExpanded
                    ? t(lang, 'smallCamera')
                    : t(lang, 'bigCamera')
                }
                compact
                onPress={() =>
                  send('setCameraExpanded', {
                    expanded: !native?.cameraExpanded,
                  })
                }
                style={styles.flex1}
              />
              <Button
                label={t(lang, 'stop')}
                compact
                variant="danger"
                onPress={() => send('stopLocalization')}
                style={styles.flex1}
              />
            </View>
          </View>
        );
      case 'recording': {
        const rec = state.recording;
        const hint = rec?.hint ? codeText(lang, 'rec_', rec.hint) : null;
        const mappingKey: StringKey =
          rec?.mapping === 'mapped'
            ? 'mappingMapped'
            : rec?.mapping === 'extending'
            ? 'mappingExtending'
            : rec?.mapping === 'limited'
            ? 'mappingLimited'
            : 'mappingNotAvailable';
        const stats = [
          formatDuration(rec?.seconds ?? 0),
          `${Math.round(rec?.distance ?? 0)} m`,
          `${t(lang, 'mapping')}: ${t(lang, mappingKey)}`,
        ];
        if (rec?.checkpointAgo !== null && rec?.checkpointAgo !== undefined) {
          stats.push(
            `${t(lang, 'recordingAutoSaved')} ${formatDuration(
              rec.checkpointAgo,
            )}`,
          );
        }
        return (
          <View style={styles.gap}>
            <Text style={styles.panelTitle}>
              {t(
                lang,
                rec?.extending ? 'recordingTitleExtend' : 'recordingTitle',
              )}
            </Text>
            <Text style={styles.hintText}>
              {hint ?? t(lang, 'rec_REC_WALK')}
            </Text>
            <Text style={styles.panelSmall}>{stats.join(' · ')}</Text>
            <View style={styles.row}>
              <Button
                label={rec?.saving ? t(lang, 'saving') : t(lang, 'save')}
                variant="primary"
                disabled={!rec?.canSave}
                onPress={() => send('saveRecording')}
                style={styles.flex1}
              />
              <Button
                label={t(lang, 'stopRecording')}
                disabled={rec?.saving ?? false}
                onPress={() =>
                  Alert.alert(
                    t(lang, 'recordingCancelTitle'),
                    t(lang, 'recordingCancelBody'),
                    [
                      { text: t(lang, 'keepRecording'), style: 'cancel' },
                      {
                        text: t(lang, 'stopRecording'),
                        style: 'destructive',
                        onPress: () => send('cancelRecording'),
                      },
                    ],
                  )
                }
                style={styles.flex1}
              />
            </View>
          </View>
        );
      }
      case 'calibrating':
        return (
          <CalibrationPanel
            lang={lang}
            calibration={state.calibration}
            onMarkCamera={() => send('calibrationMarkCamera')}
            onUndo={() => send('calibrationUndo')}
            onSave={() => send('calibrationSave')}
            onExit={() => send('calibrationCancel')}
          />
        );
      default:
        return null;
    }
  };

  const noticeText = notice ? codeText(lang, 'notice_', notice.code) : null;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <FlyQSpatialView
        ref={spatialRef}
        style={StyleSheet.absoluteFill}
        venueId={venueId}
        debugEnabled={debug}
        onEvent={onEvent}
      />

      <View
        pointerEvents="box-none"
        style={[styles.top, { paddingTop: insets.top + 6 }]}
      >
        <View
          pointerEvents="box-none"
          onLayout={onTopLayout}
          style={styles.gapSmall}
        >
          <View style={styles.searchBar}>
            <Search size={18} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={lang === 'ro' ? 'Caută un loc: toalete, ieșire, cafenea…' : 'Search a place: restroom, exit, café…'}
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
              onSubmitEditing={() => {
                const match = filteredPlaces[0];
                if (match) {
                  send('routeTo', { id: match.id });
                  setQuery('');
                }
              }}
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery('')} accessibilityLabel={lang === 'ro' ? 'Șterge' : 'Clear'} hitSlop={10}>
                <X size={18} color={colors.textMuted} />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  backend.refresh();
                  setSettingsOpen(true);
                }}
                onLongPress={() => setDebug(value => !value)}
                accessibilityLabel={lang === 'ro' ? 'Setări' : 'Settings'}
                hitSlop={10}
              >
                <SettingsIcon size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </View>

          {places.length > 0 &&
          phase !== 'calibrating' &&
          phase !== 'recording' ? (
            <PlacesBar
              places={filteredPlaces}
              nearby={native?.nearby ?? []}
              activeId={route?.to ?? null}
              lang={lang}
              onPick={id => send('routeTo', { id })}
            />
          ) : null}
          {native?.placeMode ? (
            <View style={styles.placeHint}>
              <Text style={styles.placeHintText}>{t(lang, 'placeHint')}</Text>
            </View>
          ) : null}
        </View>

        {showFlight && backend.flight ? (
          <FlightCard flight={backend.flight} lang={lang} />
        ) : null}

        {noticeText ? (
          <Pressable
            onPress={() =>
              notice && dispatch({ type: 'dismissNotice', id: notice.id })
            }
            style={[
              styles.notice,
              notice?.kind === 'error'
                ? styles.noticeError
                : notice?.kind === 'success'
                ? styles.noticeSuccess
                : styles.noticeHint,
            ]}
          >
            <Text style={styles.noticeText}>{noticeText}</Text>
            {notice?.code === 'CAMERA_DENIED' ? (
              <Button
                label={t(lang, 'openSettings')}
                compact
                variant="ghost"
                onPress={() => Linking.openSettings()}
              />
            ) : null}
          </Pressable>
        ) : null}
      </View>

      <Animated.View pointerEvents="box-none" style={[styles.bottomWrap, { transform: [{ translateY: sheetY }] }]}>
        {/* The two round buttons ride on the sheet: back to me (compass) and 3D / 2D from above */}
        {native ? (
          <View pointerEvents="box-none" style={styles.fabColumn}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={lang === 'ro' ? 'Centrează pe mine' : 'Centre on me'}
              onPress={() => {
                send('recenter');
                send('setFollow', { enabled: true });
              }}
              style={styles.roundButton}
            >
              <Compass size={26} color={colors.accent} strokeWidth={2.2} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={lang === 'ro' ? 'Comută 3D / 2D' : 'Toggle 3D / 2D'}
              onPress={() => send('setViewMode', { mode: native.viewMode === 'top' ? 'perspective' : 'top' })}
              style={styles.roundButton}
            >
              {native.viewMode === 'top' ? <Box size={24} color={colors.accent} strokeWidth={2.2} /> : <Square size={22} color={colors.accent} strokeWidth={2.2} />}
              <Text style={styles.roundLabel}>{native.viewMode === 'top' ? '3D' : '2D'}</Text>
            </Pressable>
          </View>
        ) : null}
        {debug ? (
          <View style={styles.debugWrap} pointerEvents="none">
            <DebugPanel
              native={native}
              pose={state.pose}
              calibration={state.calibration}
              auto={state.auto}
              backend={backend}
              localizedSeconds={state.localizedSeconds}
              visualMapError={state.visualMapError}
            />
          </View>
        ) : null}
        <View
          onLayout={onBottomLayout}
          style={[styles.panel, { paddingBottom: insets.bottom + 12 }]}
        >
          <View {...sheetPan.panHandlers} style={styles.grabber} accessibilityLabel={lang === 'ro' ? 'Trage panoul' : 'Drag the panel'}>
            <View style={styles.grabberBar} />
          </View>
          {renderPanel()}
          {native && !native.placeMode && phase !== 'calibrating' && phase !== 'recording' ? (
            <Button
              label={native.placed ? t(lang, 'placeMove') : t(lang, 'placeMe')}
              compact
              variant="secondary"
              onPress={() => send('setPlaceMode', { enabled: true })}
            />
          ) : null}
        </View>
      </Animated.View>

      <SettingsSheet
        visible={settingsOpen}
        lang={lang}
        debug={debug}
        native={native}
        backend={backend}
        venues={state.venue?.venues ?? []}
        venueId={venueId}
        onVenue={id => {
          if (id !== venueId) {
            setSettingsOpen(false);
            setVenueId(id);
          }
        }}
        onClose={() => setSettingsOpen(false)}
        onLang={setLang}
        onDebug={setDebug}
        onRecalibrate={startCalibration}
        onDeleteCalibration={() => {
          setSettingsOpen(false);
          send('deleteCalibration');
        }}
        onExportVisualMap={() => send('exportVisualMap')}
        onImportVisualMap={() => send('importVisualMap')}
        onStartRecording={extend => {
          setSettingsOpen(false);
          send('startRecording', { extend });
        }}
        onExportRecording={file => send('exportRecording', { file })}
        onTestMethod={method => {
          setSettingsOpen(false);
          send('startLocalization', { method, only: true });
        }}
        onExportJournal={() => send('exportJournal')}
        onReplay={() => {
          setSettingsOpen(false);
          send('startReplay');
        }}
        onMemoryCheck={enabled => send('setMemoryCheck', { enabled })}
        onMapView={preference => send('setMapView', { preference })}
        notice={
          notice && noticeText ? { kind: notice.kind, text: noticeText } : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  placeHint: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  placeHintText: {
    color: '#0F172A',
    fontSize: 14,
  },
  compassWrap: {
    position: 'absolute',
    right: 16,
  },
  compassButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  searchBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: colors.panelBorder,
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  fabColumn: {
    alignItems: 'flex-end',
    bottom: '100%',
    gap: 10,
    marginBottom: 12,
    paddingRight: 16,
    position: 'absolute',
    right: 0,
  },
  roundButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    width: 56,
    elevation: 5,
  },
  roundLabel: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
    marginTop: -1,
  },
  grabber: {
    alignItems: 'center',
    paddingBottom: 10,
    paddingTop: 2,
  },
  grabberBar: {
    backgroundColor: 'rgba(15, 23, 42, 0.18)',
    borderRadius: 3,
    height: 5,
    width: 44,
  },
  placeFabWrap: {
    position: 'absolute',
    right: 16,
  },
  placeFab: {
    backgroundColor: '#0A84FF',
    borderRadius: 26,
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 5,
  },
  placeFabOn: {
    backgroundColor: '#475569',
  },
  placeFabText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  top: {
    gap: 8,
    left: 0,
    paddingHorizontal: 12,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  titleBox: {
    backgroundColor: colors.panel,
    borderColor: colors.panelBorder,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    flexShrink: 1,
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  appName: {
    color: colors.accentLight,
    fontSize: 15,
    fontWeight: '800',
  },
  venue: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  backendChip: {
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderColor: colors.panelBorder,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  backendDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  dotOnline: {
    backgroundColor: colors.success,
  },
  dotOffline: {
    backgroundColor: colors.danger,
  },
  dotChecking: {
    backgroundColor: colors.lost,
  },
  backendText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  statusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.panel,
    borderColor: colors.panelBorder,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  statusText: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  notice: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeError: {
    backgroundColor: 'rgba(160, 30, 40, 0.95)',
  },
  noticeHint: {
    backgroundColor: 'rgba(46, 91, 255, 0.95)',
  },
  noticeSuccess: {
    backgroundColor: 'rgba(16, 140, 90, 0.95)',
  },
  noticeText: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  bottomWrap: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  debugWrap: {
    marginBottom: 8,
    marginHorizontal: 12,
  },
  panel: {
    backgroundColor: colors.panel,
    borderColor: colors.panelBorder,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  panelTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  panelText: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 20,
  },
  panelSmall: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  hintText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  progressTrack: {
    backgroundColor: colors.card,
    borderRadius: 4,
    height: 8,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: colors.accent,
    borderRadius: 4,
    height: 8,
  },
  centerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  gap: {
    gap: 10,
  },
  gapSmall: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  flex1: {
    flex: 1,
  },
});
