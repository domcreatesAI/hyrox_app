import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { Empty, Field, PageHeader } from '../components/ui';
import { db } from '../db';
import { listEventsInRange, type GCalEvent } from '../lib/calendar';
import { newBooking, newEvent } from '../lib/data';
import { addDays, formatDate, formatDateRange, toZoned, todayISO } from '../lib/format';
import { useBookings, useEvents, useSettings } from '../lib/hooks';

type Kind = 'race' | 'booking';
interface Row {
  ev: GCalEvent;
  kind: Kind;
  selected: boolean;
  raceId: string; // for bookings: existing race id, or `new:<gcal id>` for a race being imported now
  startDate: string;
  endDate: string;
  time: string;
}

const RACE_RE = /hyrox|deadly dozen|championship|games|race|tour/i;

function stripHtml(s = '') {
  const d = document.createElement('div');
  d.innerHTML = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n');
  return (d.textContent ?? '').trim();
}

export function Import() {
  const settings = useSettings();
  const events = useEvents();
  const bookings = useBookings();
  const toast = useToast();
  const [from, setFrom] = useState(addDays(todayISO(), -60));
  const [to, setTo] = useState(addDays(todayISO(), 365));
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState(true);

  const linked = useMemo(() => new Set(bookings.map((b) => b.calendarEventId).filter(Boolean)), [bookings]);

  const load = async () => {
    setLoading(true);
    try {
      const items = await listEventsInRange(settings, from, to, q.trim() || undefined);
      const fresh = items.filter((e) => !linked.has(e.id) && !e.extendedProperties?.private?.raceDayCrmBookingId);
      setRows(
        fresh.map((ev) => {
          const allDay = !!ev.start.date;
          const startZ = allDay ? { date: ev.start.date!, time: '' } : toZoned(ev.start.dateTime!, settings.defaultTimeZone);
          const endDate = allDay ? addDays(ev.end.date!, -1) : toZoned(ev.end.dateTime!, settings.defaultTimeZone).date;
          const kind: Kind = allDay ? 'race' : 'booking';
          const already = events.some((x) => x.name.toLowerCase() === (ev.summary ?? '').toLowerCase() && x.startDate === startZ.date);
          const race = events.find((x) => startZ.date >= x.startDate && startZ.date <= x.endDate);
          return {
            ev,
            kind,
            selected: kind === 'race' && RACE_RE.test(ev.summary ?? '') && !already,
            raceId: race?.id ?? '',
            startDate: startZ.date,
            endDate: endDate < startZ.date ? startZ.date : endDate,
            time: startZ.time
          };
        })
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setLoading(false);
    }
  };

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const raceRowsSelected = (rows ?? []).filter((r) => r.selected && r.kind === 'race');

  const doImport = async () => {
    if (!rows) return;
    const chosen = rows.filter((r) => r.selected);
    if (!chosen.length) return toast('Tick the entries you want to import.', 'warn');
    const newRaceIds = new Map<string, string>();
    const now = Date.now();
    const raceRecords = chosen
      .filter((r) => r.kind === 'race')
      .map((r) => {
        const e = { ...newEvent(settings), name: r.ev.summary || 'Untitled race', location: r.ev.location ?? '', startDate: r.startDate, endDate: r.endDate, notes: stripHtml(r.ev.description), createdAt: now, updatedAt: now };
        newRaceIds.set(`new:${r.ev.id}`, e.id);
        return e;
      });
    const allRaces = [...events, ...raceRecords];
    const bookingRecords = chosen
      .filter((r) => r.kind === 'booking')
      .map((r) => {
        const raceId = newRaceIds.get(r.raceId) ?? r.raceId;
        const race = allRaces.find((x) => x.id === raceId);
        // Re-read the start time in the race's own time zone (e.g. Berlin while the calendar is in London).
        const z = r.ev.start.dateTime && race ? toZoned(r.ev.start.dateTime, race.timeZone) : { date: r.startDate, time: r.time };
        return {
          ...newBooking(settings, raceId, z.date),
          clientName: r.ev.summary || 'Unnamed client',
          startTime: z.time,
          notes: stripHtml(r.ev.description),
          calendarEventId: link ? r.ev.id : undefined,
          // Leave calendarSyncedAt unset so a later sync rewrites the linked entry in the app's format.
          createdAt: now,
          updatedAt: now
        };
      });
    await db.transaction('rw', db.events, db.bookings, async () => {
      await db.events.bulkPut(raceRecords);
      await db.bookings.bulkPut(bookingRecords);
    });
    toast(`Imported ${raceRecords.length} race(s) and ${bookingRecords.length} booking(s). Open each booking to add package, deposit and music.`, 'ok');
    setRows(null);
  };

  if (!settings.googleClientId) {
    return (
      <>
        <PageHeader title="Import from Google Calendar" />
        <section className="card">
          <Empty title="Connect Google first">
            Add your Google Client ID in{' '}
            <Link to="/settings" className="link">
              Settings
            </Link>{' '}
            to pull races and existing bookings from your calendar.
          </Empty>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Import from Google Calendar" subtitle="Bring in your race weekends and any clients you already put in the calendar. Nothing changes in Google until you sync." />
      <section className="card">
        <div className="filters">
          <Field label="From">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Search (optional)">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. hyrox" />
          </Field>
          <button className="btn btn-primary align-end" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Load calendar entries'}
          </button>
        </div>
      </section>

      {rows ? (
        <section className="card card-flush">
          {rows.length === 0 ? (
            <Empty title="Nothing new in that range" />
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }} />
                      <th>Calendar entry</th>
                      <th>When</th>
                      <th>Import as</th>
                      <th>Race</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.ev.id} className={r.selected ? '' : 'row-muted'}>
                        <td>
                          <input type="checkbox" checked={r.selected} onChange={(e) => update(i, { selected: e.target.checked })} aria-label={`Import ${r.ev.summary}`} />
                        </td>
                        <td>
                          <strong>{r.ev.summary || '(no title)'}</strong>
                          {r.ev.location ? <div className="muted small">{r.ev.location}</div> : null}
                        </td>
                        <td>
                          {r.time ? `${formatDate(r.startDate)} · ${r.time}` : formatDateRange(r.startDate, r.endDate)}
                        </td>
                        <td>
                          <select value={r.kind} onChange={(e) => update(i, { kind: e.target.value as Kind })}>
                            <option value="race">Race weekend</option>
                            <option value="booking">Client booking</option>
                          </select>
                        </td>
                        <td>
                          {r.kind === 'booking' ? (
                            <select value={r.raceId} onChange={(e) => update(i, { raceId: e.target.value })}>
                              <option value="">— none —</option>
                              {events.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.name} · {formatDate(e.startDate)}
                                </option>
                              ))}
                              {raceRowsSelected.map((x) => (
                                <option key={x.ev.id} value={`new:${x.ev.id}`}>
                                  {x.ev.summary} (importing)
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="card-foot">
                <label className="check">
                  <input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} />
                  Link imported bookings to their calendar entries. Syncing will then rewrite those entries in the app’s format instead of creating duplicates. The original description is kept in the booking’s notes.
                </label>
                <button className="btn btn-primary" onClick={doImport}>
                  Import {rows.filter((r) => r.selected).length} selected
                </button>
              </div>
            </>
          )}
        </section>
      ) : null}
    </>
  );
}
