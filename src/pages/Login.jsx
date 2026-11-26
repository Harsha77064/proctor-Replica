import { useState } from 'react';
import { LogIn, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { LogoMark, Field } from '../components/UI.jsx';

export function AuthShell({ title, subtitle, children }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark"><LogoMark /></div>
          <div>
            <div className="strong" style={{ fontSize: '1.15rem' }}>Oversee</div>
            <div className="muted small">Smart Proctoring</div>
          </div>
        </div>
        <h1>{title}</h1>
        {subtitle && <p className="muted" style={{ marginTop: 6 }}>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export function FormError({ children }) {
  if (!children) return null;
  return <div className="form-error" role="alert"><AlertCircle size={15} /> {children}</div>;
}

export default function Login() {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(form.email.trim(), form.password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Sign in" subtitle="For exam administrators and proctors. Candidates use the link in their invitation.">
      <form onSubmit={submit} style={{ marginTop: 20 }}>
        <Field label="Email">
          <input id="login-email" className="input" type="email" autoComplete="username" required autoFocus value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password">
          <input id="login-password" className="input" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <FormError>{error}</FormError>
        <button className="btn primary block" disabled={busy}>
          {busy ? <Loader2 size={16} className="spin" /> : <LogIn size={16} />} Sign in
        </button>
      </form>
      <p className="muted small" style={{ marginTop: 18 }}>Forgot your password? Ask an administrator to reset it from the Users page.</p>
    </AuthShell>
  );
}
