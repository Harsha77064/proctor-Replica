import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CalendarPlus, CalendarClock, Radio, Video, CheckCircle2, Play, Trash2, Square, Users, Wifi, AlertTriangle, Flag, Clock, BookOpen,
  Send, Copy, Mail, Link2, Ban, Loader2,
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { FormError } from './Login.jsx';
import { useStore, byId, fmtDateTime } from '../context/StoreContext.jsx';
import { PageHeader, Badge, Modal, Field, Empty, Tabs, Person } from '../components/UI.jsx';

export default function Exams() {
  const { exams, questionBanks, candidates, settings, addExam, setExamStatus, deleteExam } = useStore();
  const { isAdmin } = useAuth();
  const [inviteFor, setInviteFor] = useState(null);
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || 'Scheduled');
  const [showCreate, setShowCreate] = useState(params.get('new') === '1');

  const list = exams
    .filter((e) => e.status === tab)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const closeCreate = () => {
    setShowCreate(false);
    if (params.get('new')) setParams({});
  };

  return (
    <>
      <PageHeader title="Exams" subtitle="Schedule exams and monitor live proctoring sessions" crumb="Assessment">
        {isAdmin && <button className="btn primary" onClick={() => setShowCreate(true)}><CalendarPlus size={16} /> Schedule Exam</button>}
      </PageHeader>

      <div>
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: 'Scheduled', icon: CalendarClock },
            { key: 'Live', icon: Radio },
            { key: 'Completed', icon: CheckCircle2 },
          ].map((t) => ({ ...t, label: t.key, count: exams.filter((e) => e.status === t.key).length }))}
        />
      </div>

      {tab === 'Live' ? (
        <div className="live-grid">
          {list.map((exam) => (
            <LiveExamCard
              key={exam.id}
              exam={exam}
              bank={byId(questionBanks, exam.bankId)}
              candidates={exam.candidates.map((id) => byId(candidates, id)).filter(Boolean)}
              onEnd={isAdmin ? () => confirm(`End "${exam.title}" for everyone? Candidates still writing are submitted automatically.`) && setExamStatus(exam.id, 'Completed') : null}
              onInvite={isAdmin ? () => setInviteFor(exam) : null}
            />
          ))}
          {!list.length && <div className="card"><Empty icon={Radio}>No exams are live right now.</Empty></div>}
        </div>
      ) : (
        <section className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Exam</th>
                  <th>Question Bank</th>
                  <th>Start Time</th>
                  <th>Duration</th>
                  <th>Pass Mark</th>
                  <th>Candidates</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div className="strong">{e.title}</div>
                      <div className="mono">{e.id}</div>
                    </td>
                    <td>{byId(questionBanks, e.bankId)?.name || <span className="muted">Deleted bank</span>}</td>
                    <td className="nowrap">{fmtDateTime(e.startTime)}</td>
                    <td className="nowrap">{e.duration} min</td>
                    <td>{e.passMark}%</td>
                    <td><Badge tone="purple" plain>{e.candidates.length}</Badge></td>
                    <td><Badge>{e.status}</Badge></td>
                    <td>
                      <div className="row-actions nowrap" style={{ justifyContent: 'flex-end' }}>
                        {isAdmin && e.status === 'Scheduled' && (
                          <button className="btn small" onClick={() => setInviteFor(e)}><Send size={13} /> Invitations</button>
                        )}
                        {isAdmin && e.status === 'Scheduled' && (
                          <button className="btn small primary" onClick={() => setExamStatus(e.id, 'Live')}><Play size={13} /> Start Now</button>
                        )}
                        {isAdmin && <button
                          className="icon-btn"
                          style={{ color: 'var(--red)' }}
                          title="Delete exam"
                          aria-label="Delete exam"
                          onClick={() => confirm(`Delete "${e.title}"?`) && deleteExam(e.id)}
                        >
                          <Trash2 size={16} />
                        </button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!list.length && <Empty icon={CalendarClock}>No {tab.toLowerCase()} exams.</Empty>}
          </div>
        </section>
      )}

      {showCreate && (
        <CreateExamModal
          banks={questionBanks}
          defaults={settings.exam}
          onClose={closeCreate}
          onSave={(data) => {
            addExam(data).then(() => {
              closeCreate();
              setTab('Scheduled');
            }).catch(() => {});
          }}
        />
      )}
      {inviteFor && <InviteModal exam={inviteFor} onClose={() => setInviteFor(null)} />}
    </>
  );
}

function Silhouette() {
  return (
    <svg className="cam-silhouette" viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="24" r="12" fill="#64748b" />
      <path d="M10 62c2-14 11-21 22-21s20 7 22 21" fill="#64748b" />
    </svg>
  );
}

