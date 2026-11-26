import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { db } from '../db';
import { deleteBooking, newBooking, saveBooking } from '../lib/data';
import { addDays, daysBetween, formatDate, money, normaliseHandle, todayISO } from '../lib/format';
import { useEvents, useSettings } from '../lib/hooks';
import { balanceDue } from '../lib/calendar';
import { DIVISIONS, STATUSES, type Booking, type Settings } from '../types';
import { Field } from './ui';
import { useToast } from './Toast';

type OpenArgs = { id: string } | { eventId?: string; raceDate?: string };
const EditorCtx = createContext<(args: OpenArgs) => void>(() => {});
export const useBookingEditor = () => useContext(EditorCtx);

export function BookingEditorProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const [draft, setDraft] = useState<Booking | null>(null);
  const [isNew, setIsNew] = useState(false);

  const open = useCallback(
    async (args: OpenArgs) => {
      if ('id' in args) {
        const b = await db.bookings.get(args.id);
        if (b) {
          setIsNew(false);
          setDraft(structuredClone(b));
        }
      } else {
        let raceDate = args.raceDate;
        if (args.eventId && !raceDate) raceDate = (await db.events.get(args.eventId))?.startDate;
        setIsNew(true);
        setDraft(newBooking(settings, args.eventId, raceDate));
      }
    },
    [settings]
  );

  return (
    <EditorCtx.Provider value={open}>
      {children}
      {draft ? <BookingDrawer key={draft.id} initial={draft} isNew={isNew} settings={settings} onClose={() => setDraft(null)} /> : null}
    </EditorCtx.Provider>
  );
}

function computePrice(s: Settings, packageId: string, addOnIds: string[]) {
  const main = s.packages.find((p) => p.id === packageId)?.price ?? 0;
  return main + addOnIds.reduce((sum, id) => sum + (s.packages.find((p) => p.id === id)?.price ?? 0), 0);
}

