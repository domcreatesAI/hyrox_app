import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS, getSettings } from '../db';
import { hasValidToken, onGoogleChange } from './google';
import type { Booking, RaceEvent, Settings } from '../types';

export function useSettings(): Settings {
  return useLiveQuery(() => getSettings(), [], DEFAULT_SETTINGS);
}

export function useEvents(): RaceEvent[] {
  return useLiveQuery(
    async () => (await db.events.orderBy('startDate').toArray()).filter((e) => !e.deleted),
    [],
    []
  );
}

export function useBookings(): Booking[] {
  return useLiveQuery(
    async () =>
      (await db.bookings.toArray())
        .filter((b) => !b.deleted)
        .sort((a, b) => (a.raceDate + (a.startTime || '99:99')).localeCompare(b.raceDate + (b.startTime || '99:99'))),
    [],
    []
  );
}

/** Re-renders when the Google connection changes or the token expires. */
export function useGoogleConnected(): boolean {
  const [connected, setConnected] = useState(hasValidToken());
  useEffect(() => {
    const update = () => setConnected(hasValidToken());
    const off = onGoogleChange(update);
    const t = window.setInterval(update, 30_000);
    return () => {
      off();
      window.clearInterval(t);
    };
  }, []);
  return connected;
}
