export type BookingStatus = 'enquiry' | 'booked' | 'filmed' | 'delivered' | 'cancelled';

export const STATUSES: { id: BookingStatus; label: string }[] = [
  { id: 'enquiry', label: 'Enquiry' },
  { id: 'booked', label: 'Booked' },
  { id: 'filmed', label: 'Filmed' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' }
];

export const DIVISIONS = [
  'Singles Open',
  'Singles Pro',
  'Doubles Open',
  'Doubles Pro',
  'Mixed Doubles',
  'Relay',
  'Adaptive',
  'Other'
];

export interface Package {
  id: string;
  name: string;
  price: number;
  description: string;
  /** Add-ons are optional extras that can be stacked on a main package. */
  isAddOn: boolean;
  archived?: boolean;
}

/** Fields every synced record carries. */
export interface SyncMeta {
  id: string;
  createdAt: number;
  updatedAt: number;
  /** Soft-delete marker so deletions sync between devices. */
  deleted?: boolean;
}

/** A race weekend, e.g. "HYROX Berlin". */
export interface RaceEvent extends SyncMeta {
  name: string;
  location: string;
  /** IANA time zone the start times are expressed in, e.g. Europe/Berlin. */
  timeZone: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (inclusive)
  notes: string;
}

export interface Music {
  track: string;
  artist: string;
  link: string;
  /** Genre / vibe when no exact track is chosen yet. */
  style: string;
}

/** One client booked at one race. */
export interface Booking extends SyncMeta {
  clientName: string;
  partner: string;
  instagram: string;
  email: string;
  phone: string;

  eventId: string;
  raceDate: string; // YYYY-MM-DD
  /** Start wave time (HH:mm), empty until the race publishes start times. */
  startTime: string;
  wave: string;
  division: string;

  packageId: string;
  addOnIds: string[];
  /** Total agreed price for the whole booking. */
  price: number;

  depositAmount: number;
  depositPaid: boolean;
  depositPaidOn: string;
  balancePaid: boolean;
  balancePaidOn: string;

  music: Music;
  notes: string;
  status: BookingStatus;

  calendarEventId?: string;
  calendarSyncedAt?: number;
}

export interface Settings {
  businessName: string;
  currency: string;
  defaultDeposit: number;
  defaultTimeZone: string;
  /** Length of the calendar block for each client, in minutes. */
  calendarDurationMin: number;
  /** Minutes before start time the calendar block begins (warm-up coverage). */
  calendarLeadMin: number;
  googleClientId: string;
  calendarId: string;
  autoSyncCalendar: boolean;
  packages: Package[];
  /** Last successful Drive sync (ms). */
  lastDriveSync?: number;
  /** Bumped whenever settings change, used to merge settings across devices. */
  updatedAt: number;
}
