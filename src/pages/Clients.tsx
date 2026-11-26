import { useMemo, useState } from 'react';
import { useBookingEditor } from '../components/BookingEditor';
import { Empty, PageHeader, PaymentBadges, StatusBadge } from '../components/ui';
import { exportBookingsCsv } from '../lib/backup';
import { packageLabel } from '../lib/calendar';
import { formatDate, money, todayISO } from '../lib/format';
import { useBookings, useEvents, useSettings } from '../lib/hooks';
import { STATUSES } from '../types';

export function Clients() {
  const bookings = useBookings();
  const events = useEvents();
  const settings = useSettings();
  const openEditor = useBookingEditor();
  const [q, setQ] = useState('');
  const [eventId, setEventId] = useState('');
  const [status, setStatus] = useState('');
  const [when, setWhen] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const today = todayISO();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = bookings.filter((b) => {
      if (eventId && b.eventId !== eventId) return false;
      if (status && b.status !== status) return false;
      if (when === 'upcoming' && b.raceDate < today) return false;
      if (when === 'past' && b.raceDate >= today) return false;
      if (unpaidOnly && b.depositPaid) return false;
      if (!needle) return true;
      return [b.clientName, b.partner, b.instagram, b.email, b.phone, b.notes, b.music.track, b.music.artist]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
    return when === 'past' ? list.reverse() : list;
  }, [bookings, q, eventId, status, when, unpaidOnly, today]);

  const eventName = (id: string) => events.find((e) => e.id === id)?.name ?? '—';

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${filtered.length} of ${bookings.length} bookings`}
        actions={
          <>
            <button className="btn" onClick={() => exportBookingsCsv(filtered, events, settings)} disabled={!filtered.length}>
              Export CSV
            </button>
            <button className="btn btn-primary" onClick={() => openEditor({})}>
              + New booking
            </button>
          </>
        }
      />

      <div className="filters">
        <input className="search" type="search" placeholder="Search name, @handle, notes, track…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label="Race">
          <option value="">All races</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="segmented" role="group" aria-label="When">
          {(['upcoming', 'past', 'all'] as const).map((w) => (
            <button key={w} className={when === w ? 'on' : ''} onClick={() => setWhen(w)}>
              {w[0].toUpperCase() + w.slice(1)}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={unpaidOnly} onChange={(e) => setUnpaidOnly(e.target.checked)} /> No deposit only
        </label>
      </div>

      <section className="card card-flush">
        {filtered.length === 0 ? (
          <Empty title={bookings.length ? 'No bookings match these filters' : 'No clients yet'}>
            {bookings.length ? null : (
              <button className="link" onClick={() => openEditor({})}>
                Add your first booking
              </button>
            )}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Race</th>
                  <th>Start</th>
                  <th>Package</th>
                  <th className="num">Price</th>
                  <th>Payment</th>
                  <th>Music</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id} className="clickable" onClick={() => openEditor({ id: b.id })}>
                    <td>
                      <strong>{b.clientName}</strong>
                      {b.partner ? <span className="muted"> + {b.partner}</span> : null}
                      {b.instagram ? <div className="muted small">{b.instagram}</div> : null}
                    </td>
                    <td>
                      {eventName(b.eventId)}
                      <div className="muted small">{formatDate(b.raceDate)}</div>
                    </td>
                    <td>{b.startTime || <span className="muted">TBC</span>}</td>
                    <td>{packageLabel(b, settings.packages)}</td>
                    <td className="num">{money(b.price, settings.currency)}</td>
                    <td>
                      <PaymentBadges b={b} />
                    </td>
                    <td className="truncate">{[b.music.track, b.music.artist].filter(Boolean).join(' – ') || b.music.style || <span className="muted">—</span>}</td>
                    <td>
                      <StatusBadge status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
