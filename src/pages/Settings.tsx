import { useEffect, useRef, useState } from 'react';
import { useToast } from '../components/Toast';
import { Field, PageHeader } from '../components/ui';
import { saveSettings } from '../db';
import { exportBackup, exportBookingsCsv, importBackup } from '../lib/backup';
import { listCalendars, type GCalendar } from '../lib/calendar';
import { syncAllToCalendar } from '../lib/data';
import { syncWithDrive } from '../lib/drive';
import { COMMON_TIME_ZONES, money } from '../lib/format';
import { disconnectGoogle, getAccessToken } from '../lib/google';
import { useBookings, useEvents, useGoogleConnected, useSettings } from '../lib/hooks';
import { uid } from '../lib/id';
import { AUDIENCES, DEFAULT_TEMPLATES, PLACEHOLDERS } from '../lib/templates';
import type { Audience, MessageTemplate, Package, Settings as S } from '../types';

export function Settings() {
  const settings = useSettings();
  const connected = useGoogleConnected();
  const bookings = useBookings();
  const events = useEvents();
  const toast = useToast();
  const [calendars, setCalendars] = useState<GCalendar[]>([]);
  const [busy, setBusy] = useState('');
  const [clientId, setClientId] = useState(settings.googleClientId);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setClientId(settings.googleClientId), [settings.googleClientId]);
  useEffect(() => {
    if (connected && settings.googleClientId) listCalendars(settings).then(setCalendars).catch(() => {});
  }, [connected, settings.googleClientId]);

  const patch = (p: Partial<S>) => saveSettings(p);
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy('');
    }
  };

  const connect = () =>
    run('connect', async () => {
      const id = clientId.trim();
      await saveSettings({ googleClientId: id });
      await getAccessToken(id, { forceConsent: true });
      toast('Google connected', 'ok');
    });

  const updatePackage = (id: string, p: Partial<Package>) => patch({ packages: settings.packages.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  const addPackage = (isAddOn: boolean) => patch({ packages: [...settings.packages, { id: uid(), name: isAddOn ? 'New add-on' : 'New package', price: 0, description: '', isAddOn }] });
  const removePackage = (p: Package) => {
    const used = bookings.some((b) => b.packageId === p.id || b.addOnIds.includes(p.id));
    if (used) {
      updatePackage(p.id, { archived: true });
      toast(`${p.name} is used by existing bookings, so it was archived instead of deleted.`, 'info');
    } else if (confirm(`Delete ${p.name}?`)) {
      patch({ packages: settings.packages.filter((x) => x.id !== p.id) });
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <>
      <PageHeader title="Settings" />

      <section className="card">
        <h2 className="card-title">Packages &amp; prices</h2>
        <p className="muted">These fill in the price on new bookings. You can still change the price on any booking.</p>
        <div className="table-wrap">
          <table className="table table-edit">
            <thead>
              <tr>
                <th>Name</th>
                <th style={{ width: 110 }}>Price</th>
                <th>What’s included</th>
                <th style={{ width: 90 }}>Add-on</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {settings.packages.map((p) => (
                <tr key={p.id} className={p.archived ? 'row-muted' : ''}>
                  <td>
                    <input defaultValue={p.name} onBlur={(e) => e.target.value !== p.name && updatePackage(p.id, { name: e.target.value })} aria-label="Package name" />
                  </td>
                  <td>
                    <input type="number" min={0} step="0.01" defaultValue={p.price} onBlur={(e) => Number(e.target.value) !== p.price && updatePackage(p.id, { price: Number(e.target.value) })} aria-label="Price" />
                  </td>
                  <td>
                    <input defaultValue={p.description} onBlur={(e) => e.target.value !== p.description && updatePackage(p.id, { description: e.target.value })} aria-label="Description" />
                  </td>
                  <td>
                    <input type="checkbox" checked={p.isAddOn} onChange={(e) => updatePackage(p.id, { isAddOn: e.target.checked })} aria-label="Is add-on" />
                  </td>
                  <td>
                    {p.archived ? (
                      <button className="link" onClick={() => updatePackage(p.id, { archived: false })}>
                        Restore
                      </button>
                    ) : (
                      <button className="link danger" onClick={() => removePackage(p)}>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row">
          <button className="btn" onClick={() => addPackage(false)}>
            + Package
          </button>
          <button className="btn" onClick={() => addPackage(true)}>
            + Add-on
          </button>
        </div>
      </section>

      <TemplatesEditor templates={settings.templates} onChange={(templates) => patch({ templates })} />

      <section className="card">
        <h2 className="card-title">Business defaults</h2>
        <div className="grid grid-3">
          <Field label="Business name">
            <input defaultValue={settings.businessName} key={settings.businessName} onBlur={(e) => patch({ businessName: e.target.value })} />
          </Field>
          <Field label="Currency">
            <select value={settings.currency} onChange={(e) => patch({ currency: e.target.value })}>
              {['GBP', 'EUR', 'USD', 'AUD'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Default deposit" hint={money(settings.defaultDeposit, settings.currency)}>
            <input type="number" min={0} defaultValue={settings.defaultDeposit} key={settings.defaultDeposit} onBlur={(e) => patch({ defaultDeposit: Number(e.target.value) })} />
          </Field>
          <Field label="Home time zone" hint="Used for new races">
            <select value={settings.defaultTimeZone} onChange={(e) => patch({ defaultTimeZone: e.target.value })}>
              {COMMON_TIME_ZONES.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Google Calendar</h2>
        {!settings.googleClientId || !connected ? (
          <details className="setup" open={!settings.googleClientId}>
            <summary>One-time setup (about 5 minutes)</summary>
            <ol>
              <li>
                Go to <a className="link" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">Google Cloud Console</a> and create a project, e.g. “Race Day CRM”.
              </li>
              <li>
                Enable the <a className="link" href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">Google Calendar API</a> and the{' '}
                <a className="link" href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noreferrer">Google Drive API</a> (Drive is used to sync between your laptop and phone).
              </li>
              <li>
                Under <a className="link" href="https://console.cloud.google.com/auth/branding" target="_blank" rel="noreferrer">Google Auth Platform</a>, set up the consent screen as <em>External</em>, then add your own Google address under <em>Audience → Test users</em>.
              </li>
              <li>
                Under <a className="link" href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">Clients</a>, create an OAuth client of type <em>Web application</em>. Add <code>{origin}</code> to <em>Authorised JavaScript origins</em>, plus the address you host the app at.
              </li>
              <li>Copy the Client ID (it ends in <code>.apps.googleusercontent.com</code>) and paste it below.</li>
            </ol>
            <p className="muted small">Google will say “Google hasn’t verified this app”. That’s expected for your own private app: choose Continue.</p>
          </details>
        ) : null}
        <div className="grid">
          <Field label="OAuth Client ID" wide>
            <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="1234567890-abc.apps.googleusercontent.com" spellCheck={false} />
          </Field>
        </div>
        <div className="row">
          {connected ? (
            <>
              <span className="ok-text">● Connected</span>
              <button className="btn" onClick={() => disconnectGoogle()}>
                Disconnect
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={connect} disabled={!clientId.trim() || busy === 'connect'}>
              {busy === 'connect' ? 'Connecting…' : 'Connect Google'}
            </button>
          )}
        </div>

        <div className="grid grid-3 spaced">
          <Field label="Calendar for bookings">
            <select value={settings.calendarId} onChange={(e) => patch({ calendarId: e.target.value })} disabled={!connected}>
              <option value="primary">Main calendar</option>
              {calendars
                .filter((c) => !c.primary)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.summary}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Default meet time" hint="Minutes before their start time, unless a booking has its own meet time">
            <input type="number" min={0} step={5} defaultValue={settings.calendarLeadMin} key={`l${settings.calendarLeadMin}`} onBlur={(e) => patch({ calendarLeadMin: Number(e.target.value) })} />
          </Field>
          <Field label="Coverage after start (minutes)" hint="The calendar entry runs from meet time until this long after their start">
            <input type="number" min={15} step={15} defaultValue={settings.coverageAfterStartMin} key={`d${settings.coverageAfterStartMin}`} onBlur={(e) => patch({ coverageAfterStartMin: Number(e.target.value) })} />
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={settings.autoSyncCalendar} onChange={(e) => patch({ autoSyncCalendar: e.target.checked })} />
          Update Google Calendar automatically whenever I save a booking
        </label>
        <p className="muted small">
          Each client gets their own entry: start time, package, deposit status, balance due and music in the description. Red means no deposit, yellow means deposit paid with balance due, green means paid in full. Bookings without a start time show as an all-day entry marked “Start time TBC”.
        </p>
        <div className="row">
          <button
            className="btn"
            disabled={!settings.googleClientId || !!busy}
            onClick={() =>
              run('cal', async () => {
                await getAccessToken(settings.googleClientId);
                const r = await syncAllToCalendar();
                if (r.failed.length) toast(`Synced ${r.synced}, ${r.failed.length} failed: ${r.failed[0].name}: ${r.failed[0].error}`, 'error');
                else toast(r.synced ? `Synced ${r.synced} booking(s)` : 'Calendar already up to date', 'ok');
              })
            }
          >
            {busy === 'cal' ? 'Syncing…' : 'Sync all bookings to calendar now'}
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Laptop ↔ phone sync</h2>
        <p className="muted">
          Your data is stored on this device. To use the app on your phone as well, connect the same Google account there and press sync. Data goes into a private app folder in your Google Drive that only this app can see. The app also syncs by itself when it opens and when you come back to it.
        </p>
        <div className="row">
          <button
            className="btn btn-primary"
            disabled={!settings.googleClientId || !!busy}
            onClick={() =>
              run('drive', async () => {
                await getAccessToken(settings.googleClientId);
                await syncWithDrive();
                toast('Synced with Google Drive', 'ok');
              })
            }
          >
            {busy === 'drive' ? 'Syncing…' : 'Sync now'}
          </button>
          <span className="muted small">{settings.lastDriveSync ? `Last synced ${new Date(settings.lastDriveSync).toLocaleString('en-GB')}` : 'Never synced'}</span>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Backup &amp; export</h2>
        <div className="row">
          <button className="btn" onClick={() => exportBackup()}>
            Download backup (.json)
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Restore from backup…
          </button>
          <button className="btn" onClick={() => exportBookingsCsv(bookings, events, settings)} disabled={!bookings.length}>
            Export clients (.csv)
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f)
                run('restore', async () => {
                  const r = await importBackup(f);
                  toast(`Backup merged: ${r.bookings} new booking(s), ${r.events} new race(s)`, 'ok');
                });
            }}
          />
        </div>
        <p className="muted small">Restoring merges the backup with what’s here. Where both have the same booking, the most recently edited copy is kept.</p>
      </section>
    </>
  );
}

function TemplatesEditor({ templates, onChange }: { templates: MessageTemplate[]; onChange: (t: MessageTemplate[]) => void }) {
  const refs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const update = (id: string, p: Partial<MessageTemplate>) => onChange(templates.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const insert = (t: MessageTemplate, key: string) => {
    const el = refs.current[t.id];
    const token = `{${key}}`;
    if (!el) return update(t.id, { body: t.body + token });
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const body = el.value.slice(0, start) + token + el.value.slice(end);
    update(t.id, { body });
    // The textarea remounts with the new text, so look it up again before restoring the cursor.
    requestAnimationFrame(() => {
      const node = refs.current[t.id];
      node?.focus();
      node?.setSelectionRange(start + token.length, start + token.length);
    });
  };
  const missingDefaults = DEFAULT_TEMPLATES.filter((d) => !templates.some((t) => t.id === d.id));

  return (
    <section className="card">
      <h2 className="card-title">Message templates</h2>
      <p className="muted">
        Click a <code>{'{placeholder}'}</code> to insert it at the cursor; it’s filled in from the booking. Wrap a part in <code>[[ ]]</code> to leave it out when a detail inside is empty, e.g. <code>[[ by {'{meet_point}'}]]</code>.
      </p>
      {templates.map((t) => (
        <div key={t.id} className="template-edit">
          <div className="template-edit-head">
            <input defaultValue={t.name} key={`n${t.name}`} onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && update(t.id, { name: e.target.value.trim() })} aria-label="Template name" />
            <select value={t.audience} onChange={(e) => update(t.id, { audience: e.target.value as Audience })} aria-label="Usually sent to" title="Pre-selects these clients when messaging a whole race">
              {AUDIENCES.map((a) => (
                <option key={a.id} value={a.id}>
                  For: {a.label}
                </option>
              ))}
            </select>
            <button className="link danger" onClick={() => confirm(`Delete “${t.name}”?`) && onChange(templates.filter((x) => x.id !== t.id))}>
              Delete
            </button>
          </div>
          <textarea
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            rows={4}
            defaultValue={t.body}
            key={`b${t.body}`}
            onBlur={(e) => e.target.value !== t.body && update(t.id, { body: e.target.value })}
            aria-label={`${t.name} text`}
          />
          <div className="placeholder-chips">
            {PLACEHOLDERS.map((p) => (
              <button key={p.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(t, p.key)} title={`Insert ${p.label}`}>
                {`{${p.key}}`}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="row spaced">
        <button className="btn" onClick={() => onChange([...templates, { id: uid(), name: 'New template', audience: 'all', body: 'Hey {first_name}, ' }])}>
          + Template
        </button>
        {missingDefaults.length ? (
          <button className="btn" onClick={() => onChange([...templates, ...missingDefaults])}>
            Restore {missingDefaults.length} default template{missingDefaults.length === 1 ? '' : 's'}
          </button>
        ) : null}
      </div>
    </section>
  );
}
