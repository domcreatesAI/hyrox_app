import type { Audience, Booking, MessageTemplate, RaceEvent, Settings } from '../types';
import { formatDate, money } from './format';
import { balanceDue, meetTimeFor } from './calendar';

export const PLACEHOLDERS: { key: string; label: string }[] = [
  { key: 'first_name', label: 'first name' },
  { key: 'name', label: 'full name' },
  { key: 'partner', label: 'partner' },
  { key: 'race', label: 'race' },
  { key: 'race_day', label: 'race day' },
  { key: 'venue', label: 'venue' },
  { key: 'start_time', label: 'start time' },
  { key: 'meet_time', label: 'meet time' },
  { key: 'meet_point', label: 'meet point' },
  { key: 'package', label: 'package' },
  { key: 'price', label: 'price' },
  { key: 'deposit', label: 'deposit' },
  { key: 'balance', label: 'balance due' },
  { key: 'track', label: 'track' },
  { key: 'business', label: 'business name' }
];

export const AUDIENCES: { id: Audience; label: string }[] = [
  { id: 'all', label: 'Everyone' },
  { id: 'enquiry', label: 'Enquiries (not booked yet)' },
  { id: 'no-deposit', label: 'No deposit yet' },
  { id: 'no-start', label: 'No start time yet' },
  { id: 'no-music', label: 'No music yet' },
  { id: 'balance-due', label: 'Balance still due' }
];

export const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: 'booking-deposit',
    name: 'Booking + deposit request',
    audience: 'no-deposit',
    body:
      "Nice one {first_name}, I've got you down for {race}[[ on {race_day}]] 👊 {package}, {price} total.\n\n" +
      "To confirm the booking I take a {deposit} deposit upfront which secures your slot. The rest is due on the day. Could you send me your email and I'll get the invoice over to you?"
  },
  {
    id: 'deposit-reminder',
    name: 'Deposit reminder',
    audience: 'no-deposit',
    body: "Hey {first_name}, quick one about {race}. I'm still holding your slot but haven't seen the {deposit} deposit come through yet. Once that's in you're locked in 👊"
  },
  {
    id: 'start-times-out',
    name: 'Start times are out',
    audience: 'no-start',
    body: "Hey {first_name}, {race} start times are out 👀 What's your wave time? Send it over and I'll plan my day around you 👊"
  },
  {
    id: 'music-check',
    name: 'Music check',
    audience: 'no-music',
    body: "Hey {first_name}, for your {package}, have you got a track in mind? Send me the song (Spotify or YouTube link is perfect) or just the vibe you're after 🎵"
  },
  {
    id: 'race-day-plan',
    name: 'Race-day plan',
    audience: 'all',
    body:
      "Hey {first_name}, all set for {race_day} 👊 Your start is {start_time}, so let's meet at {meet_time}[[ by {meet_point}]]. I'll be with you before, during and after." +
      '[[ Balance of {balance} is due on the day.]] Any questions, shout.'
  },
  {
    id: 'quiet-lead',
    name: 'Follow-up (gone quiet)',
    audience: 'enquiry',
    body: "Hey {first_name}, just following up as {race} is coming up fast. Still have a slot available if you're still interested. Happy to answer any questions 👊"
  },
  {
    id: 'delivered',
    name: 'Content delivered',
    audience: 'all',
    body: 'Hey {first_name}, your {package} from {race} is ready 🎥 Check your inbox for the link. If you post anything, tag @{business} so I can share it 👊'
  }
];

export function matchesAudience(b: Booking, a: Audience): boolean {
  if (b.status === 'cancelled') return false;
  switch (a) {
    case 'enquiry':
      return b.status === 'enquiry';
    case 'no-deposit':
      return !b.depositPaid;
    case 'no-start':
      return !b.startTime;
    case 'no-music':
      return !b.music.track && !b.music.style;
    case 'balance-due':
      return balanceDue(b) > 0;
    default:
      return true;
  }
}

export function templateValues(b: Booking, ev: RaceEvent | undefined, s: Settings): Record<string, string> {
  const c = s.currency;
  const pkg = s.packages.find((p) => p.id === b.packageId)?.name ?? '';
  const extras = b.addOnIds.map((id) => s.packages.find((p) => p.id === id)?.name).filter(Boolean);
  const due = balanceDue(b);
  return {
    first_name: b.clientName.trim().split(/\s+/)[0] ?? '',
    name: b.clientName.trim(),
    partner: b.partner,
    race: ev?.name ?? '',
    race_day: b.raceDate ? formatDate(b.raceDate, { weekday: 'long', day: 'numeric', month: 'long' }) : '',
    venue: ev?.location ?? '',
    start_time: b.startTime,
    meet_time: meetTimeFor(b, s).time,
    meet_point: b.meetPoint ?? '',
    package: [pkg, ...extras].filter(Boolean).join(' + '),
    price: b.price ? money(b.price, c) : '',
    deposit: b.depositAmount ? money(b.depositAmount, c) : '',
    balance: due > 0 ? money(due, c) : '',
    track: [b.music.track, b.music.artist].filter(Boolean).join(' – ') || b.music.style,
    business: s.businessName
  };
}

/**
 * Fill a template. {key} inserts a value; [[ ... ]] is dropped entirely when any
 * placeholder inside it is empty. Empty placeholders outside [[ ]] become [label]
 * and are reported in `missing` so you can spot them before sending.
 */
export function renderTemplate(body: string, values: Record<string, string>): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const label = (k: string) => PLACEHOLDERS.find((p) => p.key === k)?.label ?? k;
  const withOptional = body.replace(/\[\[([\s\S]*?)\]\]/g, (_m, inner: string) => {
    const keys = [...inner.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    return keys.every((k) => (values[k] ?? '').trim()) ? inner : '';
  });
  const text = withOptional.replace(/\{(\w+)\}/g, (m, k: string) => {
    if (!(k in values)) return m;
    const v = (values[k] ?? '').trim();
    if (v) return v;
    missing.add(label(k));
    return `[${label(k)}]`;
  });
  return { text, missing: [...missing] };
}

/** Best-effort international number for WhatsApp links. UK 07… numbers become 447…. */
export function whatsappNumber(phone: string): string {
  const raw = phone.trim();
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) digits = `44${digits.slice(1)}`;
  return digits;
}

export function contactLinks(b: Booking, text: string, subject: string) {
  const handle = b.instagram.replace(/^@/, '').trim();
  const wa = whatsappNumber(b.phone);
  return {
    instagram: handle ? `https://ig.me/m/${encodeURIComponent(handle)}` : '',
    whatsapp: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(text)}` : '',
    sms: b.phone.trim() ? `sms:${b.phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(text)}` : '',
    email: b.email.trim() ? `mailto:${encodeURIComponent(b.email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}` : ''
  };
}
