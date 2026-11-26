import { db, getSettings } from '../db';
import { deleteCalendarEvent, upsertBookingEvent } from './calendar';
import { hasValidToken } from './google';
import { uid } from './id';
import { todayISO } from './format';
import type { Booking, RaceEvent, Settings } from '../types';

export function newBooking(s: Settings, eventId = '', raceDate = ''): Booking {
  const now = Date.now();
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    clientName: '',
    partner: '',
    instagram: '',
    email: '',
    phone: '',
    eventId,
    raceDate: raceDate || todayISO(),
    startTime: '',
    wave: '',
    division: 'Singles Open',
    packageId: s.packages.find((p) => !p.isAddOn && !p.archived)?.id ?? '',
    addOnIds: [],
    price: s.packages.find((p) => !p.isAddOn && !p.archived)?.price ?? 0,
    depositAmount: s.defaultDeposit,
    depositPaid: false,
    depositPaidOn: '',
    balancePaid: false,
    balancePaidOn: '',
    music: { track: '', artist: '', link: '', style: '' },
    notes: '',
    status: 'booked'
  };
}

export function newEvent(s: Settings): RaceEvent {
  const now = Date.now();
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    name: '',
    location: '',
    timeZone: s.defaultTimeZone,
    startDate: todayISO(),
    endDate: todayISO(),
    notes: ''
  };
}

export type SyncResult = { ok: true } | { ok: false; error: string } | { ok: null };

/** Push one booking to Google Calendar (create, update or remove as needed). */
export async function syncBookingToCalendar(id: string, settings?: Settings): Promise<SyncResult> {
  const s = settings ?? (await getSettings());
  const b = await db.bookings.get(id);
  if (!b) return { ok: null };
  try {
    if (b.deleted || b.status === 'cancelled') {
      if (b.calendarEventId) {
        await deleteCalendarEvent(b.calendarEventId, s);
        await db.bookings.update(id, { calendarEventId: undefined, calendarSyncedAt: Date.now(), updatedAt: Date.now() });
      }
      return { ok: true };
    }
    const ev = b.eventId ? await db.events.get(b.eventId) : undefined;
    const calendarEventId = await upsertBookingEvent(b, ev, s);
    await db.bookings.update(id, { calendarEventId, calendarSyncedAt: Date.now(), updatedAt: Date.now() });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Save a booking and, if Google is connected and auto-sync is on, push it to the calendar. */
export async function saveBooking(b: Booking): Promise<SyncResult> {
  await db.bookings.put({ ...b, updatedAt: Date.now() });
  const s = await getSettings();
  if (s.autoSyncCalendar && s.googleClientId && hasValidToken()) {
    return syncBookingToCalendar(b.id, s);
  }
  return { ok: null };
}

export async function deleteBooking(id: string): Promise<SyncResult> {
  const b = await db.bookings.get(id);
  if (!b) return { ok: null };
  await db.bookings.update(id, { deleted: true, updatedAt: Date.now() });
  const s = await getSettings();
  if (b.calendarEventId && s.googleClientId && hasValidToken()) return syncBookingToCalendar(id, s);
  return { ok: null };
}

export async function saveEvent(ev: RaceEvent): Promise<void> {
  await db.events.put({ ...ev, updatedAt: Date.now() });
}

export async function deleteEvent(id: string): Promise<void> {
  await db.events.update(id, { deleted: true, updatedAt: Date.now() });
}

/** Bookings whose calendar entry is missing or older than their last edit. */
export function needsCalendarSync(b: Booking): boolean {
  if (b.deleted || b.status === 'cancelled') return !!b.calendarEventId;
  return !b.calendarEventId || (b.calendarSyncedAt ?? 0) < b.updatedAt - 2000;
}

export async function syncAllToCalendar(onProgress?: (done: number, total: number) => void): Promise<{ synced: number; failed: { name: string; error: string }[] }> {
  const s = await getSettings();
  const all = (await db.bookings.toArray()).filter(needsCalendarSync);
  const failed: { name: string; error: string }[] = [];
  let synced = 0;
  for (const [i, b] of all.entries()) {
    const r = await syncBookingToCalendar(b.id, s);
    if (r.ok === false) failed.push({ name: b.clientName || 'Unnamed', error: r.error });
    else synced++;
    onProgress?.(i + 1, all.length);
  }
  return { synced, failed };
}
