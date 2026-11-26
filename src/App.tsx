import { useEffect, useRef } from 'react';
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { BookingEditorProvider, useBookingEditor } from './components/BookingEditor';
import { MessageComposerProvider } from './components/MessageComposer';
import { ToastProvider } from './components/Toast';
import { getSettings } from './db';
import { syncWithDrive } from './lib/drive';
import { hasValidToken } from './lib/google';
import { useGoogleConnected, useSettings } from './lib/hooks';
import { Clients } from './pages/Clients';
import { Dashboard } from './pages/Dashboard';
import { Import } from './pages/Import';
import { RaceDetail } from './pages/RaceDetail';
import { Races } from './pages/Races';
import { Settings } from './pages/Settings';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '◧', end: true },
  { to: '/races', label: 'Races', icon: '⚑' },
  { to: '/clients', label: 'Clients', icon: '☰' },
  { to: '/import', label: 'Import', icon: '⇣', desktopOnly: true },
  { to: '/settings', label: 'Settings', icon: '⚙' }
];

/** Quietly sync with Drive on launch and when the window regains focus, if already signed in. */
function useBackgroundDriveSync() {
  const last = useRef(0);
  useEffect(() => {
    const tick = async () => {
      if (!hasValidToken() || Date.now() - last.current < 120_000) return;
      const s = await getSettings();
      if (!s.googleClientId) return;
      last.current = Date.now();
      try {
        await syncWithDrive();
      } catch {
        /* silent: the user can sync manually from Settings */
      }
    };
    tick();
    const onVis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', tick);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', tick);
    };
  }, []);
}

function Shell() {
  const settings = useSettings();
  const connected = useGoogleConnected();
  const openEditor = useBookingEditor();
  useBackgroundDriveSync();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ●
          </span>
          <span>
            <strong>Race Day CRM</strong>
            <span className="brand-sub">{settings.businessName}</span>
          </span>
        </div>
        <button className="btn btn-primary btn-block" onClick={() => openEditor({})}>
          + New booking
        </button>
        <nav className="nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}${n.desktopOnly ? ' desktop-only' : ''}`}>
              <span className="nav-icon" aria-hidden>
                {n.icon}
              </span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <NavLink to="/settings" className="google-chip">
          <span className={connected ? 'dot dot-ok' : 'dot'} />
          {connected ? 'Google connected' : settings.googleClientId ? 'Google: reconnect' : 'Google not set up'}
        </NavLink>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/races" element={<Races />} />
          <Route path="/races/:id" element={<RaceDetail />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/import" element={<Import />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <button className="fab" onClick={() => openEditor({})} aria-label="New booking">
        +
      </button>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <MessageComposerProvider>
          <BookingEditorProvider>
            <Shell />
          </BookingEditorProvider>
        </MessageComposerProvider>
      </ToastProvider>
    </HashRouter>
  );
}
