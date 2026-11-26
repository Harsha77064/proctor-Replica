import { useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Library, ClipboardList, Trophy, MessageSquareText, ShieldCheck, BarChart3, Settings as SettingsIcon,
  Menu, Search, Bell, Sun, Moon, AlertTriangle, Flag, Video, Users as UsersIcon, LogOut, X, Loader2,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { StoreProvider } from './context/StoreContext.jsx';
import Login from './pages/Login.jsx';
import Setup from './pages/Setup.jsx';
import Users from './pages/Users.jsx';
import { LiveProvider, useLive } from './live/LiveContext.jsx';
import LiveMonitoring from './pages/LiveMonitoring.jsx';
import CandidatePortal from './pages/CandidatePortal.jsx';
import { useStore, byId, timeAgo } from './context/StoreContext.jsx';
import { LogoMark, Avatar } from './components/UI.jsx';
import Dashboard from './pages/Dashboard.jsx';
import QuestionBanks from './pages/QuestionBanks.jsx';
import Exams from './pages/Exams.jsx';
import Results from './pages/Results.jsx';
import Feedback from './pages/Feedback.jsx';
import AuditLogs from './pages/AuditLogs.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';

const THEME_KEY = 'oversee-theme';
function initialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return saved;
  } catch { /* storage unavailable */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function useTheme() {
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);
  return [theme, setTheme];
}

export default function App() {
  return (
    <Routes>
      <Route path="/exam" element={<CandidateApp />} />
      <Route path="/*" element={<AuthProvider><StaffGate /></AuthProvider>} />
    </Routes>
  );
}

/** Shows setup on a fresh install, sign-in when signed out, otherwise the admin app. */
function StaffGate() {
  useTheme();
  const auth = useAuth();
  if (auth.loading) {
    return <div className="auth-page"><Loader2 className="spin muted" size={28} /></div>;
  }
  if (!auth.user) return auth.needsSetup ? <Setup /> : <Login />;
  return (
    <StoreProvider key={auth.user.id}>
      <LiveProvider>
        <AdminApp />
      </LiveProvider>
    </StoreProvider>
  );
}

function CandidateApp() {
  useTheme();
  return <CandidatePortal />;
}

function AdminApp() {
  const { settings, exams, candidates, auditLogs, error, clearError } = useStore();
  const { user, isAdmin, logout } = useAuth();
  const live = useLive();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const org = settings.organization;
  const location = useLocation();
  const camerasOnline = live.peers.filter((p) => !p.left).length;

  const liveCount = exams.filter((e) => e.status === 'Live').length;
  const flagCount = candidates.reduce((a, c) => a + c.cheatingFlags, 0);

  const NAV = [
    { section: 'Overview' },
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { section: 'Assessment' },
    { to: '/question-banks', label: 'Question Bank', icon: Library },
    { to: '/exams', label: 'Exams', icon: ClipboardList, badge: liveCount ? `${liveCount} live` : null, live: true },
    { to: '/results', label: 'Results', icon: Trophy },
    { to: '/feedback', label: 'Feedback', icon: MessageSquareText },
    { section: 'Monitoring' },
    { to: '/live-monitoring', label: 'Live Monitoring', icon: Video, badge: camerasOnline ? `${camerasOnline} on air` : null, live: true },
    { to: '/audit-logs', label: 'Audit Logs', icon: ShieldCheck, badge: flagCount || null },
    { to: '/reports', label: 'Reports', icon: BarChart3 },
    { section: 'System' },
    { to: '/settings', label: 'Settings', icon: SettingsIcon },
    { to: '/users', label: isAdmin ? 'Users' : 'My Account', icon: UsersIcon },
  ];

  return (
    <div className={`layout ${open ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><LogoMark /></div>
          <div>
            <div className="brand-name">Oversee</div>
            <div className="brand-tag">Smart Proctoring</div>
          </div>
        </div>
        <nav>
          {NAV.map((n, i) =>
            n.section ? (
              <div key={i} className="nav-section">{n.section}</div>
            ) : (
              <NavLink key={n.to} to={n.to} className="nav-link" onClick={() => setOpen(false)}>
                <n.icon size={18} />
                {n.label}
                {n.badge && <span className={`nav-badge ${n.live ? 'live' : ''}`}>{n.badge}</span>}
              </NavLink>
            )
          )}
        </nav>
        <div className="org-card">
          {org.logoUrl ? <img src={org.logoUrl} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /> : <span className="org-initial">{(org.name || 'O')[0]}</span>}
          <div>
            <div className="org-name">{org.name}</div>
            <div className="org-mail">{org.supportEmail}</div>
          </div>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(!open)} aria-label="Toggle menu"><Menu size={20} /></button>
          <GlobalSearch />
          <div className="topbar-right">
            <Clock />
            <button
              className="icon-btn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <Notifications logs={auditLogs} candidates={candidates} />
            <div className="user-chip">
              <div className="who"><b>{user.name}</b><span>{isAdmin ? 'Administrator' : 'Proctor'}</span></div>
              <Avatar name={user.name} />
              <button className="icon-btn" onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={18} /></button>
            </div>
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <AlertTriangle size={16} /> <span>{error}</span>
            <button className="icon-btn" onClick={clearError} aria-label="Dismiss"><X size={16} /></button>
          </div>
        )}
        <main className="content" key={location.pathname}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/question-banks" element={<QuestionBanks />} />
            <Route path="/exams" element={<Exams />} />
            <Route path="/results" element={<Results />} />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/live-monitoring" element={<LiveMonitoring />} />
            <Route path="/audit-logs" element={<AuditLogs />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/users" element={<Users />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <form
      className="global-search"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(`/dashboard?q=${encodeURIComponent(q)}`);
      }}
    >
      <Search size={16} />
      <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search candidates by name or ID…" />
      <span className="kbd">Ctrl K</span>
    </form>
  );
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="clock">
      {now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
      {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

function Notifications({ logs, candidates }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const items = logs.filter((l) => l.type === 'Warning').slice(0, 8);
  const flagged = candidates.filter((c) => c.cheatingFlags > 0).slice(0, 3);

  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" onClick={() => setOpen(!open)} aria-label="Notifications">
        <Bell size={19} />
        {items.length > 0 && <span className="ping" />}
      </button>
      {open && (
        <div className="dropdown">
          <div className="dropdown-head">
            Proctoring alerts <span className="badge badge-red plain">{items.length + flagged.length}</span>
          </div>
          <div className="dropdown-list">
            {flagged.map((c) => (
              <div key={c.id} className="notif">
                <div className="notif-icon badge-red"><Flag size={15} /></div>
                <div>
                  <b>{c.name}</b> has {c.cheatingFlags} cheating flag{c.cheatingFlags > 1 ? 's' : ''}
                  <div className="muted small">{c.department} · {c.id}</div>
                </div>
              </div>
            ))}
            {items.map((l) => (
              <div key={l.id} className="notif">
                <div className="notif-icon badge-amber"><AlertTriangle size={15} /></div>
                <div>
                  <b>{byId(candidates, l.candidateId)?.name}</b> — {l.event}
                  <div className="muted small">{timeAgo(l.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
