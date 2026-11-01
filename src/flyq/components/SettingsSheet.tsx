import type {
  MapViewPreference,
  RecordingInfo,
  SpatialState,
  VenueOption,
  VisualMapSource,
} from 'flyq-spatial';
import * as React from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BackendInfo } from '../hooks/useBackend';
import { type Lang, type StringKey, t } from '../i18n';
import { Button } from '../ui/Button';
import {
  formatBytes,
  formatCount,
  formatDateTime,
  formatDuration,
} from '../ui/format';
import { colors } from '../ui/theme';

interface Props {
  visible: boolean;
  lang: Lang;
  debug: boolean;
  native: SpatialState | null;
  backend: BackendInfo;
  /** Venues bundled with the app; the switch is shown only when there are several. */
  venues: VenueOption[];
  venueId: string;
  onVenue: (venueId: string) => void;
  onClose: () => void;
  onLang: (lang: Lang) => void;
  onDebug: (value: boolean) => void;
  onRecalibrate: () => void;
  onDeleteCalibration: () => void;
  onExportVisualMap: () => void;
  onImportVisualMap: () => void;
  onStartRecording: (extend: boolean) => void;
  onExportRecording: (file: string) => void;
  /** Search with one method only (no switching), to test it. */
  onTestMethod: (method: 'worldMap' | 'auto') => void;
  onExportJournal: () => void;
  onReplay: () => void;
  onMemoryCheck: (enabled: boolean) => void;
  /** Settings choice for the map view: automatic, always 3D or always 2D. */
  onMapView: (preference: MapViewPreference) => void;
  /** The latest notice, repeated here because the sheet covers the map screen. */
  notice?: { kind: 'error' | 'hint' | 'success'; text: string } | null;
}

const SOURCE_KEYS: Record<VisualMapSource, StringKey> = {
  auto: 'visualMemorySource_auto',
  calibration: 'visualMemorySource_calibration',
  import: 'visualMemorySource_import',
  bundled: 'visualMemorySource_bundled',
  extended: 'visualMemorySource_extended',
};

const MAP_VIEW_CHOICES: { value: MapViewPreference; key: StringKey }[] = [
  { value: 'auto', key: 'mapViewAuto' },
  { value: 'plan', key: 'mapViewPlan' },
  { value: '3d', key: 'mapView3d' },
  { value: '2d', key: 'mapView2d' },
];

/** The choices worth showing: "Automatic" and the views the phone has (all of them for older native views). */
export function mapViewChoices(
  native: SpatialState | null,
): MapViewPreference[] {
  const available = native?.mapView?.available ?? [];
  return MAP_VIEW_CHOICES.map(c => c.value).filter(
    value =>
      value === 'auto' || available.length === 0 || available.includes(value),
  );
}

/** "Now: 3D model · the phone can take it · from the backend (v3) · 3.9 MB · up to date" */
export function mapViewLine(lang: Lang, native: SpatialState | null): string {
  const view = native?.mapView;
  if (!view) {
    return '–';
  }
  const parts = [
    `${t(lang, 'mapViewNow')}: ${t(lang, `mapViewKind_${view.kind}`)}`,
    t(lang, `mapViewReason_${view.reason}`),
    view.source === 'backend' && view.version !== null
      ? `${t(lang, 'mapViewSource_backend')} (v${view.version})`
      : t(lang, `mapViewSource_${view.source}`),
  ];
  if (view.bytes !== null) {
    parts.push(formatBytes(view.bytes, lang));
  }
  const sync = view.backend ? t(lang, `mapViewSync_${view.sync}`) : '';
  if (sync) {
    parts.push(sync);
  }
  return parts.join(' · ');
}

/** "30.10.2026, 10:12 · made automatically (LiDAR) · 12,345 points" */
export function visualMemoryLine(
  lang: Lang,
  native: SpatialState | null,
): string {
  const memory = native?.visualMap ?? null;
  if (!memory) {
    return t(lang, 'visualMemoryNone');
  }
  const parts = [
    formatDateTime(memory.createdAt) ?? memory.createdAt,
    t(lang, SOURCE_KEYS[memory.source]),
  ];
  if (memory.featurePoints !== null) {
    parts.push(
      `${formatCount(memory.featurePoints, lang)} ${t(
        lang,
        'visualMemoryPoints',
      )}`,
    );
  }
  return parts.join(' · ');
}

/** "30.10.2026, 15:20 · 4:12 · 210 m · 3,2 MB" (+ "unfinished" for an automatic checkpoint). */
export function recordingLine(lang: Lang, rec: RecordingInfo): string {
  const parts = [formatDateTime(rec.createdAt) ?? rec.createdAt];
  if (rec.seconds !== null) {
    parts.push(formatDuration(rec.seconds));
  }
  if (rec.distance !== null) {
    parts.push(`${Math.round(rec.distance)} m`);
  }
  parts.push(formatBytes(rec.bytes, lang));
  if (rec.inProgress) {
    parts.push(t(lang, 'recordingInProgress'));
  }
  return parts.join(' · ');
}