function LiveExamCard({ exam, bank, candidates, onEnd, onInvite }) {
  const navigate = useNavigate();
  const elapsed = Math.max(0, Math.round((Date.now() - new Date(exam.startTime).getTime()) / 60000));
  const pct = Math.min(100, Math.round((elapsed / exam.duration) * 100));
  const remaining = Math.max(0, exam.duration - elapsed);
  const online = candidates.filter((c) => c.online).length;
  const warnings = candidates.reduce((a, c) => a + c.warnings, 0);
  const flags = candidates.reduce((a, c) => a + c.cheatingFlags, 0);

  return (
    <article className="card">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div>
          <span className="live-pill"><i /> LIVE</span>
          <h3 style={{ fontSize: '1.15rem', marginTop: 10 }}>{exam.title}</h3>
          <div className="muted small" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 4 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><BookOpen size={13} /> {bank?.name}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Clock size={13} /> {exam.duration} min · started {fmtDateTime(exam.startTime)}</span>
          </div>
        </div>
        <div className="row-actions">
          <button className="btn small primary" onClick={() => navigate('/live-monitoring')}><Video size={13} /> Live Monitoring</button>
          {onInvite && <button className="btn small" onClick={onInvite}><Send size={13} /> Invitations</button>}
          {onEnd && <button className="btn small danger-ghost" onClick={onEnd}><Square size={13} /> End Exam</button>}
        </div>
      </div>
      <div className="progress" title={`${pct}% of time elapsed`}><div style={{ width: `${pct}%` }} /></div>
      <div className="row-between small muted">
        <span>{pct}% elapsed</span>
        <span className={remaining ? '' : 'text-red strong'}>
          {remaining ? `${remaining} min remaining` : "Time's up — end the exam to publish results"}
        </span>
      </div>
      <div className="live-stats">
        <div><span className="stat-icon badge-purple" style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center' }}><Users size={16} /></span><div><strong>{candidates.length}</strong><span>Assigned</span></div></div>
        <div><span className="stat-icon badge-green" style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center' }}><Wifi size={16} /></span><div><strong>{online}</strong><span>Online</span></div></div>
        <div><span className="stat-icon badge-amber" style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center' }}><AlertTriangle size={16} /></span><div><strong>{warnings}</strong><span>Warnings</span></div></div>
        <div><span className="stat-icon badge-red" style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center' }}><Flag size={16} /></span><div><strong>{flags}</strong><span>Flags</span></div></div>
      </div>
      <div className="tile-grid">
        {candidates.map((c) => {
          const state = c.cheatingFlags ? 'flagged' : c.warnings >= 3 ? 'warn' : '';
          return (
            <div key={c.id} className={`cam-tile ${state}`}>
              <div className="cam-feed">
                {c.online && <span className="cam-rec"><i /> REC</span>}
                <span className={`dot ${c.online ? 'on' : ''}`} />
                <Silhouette />
                {state && <span className="cam-alert">{state === 'flagged' ? <Flag size={12} /> : <AlertTriangle size={12} />}</span>}
              </div>
              <div className="cam-name">{c.name}</div>
              <div className="cam-meta">
                <span><AlertTriangle size={12} /> {c.warnings}</span>
                <span><Flag size={12} /> {c.cheatingFlags}</span>
              </div>
            </div>
          );
        })}
      </div>
      {!candidates.length && <Empty icon={Users}>No candidates assigned.</Empty>}
    </article>
  );
}

function CreateExamModal({ banks, defaults, onClose, onSave }) {
  const [form, setForm] = useState({
    title: '',
    bankId: banks[0]?.id || '',
    startTime: '',
    duration: defaults.defaultDuration,
    passMark: defaults.passMark,
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal title="Schedule exam" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            ...form,
            startTime: new Date(form.startTime).toISOString(),
            duration: Number(form.duration),
            passMark: Number(form.passMark),
          });
        }}
      >
        <Field label="Exam title"><input className="input" required value={form.title} onChange={set('title')} /></Field>
        <Field label="Question bank">
          <select className="input" required value={form.bankId} onChange={set('bankId')}>
            {banks.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.questions.length} Qs)</option>)}
          </select>
        </Field>
        <Field label="Start date & time"><input className="input" type="datetime-local" required value={form.startTime} onChange={set('startTime')} /></Field>
        <div className="two-col">
          <Field label="Duration (minutes)"><input className="input" type="number" min="5" required value={form.duration} onChange={set('duration')} /></Field>
          <Field label="Pass mark (%)"><input className="input" type="number" min="1" max="100" required value={form.passMark} onChange={set('passMark')} /></Field>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary"><CalendarPlus size={14} /> Schedule</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
const STATUS_TONE = { 'Not invited': 'gray', Pending: 'blue', Started: 'amber', Submitted: 'green', Terminated: 'red', Revoked: 'gray', Locked: 'red', Expired: 'gray' };

function copyText(text) {
  return navigator.clipboard?.writeText(text).then(() => true, () => false) ?? Promise.resolve(false);
}

