import { balanceDue, packageLabel } from './calendar';
import { localSnapshot, mergeSnapshot, type Snapshot } from './drive';
import { todayISO } from './format';
import type { Booking, RaceEvent, Settings } from '../types';

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportBackup() {
  const snap = await localSnapshot();
  const { googleClientId: _omit, lastDriveSync: _omit2, ...settings } = snap.settings;
  download(`race-day-crm-backup-${todayISO()}.json`, JSON.stringify({ ...snap, settings }, null, 2), 'application/json');
}

export async function importBackup(file: File) {
  const text = await file.text();
  let data: Snapshot;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  return mergeSnapshot(data);
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportBookingsCsv(bookings: Booking[], events: RaceEvent[], s: Settings) {
  const header = [
    'Race', 'Race date', 'Start time', 'Wave', 'Division', 'Client', 'Partner', 'Instagram', 'Phone', 'Email',
    'Package', 'Price', 'Deposit', 'Deposit paid', 'Deposit paid on', 'Balance paid', 'Balance due',
    'Track', 'Artist', 'Music link', 'Music style', 'Status', 'Notes'
  ];
  const rows = bookings.map((b) => [
    events.find((e) => e.id === b.eventId)?.name ?? '', b.raceDate, b.startTime, b.wave, b.division, b.clientName, b.partner,
    b.instagram, b.phone, b.email, packageLabel(b, s.packages), b.price, b.depositAmount, b.depositPaid ? 'Yes' : 'No',
    b.depositPaidOn, b.balancePaid ? 'Yes' : 'No', balanceDue(b), b.music.track, b.music.artist, b.music.link, b.music.style,
    b.status, b.notes
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
  download(`race-day-clients-${todayISO()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
}
