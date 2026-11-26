import Dexie, { type Table } from 'dexie';
import type { Booking, RaceEvent, Settings } from './types';

interface SettingsRow extends Settings {
  key: 'settings';
}

class CrmDb extends Dexie {
  bookings!: Table<Booking, string>;
  events!: Table<RaceEvent, string>;
  settings!: Table<SettingsRow, string>;

  constructor() {
    super('race-day-crm');
    this.version(1).stores({
      bookings: 'id, eventId, raceDate, status, updatedAt',
      events: 'id, startDate, updatedAt',
      settings: 'key'
    });
  }
}

export const db = new CrmDb();

export const DEFAULT_SETTINGS: Settings = {
  businessName: 'domcreates.media',
  currency: 'GBP',
  defaultDeposit: 50,
  defaultTimeZone: 'Europe/London',
  calendarDurationMin: 120,
  calendarLeadMin: 30,
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  calendarId: 'primary',
  autoSyncCalendar: true,
  updatedAt: 0,
  packages: [
    {
      id: 'race-photos',
      name: 'Race Photos',
      price: 120,
      isAddOn: false,
      description: '30-50 edited photos, key stations + finish line, private gallery within 48hrs.'
    },
    {
      id: 'content-pack',
      name: 'Content Pack',
      price: 180,
      isAddOn: false,
      description: '30s reel, 20 edited photos, raw clip pack. Before, during and after. Within 72hrs.'
    },
    {
      id: 'highlights-reel',
      name: 'Highlights Reel',
      price: 200,
      isAddOn: false,
      description: '60-90s highlight reel with music, colour graded, 15-20 edited photos. Within 72hrs.'
    },
    {
      id: 'raw-clips',
      name: 'Raw clip pack',
      price: 50,
      isAddOn: true,
      description: '10+ unedited clips straight from camera.'
    }
  ]
};

export async function getSettings(): Promise<Settings> {
  const row = await db.settings.get('settings');
  if (!row) return { ...DEFAULT_SETTINGS };
  const { key: _key, ...rest } = row;
  return { ...DEFAULT_SETTINGS, ...rest };
}

export async function saveSettings(patch: Partial<Settings>, touch = true): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = { ...current, ...patch, ...(touch ? { updatedAt: Date.now() } : {}) };
  await db.settings.put({ key: 'settings', ...next });
  return next;
}
