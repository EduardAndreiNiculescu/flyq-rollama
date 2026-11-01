import type { CalibrationStatus } from 'flyq-spatial';
import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { codeText, type Lang, type StringKey, t } from '../i18n';
import { calibrationStepOf } from '../state/spatialStore';
import { Button } from '../ui/Button';
import { formatMeters } from '../ui/format';
import { colors, pairColor } from '../ui/theme';

interface Props {
  lang: Lang;
  calibration: CalibrationStatus | null;
  onMarkCamera: () => void;
  onUndo: () => void;
  onSave: () => void;
  onExit: () => void;
}

const STEP_TEXT: Record<ReturnType<typeof calibrationStepOf>, StringKey> = {
  scan: 'stepScan',
  markCamera: 'stepMarkCamera',
  markMap: 'stepMarkMap',
  more: 'stepMore',
  save: 'stepSave',
};

const MAPPING_TEXT: Record<CalibrationStatus['mapping'], StringKey> = {
  notAvailable: 'mappingNotAvailable',
  limited: 'mappingLimited',
  extending: 'mappingExtending',
  mapped: 'mappingMapped',
};

export function CalibrationPanel({
  lang,
  calibration,
  onMarkCamera,
  onUndo,
  onSave,
  onExit,
}: Props) {
  const step = calibrationStepOf(calibration);
  const pairs = calibration?.pairs ?? [];
  const warnings = (calibration?.warnings ?? [])
    .filter(w => w !== 'MAP_NOT_READY' || (calibration?.pairCount ?? 0) >= 3)
    .map(w => codeText(lang, 'warn_', w))
    .filter((w): w is string => typeof w === 'string');
  const mappingReady =
    calibration?.mapping === 'mapped' || calibration?.mapping === 'extending';
  const canMark = calibration?.tracking === 'normal' && !calibration?.saving;
  const canUndo =
    (calibration?.pairCount ?? 0) > 0 ||
    !!calibration?.hasPendingCamera ||
    !!calibration?.hasPendingMap;

  return (
    <View>
      <Text style={styles.title}>{t(lang, 'calibrationTitle')}</Text>
      <Text style={styles.step}>{t(lang, STEP_TEXT[step])}</Text>

      <View style={styles.row}>
        <Text style={styles.label}>{t(lang, 'pairs')}</Text>
        <View style={styles.dots}>
          {pairs.map((pair, index) => (
            <View
              key={`pair-${index}`}
              style={[styles.dot, { backgroundColor: pairColor(index) }]}
            >
              <Text style={styles.dotText}>
                {pair.error !== null ? formatMeters(pair.error) : index + 1}
              </Text>
            </View>
          ))}
          {calibration?.hasPendingCamera || calibration?.hasPendingMap ? (
            <View style={[styles.dot, styles.dotPending]}>
              <Text style={styles.dotTextDark}>
                {calibration?.hasPendingCamera ? '📷' : '🗺'}
              </Text>
            </View>
          ) : null}
          {pairs.length === 0 &&
          !calibration?.hasPendingCamera &&
          !calibration?.hasPendingMap ? (
            <Text style={styles.muted}>0 / 3</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>{t(lang, 'mapping')}</Text>
        <Text style={[styles.value, mappingReady ? styles.good : styles.warn]}>
          {t(lang, MAPPING_TEXT[calibration?.mapping ?? 'notAvailable'])}
        </Text>
        {calibration?.rmsError !== null &&
        calibration?.rmsError !== undefined ? (
          <Text style={styles.value}>
            {'  ·  '}
            {t(lang, 'error')} {formatMeters(calibration.rmsError)}
          </Text>
        ) : null}
      </View>

      {warnings.length > 0 ? (
        <Text style={styles.warning}>{warnings[0]}</Text>
      ) : null}

      <View style={styles.buttons}>
        <Button
          label={t(lang, 'markCamera')}
          variant="primary"
          onPress={onMarkCamera}
          disabled={!canMark}
          style={styles.flex2}
        />
        <Button
          label={t(lang, 'undo')}
          onPress={onUndo}
          disabled={!canUndo}
          style={styles.flex1}
        />
      </View>
      <View style={styles.buttons}>
        <Button
          label={calibration?.saving ? t(lang, 'saving') : t(lang, 'save')}
          variant={calibration?.canSave ? 'primary' : 'secondary'}
          onPress={onSave}
          disabled={!calibration?.canSave}
          compact
          style={styles.flex2}
        />
        <Button
          label={t(lang, 'exit')}
          onPress={onExit}
          compact
          variant="ghost"
          style={styles.flex1}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  step: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 4,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 8,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    marginRight: 8,
    minWidth: 78,
  },
  value: {
    color: colors.text,
    fontSize: 13,
  },
  good: {
    color: colors.success,
  },
  warn: {
    color: colors.warning,
  },
  muted: {
    color: colors.textMuted,
    fontSize: 13,
  },
  dots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dot: {
    alignItems: 'center',
    borderRadius: 11,
    justifyContent: 'center',
    minWidth: 22,
    paddingHorizontal: 6,
    height: 22,
  },
  dotPending: {
    backgroundColor: '#FFFFFF',
  },
  dotText: {
    color: '#0B1430',
    fontSize: 11,
    fontWeight: '700',
  },
  dotTextDark: {
    color: '#0B1430',
    fontSize: 11,
  },
  warning: {
    color: colors.warning,
    fontSize: 13,
    marginTop: 6,
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  flex1: {
    flex: 1,
  },
  flex2: {
    flex: 2,
  },
});
