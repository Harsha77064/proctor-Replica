import { useEffect } from 'react';
import { Search, X, Inbox, TrendingUp, TrendingDown } from 'lucide-react';

/** Oversee brand mark: a stylised eye inside a shield-like rounded square. */
export function LogoMark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
      <circle cx="13.3" cy="10.8" r="1" fill="#5b5bf0" />
    </svg>
  );
}

export function PageHeader({ title, subtitle, crumb, children }) {
  return (
    <div className="page-header">
      <div>
        {crumb && <div className="crumb">{crumb}</div>}
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      <div className="page-actions">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, tone = 'blue', hint, trend }) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <div className="stat-glow" />
      <div className="stat-top">
        <div className="stat-icon">{Icon && <Icon size={20} strokeWidth={2.2} />}</div>
        {trend !== undefined && (
          <span className={`stat-trend ${trend >= 0 ? 'up' : 'down'}`}>
            {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
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
export function Badge({ children, tone, plain }) {
  return (
    <span className={`badge badge-${tone || BADGE_TONES[children] || 'gray'} ${plain ? 'plain' : ''}`}>{children}</span>
  );
}

export function CountPill({ value, tone }) {
  return <span className={`count-pill ${value ? `badge-${tone}` : 'zero'}`}>{value}</span>;
}

const AVATAR_COLORS = [
  ['#6366f1', '#8b5cf6'], ['#0ea5e9', '#6366f1'], ['#10b981', '#0ea5e9'], ['#f59e0b', '#ef4444'],
  ['#ec4899', '#8b5cf6'], ['#14b8a6', '#22c55e'], ['#f97316', '#ec4899'], ['#3b82f6', '#06b6d4'],
];
export const initials = (name = '') => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
export function avatarGradient(seed = '') {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [a, b] = AVATAR_COLORS[h % AVATAR_COLORS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}
export function Avatar({ name, size = '', online }) {
  return (
    <span className={`avatar ${size}`} style={{ background: avatarGradient(name) }}>
      {initials(name)}
      {online !== undefined && <span className={`presence ${online ? 'on' : ''}`} />}
    </span>
  );
}
export function Person({ name, sub, online, size = 'sm' }) {
  return (
    <div className="person">
      <Avatar name={name} size={size} online={online} />
      <div>
        <div className="strong">{name}</div>
        {sub && <div className="muted small">{sub}</div>}
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="search-input">
      <Search size={15} />
      <input className="input" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
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
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
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

export function Empty({ children, icon: Icon = Inbox }) {
  return (
    <div className="empty">
      <Icon size={36} strokeWidth={1.5} />
      {children}
    </div>
  );
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
          {t.icon && <t.icon size={15} />}
          {t.label}
          {t.count !== undefined && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Toast({ children }) {
  return <div className="toast" role="status">{children}</div>;
}
