import { useEffect, useState } from 'react';
import { deleteEvent, saveEvent } from '../lib/data';
import { COMMON_TIME_ZONES } from '../lib/format';
import type { RaceEvent } from '../types';
import { Field } from './ui';
import { useToast } from './Toast';

export function EventEditor({ initial, isNew, bookingCount, onClose, onDeleted }: { initial: RaceEvent; isNew: boolean; bookingCount: number; onClose: () => void; onDeleted?: () => void }) {
  const [ev, setEv] = useState(initial);
  const toast = useToast();
  const set = <K extends keyof RaceEvent>(k: K, v: RaceEvent[K]) => setEv((x) => ({ ...x, [k]: v }));
  const zones = COMMON_TIME_ZONES.includes(ev.timeZone) ? COMMON_TIME_ZONES : [ev.timeZone, ...COMMON_TIME_ZONES];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ev.name.trim()) return toast('Give the race a name.', 'warn');
    const endDate = ev.endDate < ev.startDate ? ev.startDate : ev.endDate;
    await saveEvent({ ...ev, name: ev.name.trim(), endDate });
    toast(isNew ? 'Race added' : 'Race updated', 'ok');
    onClose();
  };

  const remove = async () => {
    const msg = bookingCount ? `Delete ${ev.name}? Its ${bookingCount} booking(s) stay in your client list without a race.` : `Delete ${ev.name}?`;
    if (!confirm(msg)) return;
    await deleteEvent(ev.id);
    toast('Race deleted', 'ok');
    onClose();
    onDeleted?.();
  };

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="drawer drawer-sm" onSubmit={submit}>
        <div className="drawer-head">
          <h2>{isNew ? 'New race' : 'Edit race'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="drawer-body">
          <div className="grid">
            <Field label="Name *" wide>
              <input autoFocus value={ev.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. HYROX Berlin" />
            </Field>
            <Field label="Venue / city" wide>
              <input value={ev.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Messe Berlin" />
            </Field>
            <Field label="First day">
              <input type="date" required value={ev.startDate} onChange={(e) => setEv((x) => ({ ...x, startDate: e.target.value, endDate: x.endDate < e.target.value ? e.target.value : x.endDate }))} />
            </Field>
            <Field label="Last day">
              <input type="date" required min={ev.startDate} value={ev.endDate} onChange={(e) => set('endDate', e.target.value)} />
            </Field>
            <Field label="Time zone" wide hint="Start times you enter are in this zone, so calendar entries land at the right time when you travel.">
              <select value={ev.timeZone} onChange={(e) => set('timeZone', e.target.value)}>
                {zones.map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </Field>
            <Field label="Notes" wide>
              <textarea rows={3} value={ev.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Hotel, media pass, parking, when start lists drop…" />
            </Field>
          </div>
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
            <button type="submit" className="btn btn-primary">
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
