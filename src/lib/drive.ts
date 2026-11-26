import { gfetch } from './google';
import { db, getSettings, saveSettings } from '../db';
import type { Booking, RaceEvent, Settings, SyncMeta } from '../types';

/**
 * Device-to-device sync through a private file in Google Drive's hidden app folder.
 * The file is only visible to this app, not in the user's normal Drive listing.
 * Records are merged one-by-one: the most recently edited copy wins.
 */

const FILE_NAME = 'race-day-crm.json';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export interface Snapshot {
  app: 'race-day-crm';
  version: 1;
  exportedAt: number;
  settings: Settings;
  events: RaceEvent[];
  bookings: Booking[];
}

export async function localSnapshot(): Promise<Snapshot> {
  const [settings, events, bookings] = await Promise.all([getSettings(), db.events.toArray(), db.bookings.toArray()]);
  return { app: 'race-day-crm', version: 1, exportedAt: Date.now(), settings, events, bookings };
}

function mergeRecords<T extends SyncMeta>(a: T[], b: T[]): T[] {
  const map = new Map<string, T>();
  for (const r of [...a, ...b]) {
    const cur = map.get(r.id);
    if (!cur || (r.updatedAt ?? 0) > (cur.updatedAt ?? 0)) map.set(r.id, r);
  }
  return [...map.values()];
}

/** Settings that only make sense on this device and are never taken from another copy. */
function deviceOnly(s: Settings) {
  return { lastDriveSync: s.lastDriveSync, googleClientId: s.googleClientId };
}

/** Merge another snapshot (from Drive or a backup file) into the local database. */
export async function mergeSnapshot(incoming: Snapshot): Promise<{ events: number; bookings: number }> {
  if (incoming?.app !== 'race-day-crm') throw new Error('That file is not a Race Day CRM backup.');
  const local = await localSnapshot();
  const events = mergeRecords(local.events, incoming.events ?? []);
  const bookings = mergeRecords(local.bookings, incoming.bookings ?? []);
  await db.transaction('rw', db.events, db.bookings, db.settings, async () => {
    await db.events.bulkPut(events);
    await db.bookings.bulkPut(bookings);
    if (incoming.settings && (incoming.settings.updatedAt ?? 0) > (local.settings.updatedAt ?? 0)) {
      await saveSettings({ ...incoming.settings, ...deviceOnly(local.settings), googleClientId: local.settings.googleClientId || incoming.settings.googleClientId }, false);
    }
  });
  return {
    events: events.length - local.events.length,
    bookings: bookings.length - local.bookings.length
  };
}

async function findFile(s: Settings): Promise<string | null> {
  const params = new URLSearchParams({ spaces: 'appDataFolder', q: `name='${FILE_NAME}'`, fields: 'files(id,modifiedTime)' });
  const r = await gfetch<{ files: { id: string }[] }>(s.googleClientId, `${DRIVE}/files?${params}`);
  return r.files?.[0]?.id ?? null;
}

export async function syncWithDrive(): Promise<{ pulled: boolean; at: number }> {
  const s = await getSettings();
  const fileId = await findFile(s);
  let pulled = false;
  if (fileId) {
    const remote = await gfetch<Snapshot>(s.googleClientId, `${DRIVE}/files/${fileId}?alt=media`);
    if (remote) {
      await mergeSnapshot(remote);
      pulled = true;
    }
  }
  const merged = await localSnapshot();
  const body = JSON.stringify({ ...merged, settings: { ...merged.settings, lastDriveSync: undefined } });
  if (fileId) {
    await gfetch(s.googleClientId, `${UPLOAD}/files/${fileId}?uploadType=media`, { method: 'PATCH', body });
  } else {
    const boundary = `rdcrm${Date.now()}`;
    const multipart =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] }) +
      `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    await gfetch(s.googleClientId, `${UPLOAD}/files?uploadType=multipart`, {
      method: 'POST',
      body: multipart,
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }
    });
  }
  const at = Date.now();
  await saveSettings({ lastDriveSync: at }, false);
  return { pulled, at };
}