function BookingDrawer({ initial, isNew, settings, onClose }: { initial: Booking; isNew: boolean; settings: Settings; onClose: () => void }) {
  const events = useEvents();
  const toast = useToast();
  const [b, setB] = useState<Booking>(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Booking>(k: K, v: Booking[K]) => setB((x) => ({ ...x, [k]: v }));
  const setMusic = (k: keyof Booking['music'], v: string) => setB((x) => ({ ...x, music: { ...x.music, [k]: v } }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ev = events.find((e) => e.id === b.eventId);
  const raceDays = ev ? Array.from({ length: Math.max(1, daysBetween(ev.startDate, ev.endDate) + 1) }, (_, i) => addDays(ev.startDate, i)) : [];
  const mainPackages = settings.packages.filter((p) => !p.isAddOn && (!p.archived || p.id === b.packageId));
  const addOns = settings.packages.filter((p) => p.isAddOn && (!p.archived || b.addOnIds.includes(p.id)));
  const suggested = computePrice(settings, b.packageId, b.addOnIds);

  const pickEvent = (id: string) => {
    const e = events.find((x) => x.id === id);
    setB((x) => ({
      ...x,
      eventId: id,
      raceDate: e && (x.raceDate < e.startDate || x.raceDate > e.endDate) ? e.startDate : x.raceDate
    }));
  };
  const pickPackage = (id: string) => setB((x) => ({ ...x, packageId: id, price: computePrice(settings, id, x.addOnIds) }));
  const toggleAddOn = (id: string) =>
    setB((x) => {
      const addOnIds = x.addOnIds.includes(id) ? x.addOnIds.filter((a) => a !== id) : [...x.addOnIds, id];
      return { ...x, addOnIds, price: computePrice(settings, x.packageId, addOnIds) };
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!b.clientName.trim()) {
      toast('Add the client’s name first.', 'warn');
      return;
    }
    setSaving(true);
    const r = await saveBooking({ ...b, clientName: b.clientName.trim(), instagram: normaliseHandle(b.instagram) });
    setSaving(false);
    if (r.ok === false) toast(`Saved, but calendar sync failed: ${r.error}`, 'error');
    else toast(r.ok ? 'Saved and synced to Google Calendar' : 'Saved', 'ok');
    onClose();
  };

  const remove = async () => {
    if (!confirm(`Delete ${b.clientName || 'this booking'}? This also removes the calendar entry.`)) return;
    const r = await deleteBooking(b.id);
    if (r.ok === false) toast(`Deleted, but couldn't remove the calendar entry: ${r.error}`, 'error');
    else toast('Booking deleted', 'ok');
    onClose();
  };

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="drawer" onSubmit={submit} aria-label={isNew ? 'New booking' : 'Edit booking'}>
        <div className="drawer-head">
          <h2>{isNew ? 'New booking' : b.clientName || 'Edit booking'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="drawer-body">
          <section className="form-section">
            <h3>Client</h3>
            <div className="grid">
              <Field label="Name *">
                <input autoFocus={isNew} value={b.clientName} onChange={(e) => set('clientName', e.target.value)} placeholder="Full name" />
              </Field>
              <Field label="Partner / team" hint="Doubles or relay partner">
                <input value={b.partner} onChange={(e) => set('partner', e.target.value)} />
              </Field>
              <Field label="Instagram">
                <input value={b.instagram} onChange={(e) => set('instagram', e.target.value)} onBlur={(e) => set('instagram', normaliseHandle(e.target.value))} placeholder="@handle" />
              </Field>
              <Field label="Phone">
                <input type="tel" value={b.phone} onChange={(e) => set('phone', e.target.value)} />
              </Field>
              <Field label="Email" wide>
                <input type="email" value={b.email} onChange={(e) => set('email', e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="form-section">
            <h3>Race &amp; start time</h3>
            <div className="grid">
              <Field label="Race" wide>
                <select value={b.eventId} onChange={(e) => pickEvent(e.target.value)}>
                  <option value="">— No race selected —</option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} · {formatDate(e.startDate)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Race day">
                {raceDays.length > 1 ? (
                  <select value={b.raceDate} onChange={(e) => set('raceDate', e.target.value)}>
                    {raceDays.map((d) => (
                      <option key={d} value={d}>
                        {formatDate(d)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input type="date" required value={b.raceDate} onChange={(e) => set('raceDate', e.target.value)} />
                )}
              </Field>
              <Field label="Start time" hint={b.startTime ? (ev ? `Local time · ${ev.timeZone}` : undefined) : 'Leave empty until start waves are out'}>
                <input type="time" value={b.startTime} onChange={(e) => set('startTime', e.target.value)} />
              </Field>
              <Field label="Division">
                <select value={b.division} onChange={(e) => set('division', e.target.value)}>
                  {DIVISIONS.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </Field>
              <Field label="Wave / heat">
                <input value={b.wave} onChange={(e) => set('wave', e.target.value)} placeholder="e.g. 14" />
              </Field>
            </div>
          </section>

          <section className="form-section">
            <h3>Package</h3>
            <div className="choice-grid">
              {mainPackages.map((p) => (
                <button type="button" key={p.id} className={`choice${b.packageId === p.id ? ' choice-on' : ''}`} onClick={() => pickPackage(p.id)} aria-pressed={b.packageId === p.id}>
                  <span className="choice-title">{p.name}</span>
                  <span className="choice-price">{money(p.price, settings.currency)}</span>
                </button>
              ))}
            </div>
            {addOns.length ? (
              <div className="checks">
                {addOns.map((p) => (
                  <label key={p.id} className="check">
                    <input type="checkbox" checked={b.addOnIds.includes(p.id)} onChange={() => toggleAddOn(p.id)} />
                    {p.name} <span className="muted">+{money(p.price, settings.currency)}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </section>

          <section className="form-section">
            <h3>Payment</h3>
            <div className="grid">
              <Field
                label="Total price"
                hint={
                  b.price !== suggested ? (
                    <button type="button" className="link" onClick={() => set('price', suggested)}>
                      Package price is {money(suggested, settings.currency)} — reset
                    </button>
                  ) : (
                    'Agreed price for this booking'
                  )
                }
              >
                <input type="number" min={0} step="0.01" value={b.price} onChange={(e) => set('price', Number(e.target.value))} />
              </Field>
              <Field label="Deposit">
                <input type="number" min={0} step="0.01" value={b.depositAmount} onChange={(e) => set('depositAmount', Number(e.target.value))} />
              </Field>
            </div>
            <div className="pay-rows">
              <div className={`pay-row${b.depositPaid ? ' pay-row-ok' : ' pay-row-bad'}`}>
                <label className="check">
                  <input type="checkbox" checked={b.depositPaid} onChange={(e) => setB((x) => ({ ...x, depositPaid: e.target.checked, depositPaidOn: e.target.checked ? x.depositPaidOn || todayISO() : '' }))} />
                  <strong>Deposit paid</strong>
                </label>
                {b.depositPaid ? <input type="date" value={b.depositPaidOn} onChange={(e) => set('depositPaidOn', e.target.value)} aria-label="Deposit paid on" /> : <span className="muted">Not received yet</span>}
              </div>
              <div className={`pay-row${b.balancePaid ? ' pay-row-ok' : ''}`}>
                <label className="check">
                  <input type="checkbox" checked={b.balancePaid} onChange={(e) => setB((x) => ({ ...x, balancePaid: e.target.checked, balancePaidOn: e.target.checked ? x.balancePaidOn || todayISO() : '' }))} />
                  <strong>Balance paid</strong>
                </label>
                {b.balancePaid ? (
                  <input type="date" value={b.balancePaidOn} onChange={(e) => set('balancePaidOn', e.target.value)} aria-label="Balance paid on" />
                ) : (
                  <span>
                    Due on the day: <strong>{money(balanceDue(b), settings.currency)}</strong>
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className="form-section">
            <h3>Music</h3>
            <div className="grid">
              <Field label="Track">
                <input value={b.music.track} onChange={(e) => setMusic('track', e.target.value)} placeholder="Song title" />
              </Field>
              <Field label="Artist">
                <input value={b.music.artist} onChange={(e) => setMusic('artist', e.target.value)} />
              </Field>
              <Field label="Link" hint="Spotify, YouTube, Apple Music…">
                <input type="url" value={b.music.link} onChange={(e) => setMusic('link', e.target.value)} placeholder="https://" />
              </Field>
              <Field label="Style / vibe" hint="If they haven’t picked an exact track">
                <input value={b.music.style} onChange={(e) => setMusic('style', e.target.value)} placeholder="e.g. hard techno, upbeat pop" />
              </Field>
            </div>
          </section>

          <section className="form-section">
            <h3>Notes &amp; status</h3>
            <div className="grid">
              <Field label="Notes" wide>
                <textarea rows={4} value={b.notes} onChange={(e) => set('notes', e.target.value)} placeholder="What they want captured, outfit / bib number, coach watching, delivery details…" />
              </Field>
              <Field label="Status">
                <select value={b.status} onChange={(e) => set('status', e.target.value as Booking['status'])}>
                  {STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>
        </div>

        <div className="drawer-foot">
          {!isNew ? (
            <button type="button" className="btn btn-danger-ghost" onClick={remove}>
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="row">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
