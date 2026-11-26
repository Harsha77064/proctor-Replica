import { useCallback, useEffect, useState } from 'react';
import { UserPlus, KeyRound, ShieldCheck, Eye, Power, Users as UsersIcon, CheckCircle2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { fmtDateTime } from '../context/StoreContext.jsx';
import { PageHeader, Badge, Modal, Field, Empty, Person, Toast } from '../components/UI.jsx';
import { FormError } from './Login.jsx';

const ROLE_INFO = {
  admin: 'Full access: candidates, question banks, exams, invitations, settings and users.',
  proctor: 'Monitors live exams, records sessions, warns and flags candidates, sends feedback. Read-only elsewhere; cannot see answer keys.',
};

export default function Users() {
  const { user: me, isAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null); // { mode: 'add' } | { mode: 'reset', user }
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setUsers((await api('/users')).users);
    } catch (err) {
      setError(err.message);
    }
  }, [isAdmin]);
  useEffect(() => {
    load();
  }, [load]);

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const patch = async (u, body, msg) => {
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body });
      flash(msg);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <PageHeader title={isAdmin ? 'Users' : 'My Account'} crumb="System" subtitle={isAdmin ? 'Staff who can sign in to Oversee, and what each one can do' : 'Your sign-in details'}>
        {isAdmin && <button className="btn primary" onClick={() => setDialog({ mode: 'add' })}><UserPlus size={16} /> Add user</button>}
      </PageHeader>

      {isAdmin && (
        <section className="card">
          <FormError>{error}</FormError>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>User</th><th>Role</th><th>Status</th><th>Last sign-in</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td><Person name={u.name} sub={u.email} /></td>
                    <td>
                      <select
                        className="input"
                        aria-label={`Role for ${u.name}`}
                        value={u.role}
                        onChange={(e) => patch(u, { role: e.target.value }, `${u.name} is now ${e.target.value === 'admin' ? 'an admin' : 'a proctor'}`)}
                      >
                        <option value="admin">Admin</option>
                        <option value="proctor">Proctor</option>
                      </select>
                    </td>
                    <td><Badge>{u.active ? 'Active' : 'Inactive'}</Badge></td>
                    <td className="small muted nowrap">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'Never'}</td>
                    <td>
                      <div className="row-actions nowrap" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn small" onClick={() => setDialog({ mode: 'reset', user: u })}><KeyRound size={13} /> Reset password</button>
                        {u.id !== me.id && (
                          <button
                            className="icon-btn"
                            title={u.active ? 'Deactivate' : 'Activate'}
                            aria-label={u.active ? 'Deactivate' : 'Activate'}
                            style={{ color: u.active ? 'var(--red)' : 'var(--green)' }}
                            onClick={() => patch(u, { active: !u.active }, `${u.name} ${u.active ? 'deactivated and signed out' : 'activated'}`)}
                          >
                            <Power size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!users.length && !error && <Empty icon={UsersIcon}>Loading users…</Empty>}
          </div>
          <div className="role-legend">
            <div><ShieldCheck size={16} /> <b>Admin</b> <span className="muted">{ROLE_INFO.admin}</span></div>
            <div><Eye size={16} /> <b>Proctor</b> <span className="muted">{ROLE_INFO.proctor}</span></div>
          </div>
        </section>
      )}

      <ChangePassword onDone={() => flash('Password changed')} />

      {dialog?.mode === 'add' && (
        <UserDialog
          title="Add user"
          onClose={() => setDialog(null)}
          onSave={async (form) => {
            await api('/users', { method: 'POST', body: form });
            setDialog(null);
            flash(`${form.name} can now sign in with the temporary password`);
            load();
          }}
        />
      )}
      {dialog?.mode === 'reset' && (
        <UserDialog
          title={`Reset password · ${dialog.user.name}`}
          resetOnly
          onClose={() => setDialog(null)}
          onSave={async (form) => {
            await api(`/users/${dialog.user.id}`, { method: 'PATCH', body: { password: form.password } });
            setDialog(null);
            flash('Password reset. Their other sessions were signed out.');
          }}
        />
      )}
      {toast && <Toast><CheckCircle2 size={16} color="#22c55e" /> {toast}</Toast>}
    </>
  );
}

function UserDialog({ title, resetOnly, onClose, onSave }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'proctor', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await onSave(form);
          } catch (err) {
            setError(err.message);
            setBusy(false);
          }
        }}
      >
        {!resetOnly && (
          <>
            <Field label="Name"><input id="user-name" className="input" required maxLength={100} value={form.name} onChange={set('name')} /></Field>
            <Field label="Email"><input id="user-email" className="input" type="email" required value={form.email} onChange={set('email')} /></Field>
            <Field label="Role">
              <select id="user-role" className="input" value={form.role} onChange={set('role')}>
                <option value="proctor">Proctor</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <p className="muted small" style={{ marginTop: -6 }}>{ROLE_INFO[form.role]}</p>
          </>
        )}
        <Field label={resetOnly ? 'New password' : 'Temporary password'}>
          <input id="user-password" className="input" type="text" required minLength={10} autoComplete="new-password" value={form.password} onChange={set('password')} />
        </Field>
        <p className="muted small" style={{ marginTop: -6 }}>At least 10 characters with letters and numbers. Share it privately; they can change it under My Account.</p>
        <FormError>{error}</FormError>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{resetOnly ? 'Reset password' : 'Add user'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ChangePassword({ onDone }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <section className="card" style={{ maxWidth: 560 }}>
      <h2>My account</h2>
      <Person name={user.name} sub={`${user.email} · ${user.role === 'admin' ? 'Admin' : 'Proctor'}`} size="" />
      <form
        style={{ marginTop: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (form.newPassword !== form.confirm) return setError('The new passwords do not match.');
          setError('');
          try {
            await api('/auth/password', { method: 'POST', body: { currentPassword: form.currentPassword, newPassword: form.newPassword } });
            setForm({ currentPassword: '', newPassword: '', confirm: '' });
            onDone();
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <Field label="Current password"><input id="pw-current" className="input" type="password" required autoComplete="current-password" value={form.currentPassword} onChange={set('currentPassword')} /></Field>
        <div className="two-col">
          <Field label="New password"><input id="pw-new" className="input" type="password" required minLength={10} autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} /></Field>
          <Field label="Confirm new password"><input id="pw-confirm" className="input" type="password" required autoComplete="new-password" value={form.confirm} onChange={set('confirm')} /></Field>
        </div>
        <FormError>{error}</FormError>
        <div className="modal-actions"><button className="btn primary"><KeyRound size={15} /> Change password</button></div>
      </form>
    </section>
  );
}
