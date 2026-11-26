import { useState } from 'react';
import { Rocket, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Field } from '../components/UI.jsx';
import { AuthShell, FormError } from './Login.jsx';

export default function Setup() {
  const { setup } = useAuth();
  const [form, setForm] = useState({ orgName: '', name: '', email: '', password: '', confirm: '', loadDemo: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError('The two passwords do not match.');
    setBusy(true);
    setError('');
    try {
      await setup({ orgName: form.orgName, name: form.name, email: form.email, password: form.password, loadDemo: form.loadDemo });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Set up Oversee" subtitle="Create your organization and the first administrator account. This page only appears once.">
      <form onSubmit={submit} style={{ marginTop: 20 }}>
        <Field label="Organization name"><input id="setup-org" className="input" required maxLength={120} value={form.orgName} onChange={set('orgName')} /></Field>
        <Field label="Your name"><input id="setup-name" className="input" required maxLength={100} autoComplete="name" value={form.name} onChange={set('name')} /></Field>
        <Field label="Email"><input id="setup-email" className="input" type="email" required autoComplete="username" value={form.email} onChange={set('email')} /></Field>
        <div className="two-col">
          <Field label="Password"><input id="setup-password" className="input" type="password" required minLength={10} autoComplete="new-password" value={form.password} onChange={set('password')} /></Field>
          <Field label="Confirm password"><input id="setup-confirm" className="input" type="password" required autoComplete="new-password" value={form.confirm} onChange={set('confirm')} /></Field>
        </div>
        <p className="muted small" style={{ marginTop: -6 }}>At least 10 characters, with letters and numbers.</p>
        <label className="consent" style={{ marginBottom: 16 }}>
          <input id="setup-demo" type="checkbox" checked={form.loadDemo} onChange={set('loadDemo')} />
          <span>Load demo data (sample candidates, question banks, exams and results) to try things out.</span>
        </label>
        <FormError>{error}</FormError>
        <button className="btn primary block" disabled={busy}>
          {busy ? <Loader2 size={16} className="spin" /> : <Rocket size={16} />} Create organization
        </button>
      </form>
    </AuthShell>
  );
}
