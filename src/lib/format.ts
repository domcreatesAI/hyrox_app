const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function money(value: number, currency = 'GBP'): string {
  let f = moneyFormatters.get(currency);
  if (!f) {
    try {
      f = new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2, minimumFractionDigits: 0 });
    } catch {
      f = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2, minimumFractionDigits: 0 });
    }
    moneyFormatters.set(currency, f);
  }
  return f.format(Number.isFinite(value) ? value : 0);
}

/** Today's date as YYYY-MM-DD in the device's local time. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const pad = (n: number) => String(n).padStart(2, '0');

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((parseISODate(toISO).getTime() - parseISODate(fromISO).getTime()) / 86_400_000);
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(parseISODate(iso));
}

export function formatDateRange(start: string, end: string): string {
  if (!start) return '—';
  if (!end || end === start) return formatDate(start, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const s = parseISODate(start);
  const e = parseISODate(end);
  const sameMonth = s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
  const left = formatDate(start, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
  return `${left} – ${formatDate(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export function relativeDay(iso: string): string {
  const diff = daysBetween(todayISO(), iso);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 0) return `in ${diff} days`;
  return `${-diff} days ago`;
}

/** Add minutes to a local wall-clock date+time, returning YYYY-MM-DDTHH:mm:00. */
export function addMinutesLocal(date: string, time: string, minutes: number): string {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi) + minutes * 60_000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:00`;
}

/** Convert an absolute instant to wall-clock date + time in a given IANA zone. */
export function toZoned(instant: string | Date, timeZone: string): { date: string; time: string } {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

export const COMMON_TIME_ZONES = [
  'Europe/London',
  'Europe/Dublin',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Vienna',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Australia/Sydney'
];

export function normaliseHandle(h: string): string {
  const t = h.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '');
  if (!t) return '';
  return t.startsWith('@') ? t : `@${t}`;
}

export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
