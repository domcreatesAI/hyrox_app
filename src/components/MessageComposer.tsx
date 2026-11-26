import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { logMessage } from '../lib/data';
import { relativeDay, todayISO } from '../lib/format';
import { useBookings, useEvents, useSettings } from '../lib/hooks';
import { AUDIENCES, contactLinks, matchesAudience, renderTemplate, templateValues } from '../lib/templates';
import type { Booking } from '../types';
import { useToast } from './Toast';

interface OpenArgs {
  /** A single (possibly unsaved) booking, e.g. from the booking editor. */
  booking?: Booking;
  /** Message several clients of one race. */
  eventId?: string;
  templateId?: string;
}

const Ctx = createContext<(a: OpenArgs) => void>(() => {});
export const useMessageComposer = () => useContext(Ctx);

export function MessageComposerProvider({ children }: { children: ReactNode }) {
  const [args, setArgs] = useState<OpenArgs | null>(null);
  const open = useCallback((a: OpenArgs) => setArgs(a), []);
  return (
    <Ctx.Provider value={open}>
      {children}
      {args ? <Composer args={args} onClose={() => setArgs(null)} /> : null}
    </Ctx.Provider>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function daysAgo(ms: number) {
  const d = new Date(ms);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return iso === todayISO() ? 'today' : relativeDay(iso);
}

function Composer({ args, onClose }: { args: OpenArgs; onClose: () => void }) {
  const settings = useSettings();
  const events = useEvents();
  const all = useBookings();
  const toast = useToast();
  const templates = settings.templates;
  const [templateId, setTemplateId] = useState(args.templateId ?? templates[0]?.id ?? '');
  const template = templates.find((t) => t.id === templateId) ?? templates[0];
  const bulk = !args.booking;

  // Pool of clients: the one passed in, or everyone at the race.
  const pool = useMemo(() => {
    if (args.booking) {
      const saved = all.find((b) => b.id === args.booking!.id);
      return [{ ...args.booking, messageLog: saved?.messageLog ?? args.booking.messageLog }];
    }
    return all
      .filter((b) => b.eventId === args.eventId && b.status !== 'cancelled')
      .sort((a, b) => (a.raceDate + (a.startTime || '99')).localeCompare(b.raceDate + (b.startTime || '99')));
  }, [args.booking, args.eventId, all]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Set<string>>(new Set());

  // Re-select the template's usual audience whenever the template changes
  // (and once the client list has loaded from the database).
  const poolReady = pool.length > 0;
  useEffect(() => {
    if (!template || !poolReady) return;
    setSelected(new Set(bulk ? pool.filter((b) => matchesAudience(b, template.audience)).map((b) => b.id) : pool.map((b) => b.id)));
    setEdits({});
  }, [templateId, bulk, poolReady]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!template) {
    return (
      <div className="drawer-backdrop drawer-top" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className="drawer">
          <div className="drawer-head">
            <h2>Message</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div className="drawer-body">
            <p className="muted">No templates yet. Add some in Settings → Message templates.</p>
          </div>
        </div>
      </div>
    );
  }

  const race = (b: Booking) => events.find((e) => e.id === b.eventId);
  const rendered = (b: Booking) => renderTemplate(template.body, templateValues(b, race(b), settings));
  const textFor = (b: Booking) => edits[b.id] ?? rendered(b).text;
  const audienceLabel = AUDIENCES.find((a) => a.id === template.audience)?.label;

  const act = async (b: Booking, how: 'copy' | 'instagram' | 'whatsapp' | 'sms' | 'email') => {
    const text = textFor(b);
    const links = contactLinks(b, text, `${race(b)?.name ?? 'Your race'}: ${template.name}`);
    if (how === 'copy' || how === 'instagram') {
      const ok = await copyText(text);
      if (!ok) toast('Couldn’t copy automatically. Select the text and copy it.', 'warn');
      else toast(how === 'instagram' ? 'Copied. Paste it into the Instagram chat.' : 'Message copied', 'ok');
      if (how === 'instagram') window.open(links.instagram, '_blank', 'noopener');
    } else {
      window.open(links[how], how === 'email' || how === 'sms' ? '_self' : '_blank', 'noopener');
    }
    setDone((d) => new Set(d).add(b.id));
    await logMessage(b.id, template.id, template.name);
  };

  const shown = bulk ? pool.filter((b) => selected.has(b.id)) : pool;

  return (
    <div className="drawer-backdrop drawer-top" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-label="Message clients">
        <div className="drawer-head">
          <h2>{bulk ? `Message clients · ${events.find((e) => e.id === args.eventId)?.name ?? ''}` : `Message ${pool[0]?.clientName || 'client'}`}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="drawer-body">
          <section className="form-section">
            <div className="template-pills" role="tablist" aria-label="Template">
              {templates.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={t.id === templateId} className={`pill${t.id === templateId ? ' pill-on' : ''}`} onClick={() => setTemplateId(t.id)}>
                  {t.name}
                </button>
              ))}
            </div>
          </section>

          {bulk ? (
            <section className="form-section">
              <h3>
                Send to <span className="muted normal">· pre-selected: {audienceLabel?.toLowerCase()}</span>
              </h3>
              {pool.length === 0 ? (
                <p className="muted">No clients at this race yet.</p>
              ) : (
                <div className="checks checks-col">
                  {pool.map((b) => (
                    <label key={b.id} className="check">
                      <input
                        type="checkbox"
                        checked={selected.has(b.id)}
                        onChange={(e) =>
                          setSelected((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(b.id);
                            else n.delete(b.id);
                            return n;
                          })
                        }
                      />
                      <span>
                        {b.clientName}
                        <span className="muted small">
                          {' '}
                          · {b.startTime || 'no start time'} · {b.depositPaid ? 'deposit ✓' : 'no deposit'}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {shown.map((b) => {
            const { missing } = rendered(b);
            const links = contactLinks(b, textFor(b), template.name);
            const last = [...(b.messageLog ?? [])].reverse().find((m) => m.templateId === template.id);
            return (
              <section key={b.id} className={`form-section msg-card${done.has(b.id) ? ' msg-done' : ''}`}>
                <div className="msg-head">
                  <strong>{b.clientName}</strong>
                  {done.has(b.id) ? <span className="badge badge-ok">Sent ✓</span> : last ? <span className="muted small">Last sent {daysAgo(last.at)}</span> : null}
                </div>
                {missing.length && edits[b.id] === undefined ? <p className="warn-text small">Missing: {missing.join(', ')}. Fill it in on the booking or edit the text below.</p> : null}
                <textarea rows={Math.min(10, Math.max(4, Math.ceil(textFor(b).length / 60)))} value={textFor(b)} onChange={(e) => setEdits((x) => ({ ...x, [b.id]: e.target.value }))} aria-label={`Message to ${b.clientName}`} />
                <div className="row msg-actions">
                  <button type="button" className="btn btn-primary" onClick={() => act(b, 'copy')}>
                    Copy
                  </button>
                  {links.instagram ? (
                    <button type="button" className="btn" onClick={() => act(b, 'instagram')} title="Copies the message, then opens the Instagram chat">
                      Instagram
                    </button>
                  ) : null}
                  {links.whatsapp ? (
                    <button type="button" className="btn" onClick={() => act(b, 'whatsapp')}>
                      WhatsApp
                    </button>
                  ) : null}
                  {links.sms ? (
                    <button type="button" className="btn" onClick={() => act(b, 'sms')}>
                      Text
                    </button>
                  ) : null}
                  {links.email ? (
                    <button type="button" className="btn" onClick={() => act(b, 'email')}>
                      Email
                    </button>
                  ) : null}
                  {!links.instagram && !links.whatsapp && !links.sms && !links.email ? <span className="muted small">Add an Instagram handle, phone or email to message directly.</span> : null}
                </div>
              </section>
            );
          })}
          {bulk && shown.length === 0 && pool.length ? <p className="muted">Tick the clients you want to message.</p> : null}
        </div>
        <div className="drawer-foot">
          <span className="muted small">{bulk ? `${done.size} of ${shown.length} messaged` : 'Instagram can’t pre-fill text, so the message is copied for you to paste.'}</span>
          <button type="button" className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
