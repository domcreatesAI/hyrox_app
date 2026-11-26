import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useBookingEditor } from '../components/BookingEditor';
import { EventEditor } from '../components/EventEditor';
import { useToast } from '../components/Toast';
import { Badge, Empty, PageHeader, StatusBadge } from '../components/ui';
import { db } from '../db';
import { balanceDue, meetTimeFor, packageLabel } from '../lib/calendar';
import { useMessageComposer } from '../components/MessageComposer';
import { needsCalendarSync, saveBooking, syncBookingToCalendar } from '../lib/data';
import { addDays, daysBetween, formatDate, formatDateRange, money, relativeDay, plural } from '../lib/format';
import { getAccessToken } from '../lib/google';
import { useBookings, useEvents, useGoogleConnected, useSettings } from '../lib/hooks';
import type { Booking } from '../types';

export function RaceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const events = useEvents();
  const all = useBookings();
  const settings = useSettings();
  const connected = useGoogleConnected();
  const openEditor = useBookingEditor();
  const openComposer = useMessageComposer();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const ev = events.find((e) => e.id === id);
  if (!ev) {
    return (
      <Empty title="Race not found">
        <Link to="/races" className="link">
          Back to races
        </Link>
      </Empty>
    );
  }
  const c = settings.currency;
  const bookings = all.filter((b) => b.eventId === ev.id);
  const active = bookings.filter((b) => b.status !== 'cancelled');
  const days = Array.from({ length: Math.max(1, daysBetween(ev.startDate, ev.endDate) + 1) }, (_, i) => addDays(ev.startDate, i));
  const offDays = active.filter((b) => !days.includes(b.raceDate));
  const missingTimes = active.filter((b) => !b.startTime).length;
  const total = active.reduce((s, b) => s + b.price, 0);
  const deposits = active.reduce((s, b) => s + (b.depositPaid ? b.depositAmount : 0), 0);
  const toCollect = active.reduce((s, b) => s + balanceDue(b), 0);
  const unsynced = bookings.filter(needsCalendarSync).length;

  const updateInline = async (b: Booking, patch: Partial<Booking>) => {
    const r = await saveBooking({ ...b, ...patch });
    if (r.ok === false) toast(`Calendar sync failed: ${r.error}`, 'error');
  };

  const syncRace = async () => {
    if (!settings.googleClientId) {
      toast('Set up Google in Settings first.', 'warn');
      navigate('/settings');
      return;
    }
    setSyncing(true);
    try {
      await getAccessToken(settings.googleClientId);
      let ok = 0;
      const errors: string[] = [];
      for (const b of (await db.bookings.where('eventId').equals(ev.id).toArray()).filter(needsCalendarSync)) {
        const r = await syncBookingToCalendar(b.id, settings);
        if (r.ok === false) errors.push(`${b.clientName}: ${r.error}`);
        else ok++;
      }
      if (errors.length) toast(`Synced ${ok}, ${errors.length} failed: ${errors[0]}`, 'error');
      else toast(ok ? `Synced ${ok} booking(s) to Google Calendar` : 'Calendar already up to date', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setSyncing(false);
    }
  };

  const sheet = (day: string, list: Booking[]) => {
    const rows = [...list].sort((a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99') || a.clientName.localeCompare(b.clientName));
    return (
      <section className="card run-sheet" key={day}>
        <div className="card-title-row">
          <h2 className="card-title">{day ? formatDate(day, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Other dates'}</h2>
          <span className="muted">{plural(rows.length, 'client')}</span>
        </div>
        {rows.length === 0 ? (
          <p className="muted">No clients on this day.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>Start</th>
                  <th style={{ width: 140 }}>Meet</th>
                  <th>Client</th>
                  <th>Division</th>
                  <th>Package</th>
                  <th>Music</th>
                  <th>Payment</th>
                  <th className="no-print">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className={b.status === 'cancelled' ? 'row-muted' : ''}>
                    <td>
                      <input
                        className="time-input no-print"
                        type="time"
                        defaultValue={b.startTime}
                        key={b.startTime}
                        aria-label={`Start time for ${b.clientName}`}
                        onBlur={(e) => e.target.value !== b.startTime && updateInline(b, { startTime: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      />
                      <span className="print-only">
                        <strong>{b.startTime || 'TBC'}</strong>
                      </span>
                      {b.wave ? <div className="muted small">Wave {b.wave}</div> : null}
                    </td>
                    <td>
                      <input
                        className="time-input no-print"
                        type="time"
                        defaultValue={b.meetTime ?? ''}
                        key={`m${b.meetTime}`}
                        aria-label={`Meet time for ${b.clientName}`}
                        onBlur={(e) => e.target.value !== (b.meetTime ?? '') && updateInline(b, { meetTime: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      />
                      <span className="print-only">
                        <strong>{meetTimeFor(b, settings).time || 'TBC'}</strong>
                      </span>
                      {!b.meetTime && meetTimeFor(b, settings).time ? <div className="muted small no-print">auto {meetTimeFor(b, settings).time}</div> : null}
                      {b.meetPoint ? <div className="muted small">{b.meetPoint}</div> : null}
                    </td>
                    <td>
                      <button className="link-strong" onClick={() => openEditor({ id: b.id })}>
                        {b.clientName}
                      </button>
                      {b.partner ? <div className="muted small">+ {b.partner}</div> : null}
                      {b.instagram ? <div className="muted small">{b.instagram}</div> : null}
                      {b.notes ? <div className="note small">{b.notes}</div> : null}
                    </td>
                    <td>{b.division}</td>
                    <td>{packageLabel(b, settings.packages)}</td>
                    <td>
                      {b.music.track || b.music.artist ? (
                        <>
                          {b.music.link ? (
                            <a href={b.music.link} target="_blank" rel="noreferrer" className="link">
                              {b.music.track || 'Track'}
                            </a>
                          ) : (
                            b.music.track
                          )}
                          {b.music.artist ? <div className="muted small">{b.music.artist}</div> : null}
                        </>
                      ) : b.music.style ? (
                        <span className="muted">{b.music.style}</span>
                      ) : (
                        <Badge tone="warn">TBC</Badge>
                      )}
                    </td>
                    <td>
                      <div className="badge-row">
                        <button className={`badge badge-${b.depositPaid ? 'ok' : 'bad'} badge-btn`} title="Click to toggle" onClick={() => updateInline(b, { depositPaid: !b.depositPaid, depositPaidOn: b.depositPaid ? '' : b.depositPaidOn || new Date().toISOString().slice(0, 10) })}>
                          {b.depositPaid ? 'Deposit ✓' : 'No deposit'}
                        </button>
                        <button className={`badge badge-${b.balancePaid ? 'ok' : 'neutral'} badge-btn`} title="Click to toggle" onClick={() => updateInline(b, { balancePaid: !b.balancePaid, balancePaidOn: b.balancePaid ? '' : b.balancePaidOn || new Date().toISOString().slice(0, 10) })}>
                          {b.balancePaid ? 'Paid ✓' : `Due ${money(balanceDue(b), c)}`}
                        </button>
                      </div>
                    </td>
                    <td className="no-print">
                      <StatusBadge status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  };

  return (
    <>
      <PageHeader
        title={ev.name}
        subtitle={
          <>
            {formatDateRange(ev.startDate, ev.endDate)} · {relativeDay(ev.startDate)}
            {ev.location ? ` · ${ev.location}` : ''} · times in {ev.timeZone}
          </>
        }
        actions={
          <>
            <button className="btn no-print" onClick={() => setEditing(true)}>
              Edit race
            </button>
            <button className="btn no-print" onClick={() => window.print()}>
              Print run sheet
            </button>
            <button className="btn no-print" onClick={syncRace} disabled={syncing} title={connected ? '' : 'Connect Google to sync'}>
              {syncing ? 'Syncing…' : unsynced ? `Sync ${unsynced} to calendar` : 'Calendar ✓'}
            </button>
            <button className="btn no-print" onClick={() => openComposer({ eventId: ev.id, templateId: missingTimes ? 'start-times-out' : undefined })} disabled={!active.length}>
              Message clients
            </button>
            <button className="btn btn-primary no-print" onClick={() => openEditor({ eventId: ev.id })}>
              + Add client
            </button>
          </>
        }
      />

      {ev.notes ? <p className="race-notes">{ev.notes}</p> : null}

      <div className="stats">
        <div className="stat">
          <span className="stat-label">Clients</span>
          <span className="stat-value">{active.length}</span>
        </div>
        <div className={`stat${missingTimes ? ' stat-warn' : ''}`}>
          <span className="stat-label">Start times missing</span>
          <span className="stat-value">{missingTimes}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Deposits received</span>
          <span className="stat-value">{money(deposits, c)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">To collect on the day</span>
          <span className="stat-value">{money(toCollect, c)}</span>
          <span className="stat-sub">of {money(total, c)} total</span>
        </div>
      </div>

      {missingTimes > 0 ? <p className="hint-bar no-print">Start waves out? Use “Message clients” to ask everyone without a start time for theirs, then type each time into the Start column. It saves when you leave the box and updates Google Calendar. Meet time fills in automatically ({settings.calendarLeadMin} min before) unless you set one.</p> : null}

      {bookings.length === 0 ? (
        <section className="card">
          <Empty title="No clients yet">
            <button className="link" onClick={() => openEditor({ eventId: ev.id })}>
              Add the first client
            </button>
          </Empty>
        </section>
      ) : (
        <>
          {days.map((d) => sheet(d, bookings.filter((b) => b.raceDate === d)))}
          {offDays.length ? sheet('', offDays) : null}
        </>
      )}

      {editing ? <EventEditor initial={ev} isNew={false} bookingCount={bookings.length} onClose={() => setEditing(false)} onDeleted={() => navigate('/races')} /> : null}
    </>
  );
}
