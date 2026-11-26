import { gfetch, GoogleApiError } from './google';
import { addDays, addMinutesLocal, formatDate, money } from './format';
import type { Booking, Package, RaceEvent, Settings } from '../types';

const API = 'https://www.googleapis.com/calendar/v3';

export interface GCalEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  status?: string;
  htmlLink?: string;
  extendedProperties?: { private?: Record<string, string> };
}

export interface GCalendar {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole: string;
}

export async function listCalendars(s: Settings): Promise<GCalendar[]> {
  const r = await gfetch<{ items: GCalendar[] }>(s.googleClientId, `${API}/users/me/calendarList?minAccessRole=writer`);
  return r.items ?? [];
}

export function packageLabel(b: Booking, packages: Package[]): string {
  const main = packages.find((p) => p.id === b.packageId)?.name ?? 'No package';
  const extras = b.addOnIds.map((id) => packages.find((p) => p.id === id)?.name).filter(Boolean);
  return [main, ...extras].join(' + ');
}

export function balanceDue(b: Booking): number {
  if (b.balancePaid) return 0;
  return Math.max(0, b.price - (b.depositPaid ? b.depositAmount : 0));
}

export function buildDescription(b: Booking, ev: RaceEvent | undefined, s: Settings): string {
  const c = s.currency;
  const lines: string[] = [];
  lines.push(`👤 ${b.clientName}${b.partner ? ` + ${b.partner}` : ''}`);
  if (ev) lines.push(`🏁 ${ev.name}${ev.location ? ` · ${ev.location}` : ''}`);
  const raceBits = [b.division, b.wave && `Wave ${b.wave}`, b.startTime ? `Start ${b.startTime}` : 'Start time TBC'].filter(Boolean);
  lines.push(`⏱ ${raceBits.join(' · ')}${ev?.timeZone ? ` (${ev.timeZone})` : ''}`);
  lines.push('');
  lines.push(`📦 ${packageLabel(b, s.packages)} — ${money(b.price, c)}`);
  lines.push(
    b.depositPaid
      ? `✅ Deposit ${money(b.depositAmount, c)} paid${b.depositPaidOn ? ` ${formatDate(b.depositPaidOn)}` : ''}`
      : `⚠️ Deposit ${money(b.depositAmount, c)} NOT paid`
  );
  lines.push(b.balancePaid ? '✅ Balance paid' : `💷 Balance due on the day: ${money(balanceDue(b), c)}`);
  const m = b.music;
  if (m.track || m.artist || m.style || m.link) {
    lines.push('');
    const track = [m.track, m.artist].filter(Boolean).join(' – ');
    lines.push(`🎵 ${track || 'Track TBC'}${m.style ? ` (${m.style})` : ''}`);
    if (m.link) lines.push(m.link);
  }
  const contact = [b.instagram, b.phone, b.email].filter(Boolean);
  if (contact.length) {
    lines.push('');
    lines.push(`📱 ${contact.join(' · ')}`);
  }
  if (b.notes.trim()) {
    lines.push('');
    lines.push('📝 Notes');
    lines.push(b.notes.trim());
  }
  lines.push('');
  lines.push('— Managed in Race Day CRM. Edit in the app; changes here get overwritten.');
  return lines.join('\n');
}

/** Google Calendar colour IDs: 11 Tomato, 5 Banana, 10 Basil. */
function colourFor(b: Booking): string {
  if (!b.depositPaid) return '11';
  if (!b.balancePaid) return '5';
  return '10';
}

export function buildEventBody(b: Booking, ev: RaceEvent | undefined, s: Settings) {
  const tz = ev?.timeZone || s.defaultTimeZone;
  const pkg = s.packages.find((p) => p.id === b.packageId)?.name;
  const who = b.partner ? `${b.clientName} & ${b.partner}` : b.clientName;
  const flag = b.depositPaid ? '' : '⚠️ ';
  const summary = `${flag}🎥 ${b.startTime ? `${b.startTime} ` : ''}${who}${pkg ? ` — ${pkg}` : ''}${b.startTime ? '' : ' · start TBC'}`;

  const timing = b.startTime
    ? {
        start: { dateTime: addMinutesLocal(b.raceDate, b.startTime, -s.calendarLeadMin), timeZone: tz },
        end: { dateTime: addMinutesLocal(b.raceDate, b.startTime, s.calendarDurationMin - s.calendarLeadMin), timeZone: tz }
      }
    : { start: { date: b.raceDate }, end: { date: addDays(b.raceDate, 1) } };

  return {
    summary,
    description: buildDescription(b, ev, s),
    location: ev?.location || undefined,
    colorId: colourFor(b),
    transparency: b.startTime ? 'opaque' : 'transparent',
    ...timing,
    extendedProperties: { private: { raceDayCrmBookingId: b.id } }
  };
}

const calPath = (s: Settings) => `${API}/calendars/${encodeURIComponent(s.calendarId || 'primary')}/events`;

/** Create or update the calendar entry for a booking. Returns the Google event id. */
export async function upsertBookingEvent(b: Booking, ev: RaceEvent | undefined, s: Settings): Promise<string> {
  const body = JSON.stringify(buildEventBody(b, ev, s));
  if (b.calendarEventId) {
    try {
      // PUT replaces the event, so switching between all-day and timed works cleanly.
      const existing = await gfetch<GCalEvent>(s.googleClientId, `${calPath(s)}/${encodeURIComponent(b.calendarEventId)}`);
      if (existing.status !== 'cancelled') {
        const r = await gfetch<GCalEvent>(s.googleClientId, `${calPath(s)}/${encodeURIComponent(b.calendarEventId)}`, { method: 'PUT', body });
        return r.id;
      }
    } catch (e) {
      if (!(e instanceof GoogleApiError) || (e.status !== 404 && e.status !== 410)) throw e;
    }
  }
  const r = await gfetch<GCalEvent>(s.googleClientId, calPath(s), { method: 'POST', body });
  return r.id;
}

export async function deleteCalendarEvent(eventId: string, s: Settings): Promise<void> {
  try {
    await gfetch(s.googleClientId, `${calPath(s)}/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
  } catch (e) {
    if (e instanceof GoogleApiError && (e.status === 404 || e.status === 410)) return;
    throw e;
  }
}

export async function listEventsInRange(s: Settings, fromISO: string, toISO: string, q?: string): Promise<GCalEvent[]> {
  const out: GCalEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      timeMin: `${fromISO}T00:00:00Z`,
      timeMax: `${addDays(toISO, 1)}T00:00:00Z`,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250'
    });
    if (q) params.set('q', q);
    if (pageToken) params.set('pageToken', pageToken);
    const r = await gfetch<{ items: GCalEvent[]; nextPageToken?: string }>(s.googleClientId, `${calPath(s)}?${params}`);
    out.push(...(r.items ?? []));
    pageToken = r.nextPageToken;
  } while (pageToken && out.length < 2000);
  return out.filter((e) => e.status !== 'cancelled');
}