function InviteModal({ exam, onClose }) {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [created, setCreated] = useState(null); // fresh links + codes, shown once
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await api(`/exams/${exam.id}/invites`);
      setData(d);
      setSelected(d.invites.filter((i) => ['Not invited', 'Expired', 'Revoked', 'Locked'].includes(i.status)).map((i) => i.candidateId));
    } catch (err) {
      setError(err.message);
    }
  }, [exam.id]);
  useEffect(() => {
    load();
  }, [load]);

  const create = async (sendEmail) => {
    setBusy(true);
    setError('');
    try {
      const r = await api(`/exams/${exam.id}/invites`, { method: 'POST', body: { candidateIds: selected, sendEmail } });
      setCreated(r.invites);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (inviteId) => {
    try {
      await api(`/invites/${inviteId}/revoke`, { method: 'POST' });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const flash = (key) => {
    setCopied(key);
    setTimeout(() => setCopied(''), 1500);
  };
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const fmt = (i) => `${i.name} <${i.email}>\nExam: ${exam.title}\nLink: ${i.link}\nAccess code: ${i.code}`;

  return (
    <Modal title={`Invitations · ${exam.title}`} onClose={onClose} wide>
      {created ? (
        <>
          <div className="info-box small" style={{ alignItems: 'flex-start' }}>
            <Link2 size={16} />
            <div>
              <b>Each candidate has a personal link and access code.</b> Codes are shown only now; if one is lost, create a new
              invitation (the old link stops working). Send the code separately from the link where you can.
            </div>
          </div>
          <div className="invite-list">
            {created.map((i) => (
              <div key={i.candidateId} className="invite-row">
                <Person name={i.name} sub={i.email} />
                {i.skipped ? (
                  <span className="muted small">{i.skipped}</span>
                ) : (
                  <>
                    <div className="invite-secret">
                      <span className="mono ellipsis" title={i.link}>{i.link}</span>
                      <span className="code-chip">{i.code}</span>
                    </div>
                    <div className="row-actions nowrap">
                      {i.emailed && <Badge tone="green">Emailed</Badge>}
                      {i.emailError && <Badge tone="red">{i.emailError}</Badge>}
                      <button className="btn small" onClick={() => copyText(fmt(i)).then((ok) => ok && flash(i.candidateId))}>
                        <Copy size={13} /> {copied === i.candidateId ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="modal-actions">
            <button
              className="btn"
              onClick={() => copyText(created.filter((i) => i.link).map(fmt).join('\n\n')).then((ok) => ok && flash('all'))}
            >
              <Copy size={14} /> {copied === 'all' ? 'Copied all' : 'Copy all'}
            </button>
            <button className="btn primary" onClick={() => setCreated(null)}>Done</button>
          </div>
        </>
      ) : (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>
            Candidates assigned to this exam. Choose who to invite; each gets a personal exam link and an access code that only works for them.
          </p>
          <FormError>{error}</FormError>
          {!data ? (
            <Empty icon={Loader2}>Loading…</Empty>
          ) : !data.invites.length ? (
            <Empty icon={Users}>No candidates are assigned to this exam yet. Assign them from the Dashboard.</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th style={{ width: 36 }}></th><th>Candidate</th><th>Invitation</th><th>Sent</th><th></th></tr>
                </thead>
                <tbody>
                  {data.invites.map((i) => {
                    const done = ['Started', 'Submitted', 'Terminated'].includes(i.status);
                    return (
                      <tr key={i.candidateId}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Invite ${i.name}`}
                            disabled={done}
                            checked={selected.includes(i.candidateId)}
                            onChange={() => toggle(i.candidateId)}
                            style={{ accentColor: 'var(--brand)', width: 16, height: 16 }}
                          />
                        </td>
                        <td><Person name={i.name} sub={i.email} /></td>
                        <td><Badge tone={STATUS_TONE[i.status]}>{i.status}</Badge></td>
                        <td className="small muted nowrap">{i.emailedAt ? `Emailed ${fmtDateTime(i.emailedAt)}` : i.createdAt ? `Created ${fmtDateTime(i.createdAt)}` : '—'}</td>
                        <td>
                          {i.inviteId && i.status === 'Pending' && (
                            <button className="btn small danger-ghost" onClick={() => revoke(i.inviteId)}><Ban size={13} /> Revoke</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {data && !data.emailEnabled && (
            <p className="muted small">Email is not set up on the server, so copy each link and code and send them yourself. Add SMTP settings to send them automatically.</p>
          )}
          <div className="modal-actions">
            <button className="btn ghost" onClick={onClose}>Close</button>
            <button className="btn" disabled={busy || !selected.length} onClick={() => create(false)}>
              <Link2 size={14} /> Create links ({selected.length})
            </button>
            {data?.emailEnabled && (
              <button className="btn primary" disabled={busy || !selected.length} onClick={() => create(true)}>
                <Mail size={14} /> Create and email ({selected.length})
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
