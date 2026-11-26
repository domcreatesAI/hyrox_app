import type { ReactNode } from 'react';
import type { Booking, BookingStatus } from '../types';
import { STATUSES } from '../types';

export function Badge({ tone = 'neutral', children, title }: { tone?: 'ok' | 'warn' | 'bad' | 'neutral' | 'accent'; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  const tone = status === 'delivered' ? 'ok' : status === 'cancelled' ? 'neutral' : status === 'enquiry' ? 'warn' : 'accent';
  return <Badge tone={tone}>{STATUSES.find((s) => s.id === status)?.label ?? status}</Badge>;
}

export function PaymentBadges({ b }: { b: Booking }) {
  return (
    <span className="badge-row">
      {b.depositPaid ? <Badge tone="ok">Deposit ✓</Badge> : <Badge tone="bad">No deposit</Badge>}
      {b.balancePaid ? <Badge tone="ok">Paid in full</Badge> : null}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children ? <div className="muted">{children}</div> : null}
    </div>
  );
}

export function Field({ label, children, hint, wide }: { label: string; children: ReactNode; hint?: ReactNode; wide?: boolean }) {
  return (
    <label className={`field${wide ? ' field-wide' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
