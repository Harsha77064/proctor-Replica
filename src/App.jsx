import { useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useStore } from './context/StoreContext.jsx';
import Dashboard from './pages/Dashboard.jsx';
import QuestionBanks from './pages/QuestionBanks.jsx';
import Exams from './pages/Exams.jsx';
import Results from './pages/Results.jsx';
import Feedback from './pages/Feedback.jsx';
import AuditLogs from './pages/AuditLogs.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: '▦' },
  { to: '/question-banks', label: 'Question Bank', icon: '❓' },
  { to: '/exams', label: 'Exams', icon: '📝' },
  { to: '/results', label: 'Results', icon: '🏆' },
  { to: '/feedback', label: 'Feedback', icon: '💬' },
  { to: '/audit-logs', label: 'Audit Logs', icon: '🛡' },
  { to: '/reports', label: 'Reports', icon: '📊' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export default function App() {
  const { settings } = useStore();
  const [open, setOpen] = useState(false);
  const org = settings.organization;

  return (
    <div className={`layout ${open ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <img src={org.logoUrl} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
          <div>
            <div className="brand-name">Proctor Replica</div>
            <div className="brand-org">{org.name}</div>
          </div>
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className="nav-link" onClick={() => setOpen(false)}>
              <span className="nav-icon" aria-hidden>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot muted small">Support: {org.supportEmail}</div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(!open)} aria-label="Toggle menu">☰</button>
          <div className="topbar-title">Online Proctoring Admin</div>
          <div className="avatar" title="Exam Administrator">EA</div>
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/question-banks" element={<QuestionBanks />} />
            <Route path="/exams" element={<Exams />} />
            <Route path="/results" element={<Results />} />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/audit-logs" element={<AuditLogs />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
