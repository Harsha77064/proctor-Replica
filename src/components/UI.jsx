import { useEffect } from 'react';

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      <div className="page-actions">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, icon, tone = 'blue', hint }) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <div className="stat-icon" aria-hidden>{icon}</div>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {hint && <div className="stat-hint">{hint}</div>}
      </div>
    </div>
  );
}

const BADGE_TONES = {
  Active: 'green', Inactive: 'gray', Online: 'green', Offline: 'gray',
  Pass: 'green', Fail: 'red',
  Scheduled: 'blue', Live: 'red', Completed: 'gray',
  Normal: 'blue', Warning: 'amber', Validation: 'purple',
  Easy: 'green', Medium: 'amber', Hard: 'red',
};
export function Badge({ children, tone }) {
  return <span className={`badge badge-${tone || BADGE_TONES[children] || 'gray'}`}>{children}</span>;
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="toggle-row">
      <div>
        <div className="toggle-label">{label}</div>
        {description && <div className="muted small">{description}</div>}
      </div>
      <input type="checkbox" className="toggle" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          className={`tab ${active === t.key ? 'active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.count !== undefined && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
