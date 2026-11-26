/**
 * Google sign-in using Google Identity Services (browser OAuth token flow).
 * No backend needed: the access token lives in the browser and expires after ~1 hour.
 */

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/drive.appdata'
].join(' ');

const TOKEN_KEY = 'gtoken';
const CONSENT_KEY = 'gconsented';

interface StoredToken {
  accessToken: string;
  expiresAt: number;
  clientId: string;
}

/* Minimal typings for the bits of GIS we use. */
interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type: string; message?: string }) => void;
          }): TokenClient;
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

let gisPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gisPromise = null;
        reject(new Error('Could not load Google sign-in. Check your internet connection.'));
      };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

const listeners = new Set<() => void>();
export function onGoogleChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn());

function readToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as StoredToken;
    return t.expiresAt > Date.now() + 60_000 ? t : null;
  } catch {
    return null;
  }
}

export function hasConsented(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

/** True when a usable (non-expired) token is cached. */
export function hasValidToken(): boolean {
  return readToken() !== null;
}

let inflight: Promise<string> | null = null;

/**
 * Returns an access token, opening the Google consent popup if required.
 * Call from a click handler the first time so the popup isn't blocked.
 */
export async function getAccessToken(clientId: string, opts: { forceConsent?: boolean } = {}): Promise<string> {
  if (!clientId) throw new Error('Add your Google OAuth Client ID in Settings first.');
  const cached = readToken();
  if (cached && cached.clientId === clientId && !opts.forceConsent) return cached.accessToken;
  if (inflight) return inflight;

  inflight = (async () => {
    await loadGis();
    return new Promise<string>((resolve, reject) => {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (r) => {
          if (r.error || !r.access_token) {
            reject(new Error(r.error_description || r.error || 'Google sign-in failed'));
            return;
          }
          const t: StoredToken = {
            accessToken: r.access_token,
            expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000,
            clientId
          };
          try {
            localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
            localStorage.setItem(CONSENT_KEY, '1');
          } catch {
            /* storage unavailable: token still works for this call */
          }
          emit();
          resolve(t.accessToken);
        },
        error_callback: (e) => {
          reject(new Error(e.type === 'popup_closed' ? 'Google sign-in was closed.' : e.message || `Google sign-in failed (${e.type}). Allow pop-ups for this app.`));
        }
      });
      client.requestAccessToken({ prompt: hasConsented() && !opts.forceConsent ? '' : 'consent' });
    });
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function disconnectGoogle(): void {
  const t = readToken();
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CONSENT_KEY);
  } catch {
    /* ignore */
  }
  if (t && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(t.accessToken);
  emit();
}

export class GoogleApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** fetch() against a Google API with auth, retrying once on an expired token. */
export async function gfetch<T = unknown>(clientId: string, url: string, init: RequestInit = {}): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getAccessToken(clientId);
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {})
      }
    });
    if (res.status === 401 && attempt === 0) {
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch {
        /* ignore */
      }
      continue;
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!res.ok) {
      let msg = `Google API error ${res.status}`;
      try {
        msg = JSON.parse(text)?.error?.message ?? msg;
      } catch {
        /* keep default */
      }
      throw new GoogleApiError(res.status, msg);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }
  throw new GoogleApiError(401, 'Google session expired. Reconnect in Settings.');
}
