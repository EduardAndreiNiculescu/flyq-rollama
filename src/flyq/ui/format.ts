/** "HH:mm" in Craiova time (falls back to the phone's local time if Intl time zones are missing). */
export function formatTime(iso: string | null | undefined): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat('ro-RO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Europe/Bucharest',
    }).format(date);
  } catch {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
}

/** "30.10.2026, 10:12" in Craiova time (the phone's local time if Intl time zones are missing). */
export function formatDateTime(iso: string | null | undefined): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Europe/Bucharest',
    }).format(date);
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(date.getDate())}.${pad(
      date.getMonth() + 1,
    )}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}

/** 3355443 -> "3,2 MB" (ro) / "3.2 MB" (en). */
export function formatBytes(
  bytes: number | null | undefined,
  lang: 'ro' | 'en' = 'ro',
): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return '–';
  }
  const mb = bytes / (1024 * 1024);
  const text = mb >= 10 ? String(Math.round(mb)) : mb.toFixed(1);
  return `${lang === 'ro' ? text.replace('.', ',') : text} MB`;
}

/** 155 -> "2:35", 3725 -> "1:02:05". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return '–';
  }
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** 12345 -> "12.345" (ro) / "12,345" (en). */
export function formatCount(
  value: number | null | undefined,
  lang: 'ro' | 'en' = 'ro',
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '–';
  }
  const separator = lang === 'en' ? ',' : '.';
  const sign = value < 0 ? '-' : '';
  const digits = String(Math.round(Math.abs(value)));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/** "1.2 m" / "35 cm". */
export function formatMeters(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '–';
  }
  if (Math.abs(value) < 1) {
    return `${Math.round(value * 100)} cm`;
  }
  return `${value.toFixed(1)} m`;
}

const COMPASS_RO = ['N', 'NE', 'E', 'SE', 'S', 'SV', 'V', 'NV'];

/** Heading in degrees to a compass label relative to the map's "north" (model -Z). */
export function compassLabel(headingDeg: number | null | undefined): string {
  if (
    headingDeg === null ||
    headingDeg === undefined ||
    !Number.isFinite(headingDeg)
  ) {
    return '–';
  }
  const normalized = ((headingDeg % 360) + 360) % 360;
  return COMPASS_RO[Math.round(normalized / 45) % 8];
}
