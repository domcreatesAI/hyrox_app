import { Link } from 'react-router-dom';
import { useBookingEditor } from '../components/BookingEditor';
import { Badge, Empty, PageHeader } from '../components/ui';
import { balanceDue, meetTimeFor, packageLabel } from '../lib/calendar';
import { needsCalendarSync } from '../lib/data';
import { daysBetween, formatDate, formatDateRange, money, relativeDay, todayISO, plural } from '../lib/format';
import { useBookings, useEvents, useGoogleConnected, useSettings } from '../lib/hooks';
import type { Booking } from '../types';

interface Issue {
  b: Booking;
  kind: 'deposit' | 'start' | 'music' | 'calendar';
  text: string;
}

export function Dashboard() {
  const bookings = useBookings();
  const events = useEvents();
  const settings = useSettings();
  const connected = useGoogleConnected();
  const openEditor = useBookingEditor();
  const today = todayISO();
  const c = settings.currency;

  const upcoming = bookings.filter((b) => b.raceDate >= today && b.status !== 'cancelled');
  const noDeposit = upcoming.filter((b) => !b.depositPaid);
  const toCollect = upcoming.reduce((s, b) => s + balanceDue(b), 0);
  const booked = upcoming.reduce((s, b) => s + b.price, 0);

  const issues: Issue[] = [];
  for (const b of upcoming) {
    const days = daysBetween(today, b.raceDate);
    if (!b.depositPaid) issues.push({ b, kind: 'deposit', text: `Deposit of ${money(b.depositAmount, c)} not paid` });
    if (!b.startTime && days <= 10) issues.push({ b, kind: 'start', text: 'Start time not set yet' });
    if (!b.music.track && !b.music.style && days <= 21) issues.push({ b, kind: 'music', text: 'No music chosen' });
    if (connected && settings.googleClientId && needsCalendarSync(b)) issues.push({ b, kind: 'calendar', text: 'Not synced to Google Calendar' });
  }
  const order = { deposit: 0, start: 1, music: 2, calendar: 3 };
  issues.sort((x, y) => x.b.raceDate.localeCompare(y.b.raceDate) || order[x.kind] - order[y.kind]);

  const nextEvents = events.filter((e) => e.endDate >= today).slice(0, 4);
  const tone = { deposit: 'bad', start: 'warn', music: 'accent', calendar: 'neutral' } as const;
  const label = { deposit: 'Deposit', start: 'Start time', music: 'Music', calendar: 'Calendar' };

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={formatDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}
        actions={
          <button className="btn btn-primary" onClick={() => openEditor({})}>
            + New booking
          </button>
        }
      />

      <div className="stats">
        <div className="stat">
          <span className="stat-label">Upcoming clients</span>
          <span className="stat-value">{upcoming.length}</span>
        </div>
        <div className={`stat${noDeposit.length ? ' stat-bad' : ''}`}>
          <span className="stat-label">Waiting on deposit</span>
          <span className="stat-value">{noDeposit.length}</span>
          <span className="stat-sub">{money(noDeposit.reduce((s, b) => s + b.depositAmount, 0), c)} outstanding</span>
        </div>
        <div className="stat">
          <span className="stat-label">To collect on race days</span>
          <span className="stat-value">{money(toCollect, c)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Booked value</span>
          <span className="stat-value">{money(booked, c)}</span>
        </div>
      </div>

      <div className="two-col">
        <section className="card">
          <h2 className="card-title">Needs attention</h2>
          {issues.length === 0 ? (
            <Empty title="All sorted 👊">Deposits, start times and music are covered for upcoming races.</Empty>
          ) : (
            <ul className="issue-list">
              {issues.slice(0, 25).map((i) => (
                <li key={i.b.id + i.kind}>
                  <button className="issue" onClick={() => openEditor({ id: i.b.id })}>
                    <Badge tone={tone[i.kind]}>{label[i.kind]}</Badge>
                    <span className="issue-main">
                      <strong>{i.b.clientName}</strong>
                      <span className="muted">{i.text}</span>
                    </span>
                    <span className="issue-when">{relativeDay(i.b.raceDate)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-title-row">
            <h2 className="card-title">Next races</h2>
            <Link to="/races" className="link">
              All races →
            </Link>
          </div>
          {nextEvents.length === 0 ? (
            <Empty title="No upcoming races">
              <Link to="/races" className="link">
                Add your next race
              </Link>{' '}
              or import them from Google Calendar.
            </Empty>
          ) : (
            <ul className="race-list">
              {nextEvents.map((e) => {
                const eb = bookings.filter((b) => b.eventId === e.id && b.status !== 'cancelled');
                const withTimes = eb.filter((b) => b.startTime).length;
                return (
                  <li key={e.id}>
                    <Link to={`/races/${e.id}`} className="race-item">
                      <span className="race-item-main">
                        <strong>{e.name}</strong>
                        <span className="muted">
                          {formatDateRange(e.startDate, e.endDate)} · {relativeDay(e.startDate)}
                        </span>
                      </span>
                      <span className="race-item-meta">
                        <span>{plural(eb.length, 'client')}</span>
                        {eb.length ? <span className={withTimes < eb.length ? 'warn-text' : 'ok-text'}>{withTimes}/{eb.length} start times</span> : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {upcoming.length ? (
        <section className="card">
          <h2 className="card-title">Coming up</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Meet</th>
                  <th>Start</th>
                  <th>Client</th>
                  <th>Package</th>
                  <th className="num">Due on day</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.slice(0, 10).map((b) => (
                  <tr key={b.id} className="clickable" onClick={() => openEditor({ id: b.id })}>
                    <td>{formatDate(b.raceDate)}</td>
                    <td>{meetTimeFor(b, settings).time || <span className="muted">TBC</span>}</td>
                    <td>{b.startTime || <span className="muted">TBC</span>}</td>
                    <td>
                      <strong>{b.clientName}</strong>
                      {b.partner ? <span className="muted"> + {b.partner}</span> : null}
                    </td>
                    <td>{packageLabel(b, settings.packages)}</td>
                    <td className="num">{money(balanceDue(b), c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