/**
 * Something to send: a saved memory, or a LiDAR iPhone that is localised right now (it saves a
 * fresh one first).
 */
export function canExportVisualMap(native: SpatialState | null): boolean {
  if (!native) {
    return false;
  }
  return (
    native.visualMap !== null ||
    (native.lidar && native.method === 'auto' && native.mode === 'navigating')
  );
}

export function SettingsSheet(props: Props) {
  const {
    visible,
    lang,
    debug,
    native,
    backend,
    venues,
    venueId,
    onVenue,
    onClose,
    onLang,
    onDebug,
    onRecalibrate,
    onDeleteCalibration,
    onExportVisualMap,
    onImportVisualMap,
    onStartRecording,
    onExportRecording,
    onTestMethod,
    onExportJournal,
    onReplay,
    onMemoryCheck,
    onMapView,
    notice,
  } = props;
  const insets = useSafeAreaInsets();

  const confirmDelete = () => {
    Alert.alert(t(lang, 'deleteVisualMap'), t(lang, 'deleteVisualMapConfirm'), [
      { text: t(lang, 'cancel'), style: 'cancel' },
      {
        text: t(lang, 'delete'),
        style: 'destructive',
        onPress: onDeleteCalibration,
      },
    ]);
  };

  const busy =
    (native?.visualMapBusy ?? false) || (native?.visualMapSaving ?? false);
  const idle =
    native !== null &&
    native.modelLoaded &&
    native.arSupported &&
    native.mode !== 'recording' &&
    native.mode !== 'calibrating';
  const canTestMemory = idle && native.hasCalibration;
  const canTestWalls = idle && native.lidar && native.autoAvailable;
  const recordings = native?.recordings ?? [];
  const backendLabel =
    backend.status === 'online'
      ? `${t(lang, 'backendOnline')}${
          backend.version ? ` (v${backend.version})` : ''
        }`
      : backend.status === 'offline'
      ? t(lang, 'backendOffline')
      : t(lang, 'backendChecking');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel={t(lang, 'close')}
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{t(lang, 'settings')}</Text>

          {notice ? (
            <View
              style={[
                styles.notice,
                notice.kind === 'error'
                  ? styles.noticeError
                  : notice.kind === 'success'
                  ? styles.noticeSuccess
                  : styles.noticeHint,
              ]}
            >
              <Text style={styles.noticeText}>{notice.text}</Text>
            </View>
          ) : null}

          <View style={styles.row}>
            <Text style={styles.label}>{t(lang, 'language')}</Text>
            <View style={styles.langs}>
              <Button
                label="RO"
                compact
                active={lang === 'ro'}
                onPress={() => onLang('ro')}
              />
              <Button
                label="EN"
                compact
                active={lang === 'en'}
                onPress={() => onLang('en')}
              />
            </View>
          </View>

          {venues.length > 1 ? (
            <View style={styles.venueBlock}>
              <Text style={styles.label}>{t(lang, 'venueLabel')}</Text>
              <View style={styles.venues}>
                {venues.map(venue => (
                  <Button
                    key={venue.id}
                    label={venue.name?.[lang] ?? venue.name?.ro ?? venue.id}
                    compact
                    active={venue.id === venueId}
                    onPress={() => onVenue(venue.id)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {native?.mapView ? (
            <View style={styles.info}>
              <Text style={styles.sectionTitle}>{t(lang, 'mapViewTitle')}</Text>
              <View style={styles.venues}>
                {MAP_VIEW_CHOICES.filter(choice =>
                  mapViewChoices(native).includes(choice.value),
                ).map(choice => (
                  <Button
                    key={choice.value}
                    label={t(lang, choice.key)}
                    compact
                    active={native.mapPreference === choice.value}
                    onPress={() => onMapView(choice.value)}
                  />
                ))}
              </View>
              <Text style={styles.infoText}>{mapViewLine(lang, native)}</Text>
              <Text style={styles.infoMuted}>{t(lang, 'mapViewHelp')}</Text>
            </View>
          ) : null}

          <View style={styles.row}>
            <Text style={styles.label}>{t(lang, 'debugMode')}</Text>
            <Switch value={debug} onValueChange={onDebug} />
          </View>

          <View style={styles.info}>
            <Text style={styles.sectionTitle}>{t(lang, 'visualMemory')}</Text>
            <Text style={styles.infoText}>
              {visualMemoryLine(lang, native)}
            </Text>
            <Text style={styles.infoMuted}>{t(lang, 'visualMemoryHelp')}</Text>
            <View style={styles.buttonRow}>
              <Button
                label={busy ? t(lang, 'working') : t(lang, 'exportVisualMap')}
                compact
                onPress={onExportVisualMap}
                disabled={busy || !canExportVisualMap(native)}
                style={styles.flex1}
              />
              <Button
                label={t(lang, 'importVisualMap')}
                compact
                onPress={onImportVisualMap}
                disabled={busy || !native?.modelLoaded}
                style={styles.flex1}
              />
            </View>
            {native?.canExtend ? (
              <View style={styles.recordBlock}>
                <Button
                  label={t(lang, 'extendMemory')}
                  compact
                  onPress={() => onStartRecording(true)}
                  disabled={busy}
                />
                <Text style={styles.infoMuted}>
                  {t(lang, 'extendMemoryHelp')}
                </Text>
              </View>
            ) : null}
            {native?.canRecord ? (
              <View style={styles.recordBlock}>
                <Button
                  label={t(lang, 'recordMemory')}
                  compact
                  onPress={() => onStartRecording(false)}
                  disabled={busy}
                />
                <Text style={styles.infoMuted}>
                  {t(lang, 'recordMemoryHelp')}
                </Text>
              </View>
            ) : null}
            {recordings.length > 0 ? (
              <View style={styles.recordBlock}>
                <Text style={styles.infoText}>{t(lang, 'recordings')}</Text>
                {recordings.slice(0, 12).map(rec => (
                  <View key={rec.file} style={styles.recordRow}>
                    <Text style={[styles.infoText, styles.flex1]}>
                      {recordingLine(lang, rec)}
                    </Text>
                    <Button
                      label={t(lang, 'sendRecording')}
                      compact
                      onPress={() => onExportRecording(rec.file)}
                    />
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {native ? (
            <View style={styles.info}>
              <Text style={styles.sectionTitle}>
                {t(lang, 'testLocalization')}
              </Text>
              <View style={styles.buttonRow}>
                {canTestMemory ? (
                  <Button
                    label={t(lang, 'testMemoryOnly')}
                    compact
                    onPress={() => onTestMethod('worldMap')}
                    disabled={busy}
                    style={styles.flex1}
                  />
                ) : null}
                {canTestWalls ? (
                  <Button
                    label={t(lang, 'testWallsOnly')}
                    compact
                    onPress={() => onTestMethod('auto')}
                    disabled={busy}
                    style={styles.flex1}
                  />
                ) : null}
              </View>
              {canTestMemory || canTestWalls ? (
                <Text style={styles.infoMuted}>{t(lang, 'testHelp')}</Text>
              ) : null}
              {native.canReplay ? (
                <View style={styles.recordBlock}>
                  <Button
                    label={t(lang, 'demoReplay')}
                    compact
                    onPress={onReplay}
                    disabled={busy}
                  />
                  <Text style={styles.infoMuted}>
                    {t(lang, 'demoReplayHelp')}
                  </Text>
                </View>
              ) : null}
              {native.lidar ? (
                <View style={styles.recordBlock}>
                  <View style={styles.row}>
                    <Text style={[styles.infoText, styles.flex1]}>
                      {t(lang, 'memoryCheckLabel')}
                    </Text>
                    <Switch
                      value={native.memoryCheck}
                      onValueChange={onMemoryCheck}
                    />
                  </View>
                  <Text style={styles.infoMuted}>
                    {t(lang, 'memoryCheckHelp')}
                  </Text>
                </View>
              ) : null}
              <View style={styles.recordBlock}>
                <Button
                  label={t(lang, 'sendJournal')}
                  compact
                  onPress={onExportJournal}
                />
                <Text style={styles.infoMuted}>
                  {t(lang, 'sendJournalHelp')}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.info}>
            <Text style={styles.infoText}>
              {backendLabel} · {backend.url}
            </Text>
            {backend.status === 'offline' && backend.lastError ? (
              <Text style={styles.infoMuted}>
                {backend.lastError} · {t(lang, 'backendHelp')}
              </Text>
            ) : null}
            <Button
              label={t(lang, 'backendRetry')}
              compact
              variant="ghost"
              onPress={backend.refresh}
            />
          </View>

          <View style={styles.buttons}>
            <Button
              label={
                native?.autoAvailable
                  ? t(lang, 'manualCalibration')
                  : native?.hasCalibration
                  ? t(lang, 'recalibrate')
                  : t(lang, 'calibrate')
              }
              onPress={onRecalibrate}
              disabled={!native?.modelLoaded}
            />
            {native?.hasCalibration ? (
              <Button
                label={t(lang, 'deleteVisualMap')}
                variant="danger"
                onPress={confirmDelete}
                disabled={busy}
              />
            ) : null}
            <Button
              label={t(lang, 'close')}
              variant="ghost"
              onPress={onClose}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.background,
    borderColor: colors.panelBorder,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    maxHeight: '88%',
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  content: {
    paddingBottom: 4,
  },
  notice: {
    borderRadius: 12,
    marginBottom: 6,
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
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  label: {
    color: colors.text,
    fontSize: 16,
  },
  langs: {
    flexDirection: 'row',
    gap: 8,
  },
  venueBlock: {
    gap: 8,
    paddingVertical: 8,
  },
  venues: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  info: {
    backgroundColor: colors.card,
    borderRadius: 12,
    gap: 6,
    marginTop: 8,
    padding: 12,
  },
  infoText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  infoMuted: {
    color: colors.lost,
    fontSize: 12,
    lineHeight: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  flex1: {
    flex: 1,
  },
  recordBlock: {
    gap: 6,
    marginTop: 8,
  },
  recordRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  buttons: {
    gap: 8,
    marginTop: 14,
  },
});
