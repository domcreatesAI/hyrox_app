import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EventEditor } from '../components/EventEditor';
import { Empty, PageHeader } from '../components/ui';
import { newEvent } from '../lib/data';
import { formatDateRange, relativeDay, todayISO, plural } from '../lib/format';
import { useBookings, useEvents, useSettings } from '../lib/hooks';
import type { RaceEvent } from '../types';

export function Races() {
  const events = useEvents();
  const bookings = useBookings();
  const settings = useSettings();
  const [editing, setEditing] = useState<RaceEvent | null>(null);
  const today = todayISO();
  const upcoming = events.filter((e) => e.endDate >= today);
  const past = events.filter((e) => e.endDate < today).reverse();

  const row = (e: RaceEvent) => {
    const eb = bookings.filter((b) => b.eventId === e.id && b.status !== 'cancelled');
    const times = eb.filter((b) => b.startTime).length;
    const deposits = eb.filter((b) => b.depositPaid).length;
    return (
      <li key={e.id}>
        <Link to={`/races/${e.id}`} className="race-item">
          <span className="race-item-main">
            <strong>{e.name}</strong>
            <span className="muted">
              {formatDateRange(e.startDate, e.endDate)}
              {e.location ? ` · ${e.location}` : ''}
              {e.endDate >= today ? ` · ${relativeDay(e.startDate)}` : ''}
            </span>
          </span>
          <span className="race-item-meta">
            <span>{plural(eb.length, 'client')}</span>
            {eb.length ? (
              <>
                <span className={times < eb.length ? 'warn-text' : 'ok-text'}>{times}/{eb.length} start times</span>
                <span className={deposits < eb.length ? 'bad-text' : 'ok-text'}>{deposits}/{eb.length} deposits</span>
              </>
            ) : null}
          </span>
        </Link>
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title="Races"
        subtitle="Each race weekend groups its clients and start times."
        actions={
          <>
            <Link to="/import" className="btn">
              Import from calendar
            </Link>
            <button className="btn btn-primary" onClick={() => setEditing(newEvent(settings))}>
              + New race
            </button>
          </>
        }
      />
      <section className="card">
        <h2 className="card-title">Upcoming</h2>
        {upcoming.length ? <ul className="race-list">{upcoming.map(row)}</ul> : <Empty title="No upcoming races">Add one, or import your race weekends from Google Calendar.</Empty>}
      </section>
      {past.length ? (
        <section className="card">
          <h2 className="card-title">Past</h2>
          <ul className="race-list">{past.map(row)}</ul>
        </section>
      ) : null}
      {editing ? <EventEditor initial={editing} isNew bookingCount={0} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
