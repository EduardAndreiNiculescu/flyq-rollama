import type {
  AutoStatus,
  CalibrationStatus,
  SpatialPose,
  SpatialState,
} from 'flyq-spatial';
import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { BackendInfo } from '../hooks/useBackend';
import { compassLabel, formatMeters } from '../ui/format';

interface Props {
  native: SpatialState | null;
  pose: SpatialPose | null;
  calibration: CalibrationStatus | null;
  auto: AutoStatus | null;
  backend: BackendInfo;
  localizedSeconds: number | null;
  visualMapError?: string | null;
}

function fixed(value: number | null, digits = 2): string {
  return value === null ? '–' : value.toFixed(digits);
}

/** Raw numbers for testing on site (Settings > Debug mode). */
export function DebugPanel({
  native,
  pose,
  calibration,
  auto,
  backend,
  localizedSeconds,
  visualMapError,
}: Props) {
  const memory = native?.visualMap ?? null;
  const lines = [
    `mode ${native?.mode ?? '–'} · ar ${
      native?.arRunning ? 'on' : 'off'
    } · cam ${native?.cameraPermission ?? '–'}`,
    `tracking ${native?.tracking ?? '–'}${
      native?.trackingReason ? ` (${native.trackingReason})` : ''
    }`,
    `mapping ${native?.mapping ?? '–'} · reloc ${
      native?.relocalized ? 'yes' : 'no'
    }${localizedSeconds !== null ? ` in ${localizedSeconds}s` : ''}`,
    `confidence ${native?.confidence ?? '–'} · follow ${
      native?.follow ? 'on' : 'off'
    } · ${native?.viewMode ?? '–'}`,
    pose
      ? `pose x ${pose.x.toFixed(2)} z ${pose.z.toFixed(2)} y ${pose.y.toFixed(
          2,
        )} · ${pose.headingDeg ?? '–'}° ${compassLabel(pose.headingDeg)}`
      : 'pose –',
    calibration?.active
      ? `cal pairs ${calibration.pairCount} rms ${formatMeters(
          calibration.rmsError,
        )} spread ${formatMeters(calibration.spread)} scale ${
          calibration.scale ?? '–'
        } yaw ${calibration.yawDeg ?? '–'}°`
      : `memory ${
          memory
            ? `${memory.source} ${memory.featurePoints ?? '–'} pts ${
                memory.device ?? '–'
              } ${memory.createdAt.slice(11, 19)}`
            : 'none'
        }${native?.visualMapSaving ? ' · SAVING' : ''}${
          visualMapError ? ` · err ${visualMapError}` : ''
        }`,
    `method ${native?.method ?? '–'} · auto ${
      native?.autoAvailable ? 'yes' : 'no'
    } · lidar ${native?.lidar ? 'yes' : 'no'}${
      native?.trackingLost ? ' · LOST' : ''
    }`,
    auto
      ? `auto pts ${auto.points} cov ${fixed(auto.coverage)} score ${fixed(
          auto.score,
        )} amb ${fixed(auto.ambiguity)} inl ${fixed(auto.inliers)} ${
          auto.verdict ?? '–'
        } #${auto.attempts} floor ${auto.floorSource ?? '–'} src ${
          auto.source ?? '–'
        }${auto.fallbackIn !== null ? ` fb ${auto.fallbackIn}s` : ''}`
      : 'auto –',
    `backend ${backend.status} ${backend.url}${
      backend.lastError ? ` (${backend.lastError})` : ''
    }`,
  ];
  return (
    <View style={styles.panel} pointerEvents="none">
      {lines.map((line, index) => (
        <Text key={`l${index}`} style={styles.line} numberOfLines={1}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: 8,
    padding: 8,
  },
  line: {
    color: '#9CFFB0',
    fontFamily: 'Menlo',
    fontSize: 10,
  },
});
