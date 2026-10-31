// Formatare de ore și durate fără Intl (Hermes pe Android vechi are suport incomplet pentru fusuri orare).

const pad = (n: number) => String(n).padStart(2, '0');

/** „10:40” — ora locală la un aeroport, dată fiind diferența lui față de UTC. */
export function formatLocalTime(utc: Date | string, utcOffsetMin: number): string {
  const ms = (typeof utc === 'string' ? Date.parse(utc) : utc.getTime()) + utcOffsetMin * 60_000;
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function minutesBetween(from: Date | string, to: Date | string): number {
  const a = typeof from === 'string' ? Date.parse(from) : from.getTime();
  const b = typeof to === 'string' ? Date.parse(to) : to.getTime();
  return (b - a) / 60_000;
}

/** „1 h 58 min”, „24 min”, „2 zile” */
export function formatDuration(minutes: number, language: 'ro' | 'en'): string {
  const m = Math.max(0, Math.round(minutes));
  if (m >= 48 * 60) {
    const days = Math.floor(m / (24 * 60));
    return language === 'ro' ? `${days} zile` : `${days} days`;
  }
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  return `${h} h ${pad(rest)} min`;
}

const DAYS = {
  ro: ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};
const MONTHS = {
  ro: ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

/** „Sâmbătă, 31 octombrie 2026” */
export function formatLongDate(utc: string, utcOffsetMin: number, language: 'ro' | 'en'): string {
  const d = new Date(Date.parse(utc) + utcOffsetMin * 60_000);
  const day = DAYS[language][d.getUTCDay()];
  const month = MONTHS[language][d.getUTCMonth()];
  return language === 'ro'
    ? `${day}, ${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`
    : `${day}, ${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
}

const DAYS_SHORT = { ro: ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
const MONTHS_SHORT = {
  ro: ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** „Sâm, 31 oct 2026”: forma scurtă, pentru spații înguste */
export function formatShortDate(utc: string, utcOffsetMin: number, language: 'ro' | 'en'): string {
  const d = new Date(Date.parse(utc) + utcOffsetMin * 60_000);
  return `${DAYS_SHORT[language][d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS_SHORT[language][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Separator de mii cu spațiu îngust: 11 280, 1 975 */
export function formatNumber(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
