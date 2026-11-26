import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts';
import {
  Users, UserCheck, Wifi, Radio, CheckCircle2, Gauge, ArrowUpCircle, ArrowDownCircle, AlertTriangle, Flag,
  UserPlus, CalendarPlus, Activity, Crown, CalendarClock, ShieldCheck, Info, Power, Send,
} from 'lucide-react';
import { useStore, timeAgo, byId, fmtDateTime } from '../context/StoreContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { DEPARTMENTS } from '../data/mockData.js';
import {
  PageHeader, StatCard, Badge, Modal, Field, Empty, Person, Avatar, SearchInput, CountPill,
} from '../components/UI.jsx';

const FEED_ICON = {
  Normal: { icon: Info, cls: 'badge-blue' },
  Warning: { icon: AlertTriangle, cls: 'badge-amber' },
  Validation: { icon: ShieldCheck, cls: 'badge-purple' },
};
const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)' };

export default function Dashboard() {
  const { candidates, exams, results, auditLogs, addCandidate, toggleCandidateStatus, assignExam } = useStore();
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') || '');
  useEffect(() => setSearch(params.get('q') || ''), [params]);
  const [dept, setDept] = useState('All');
  const [status, setStatus] = useState('All');
  const [assignFor, setAssignFor] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const stats = useMemo(() => {
    const scores = results.map((r) => r.score);
    return {
      total: candidates.length,
      active: candidates.filter((c) => c.status === 'Active').length,
      inactive: candidates.filter((c) => c.status === 'Inactive').length,
      online: candidates.filter((c) => c.online).length,
      live: exams.filter((e) => e.status === 'Live').length,
      scheduled: exams.filter((e) => e.status === 'Scheduled').length,
      completed: exams.filter((e) => e.status === 'Completed').length,
      avg: scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—',
      high: scores.length ? Math.max(...scores) : '—',
      low: scores.length ? Math.min(...scores) : '—',
      warnings: candidates.reduce((a, c) => a + c.warnings, 0),
      flags: candidates.reduce((a, c) => a + c.cheatingFlags, 0),
      passRate: results.length ? Math.round((results.filter((r) => r.result === 'Pass').length / results.length) * 100) : 0,
    };
  }, [candidates, exams, results]);

  const trend = useMemo(
    () =>
      exams
        .filter((e) => results.some((r) => r.examId === e.id))
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .map((e) => {
          const rs = results.filter((r) => r.examId === e.id);
          return {
            name: new Date(e.startTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
            exam: e.title,
            avg: +(rs.reduce((a, r) => a + r.score, 0) / rs.length).toFixed(1),
            pass: Math.round((rs.filter((r) => r.result === 'Pass').length / rs.length) * 100),
          };
        }),
    [exams, results]
  );

  const examMix = [
    { name: 'Live', value: stats.live, color: '#ef4444' },
    { name: 'Scheduled', value: stats.scheduled, color: '#5b5bf0' },
    { name: 'Completed', value: stats.completed, color: '#10b981' },
  ];

  const topPerformers = useMemo(() => {
    const m = {};
    results.forEach((r) => {
      m[r.candidateId] ??= { total: 0, n: 0 };
      m[r.candidateId].total += r.score;
      m[r.candidateId].n++;
    });
    return Object.entries(m)
      .map(([id, v]) => ({ candidate: byId(candidates, id), avg: Math.round(v.total / v.n), n: v.n }))
      .filter((x) => x.candidate)
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);
  }, [results, candidates]);

  const upcoming = exams
    .filter((e) => e.status === 'Scheduled')
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, 4);

  const filtered = candidates.filter(
    (c) =>
      (dept === 'All' || c.department === dept) &&
      (status === 'All' || c.status === status || (status === 'Online' && c.online)) &&
      `${c.id} ${c.name} ${c.email}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <section className="hero">
        <div>
          <h1>Welcome back, {user.name.split(' ')[0]} 👋</h1>
          <p>
            {stats.live} exam{stats.live === 1 ? ' is' : 's are'} live right now with {stats.online} candidates online.
            {stats.flags > 0 && ` ${stats.flags} cheating flags need your review.`}
          </p>
          <div className="hero-actions">
            <button className="btn" onClick={() => navigate('/live-monitoring')}><Radio size={16} /> Monitor Live Exams</button>
            {isAdmin && <button className="btn glass" onClick={() => setShowAdd(true)}><UserPlus size={16} /> Add Candidate</button>}
            {isAdmin && <button className="btn glass" onClick={() => navigate('/exams?new=1')}><CalendarPlus size={16} /> Schedule Exam</button>}
          </div>
        </div>
        <div className="hero-stats">
          <div className="hero-stat"><b>{stats.live}</b><span><i className="live-dot" /> Live exams</span></div>
          <div className="hero-stat"><b>{stats.online}</b><span>Online now</span></div>
          <div className="hero-stat"><b>{stats.passRate}%</b><span>Pass rate</span></div>
        </div>
      </section>

      <section className="stat-grid">
        <StatCard label="Total Candidates" value={stats.total} icon={Users} tone="purple" />
        <StatCard label="Active Candidates" value={stats.active} icon={UserCheck} tone="green" hint={`${stats.inactive} inactive`} />
        <StatCard label="Online Candidates" value={stats.online} icon={Wifi} tone="cyan" />
        <StatCard label="Active Exams" value={stats.live} icon={Radio} tone="red" hint={`${stats.scheduled} scheduled`} />
        <StatCard label="Completed Exams" value={stats.completed} icon={CheckCircle2} tone="gray" />
        <StatCard label="Average Score" value={`${stats.avg}%`} icon={Gauge} tone="blue" />
        <StatCard label="Highest Score" value={`${stats.high}%`} icon={ArrowUpCircle} tone="green" />
        <StatCard label="Lowest Score" value={`${stats.low}%`} icon={ArrowDownCircle} tone="amber" />
        <StatCard label="Warnings" value={stats.warnings} icon={AlertTriangle} tone="amber" />
        <StatCard label="Cheating Flags" value={stats.flags} icon={Flag} tone="red" />
      </section>

      <div className="dash-grid">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Performance Trend</h2>
              <div className="card-sub">Average score and pass rate across completed exams</div>
            </div>
            <div className="diff-legend small muted" style={{ margin: 0 }}>
              <span><i style={{ background: '#5b5bf0' }} />Average score</span>
              <span><i style={{ background: '#10b981' }} />Pass rate</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trend} margin={{ left: -16, right: 8 }}>
              <defs>
                <linearGradient id="gAvg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5b5bf0" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#5b5bf0" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gPass" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(l, p) => p?.[0]?.payload.exam || l} />
              <Area type="monotone" dataKey="avg" name="Average %" stroke="#5b5bf0" strokeWidth={2.5} fill="url(#gAvg)" />
              <Area type="monotone" dataKey="pass" name="Pass rate %" stroke="#10b981" strokeWidth={2.5} fill="url(#gPass)" />
            </AreaChart>
          </ResponsiveContainer>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>Exam Status</h2>
              <div className="card-sub">{exams.length} exams in total</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <PieChart>
              <Pie data={examMix} dataKey="value" innerRadius={58} outerRadius={84} paddingAngle={3} isAnimationActive={false} stroke="none">
                {examMix.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="feed">
            {examMix.map((d) => (
              <div key={d.name} className="row-between small" style={{ padding: '6px 0' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i style={{ width: 10, height: 10, borderRadius: 3, background: d.color, display: 'inline-block' }} />
                  {d.name}
                </span>
                <b>{d.value}</b>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="dash-grid-3">
        <section className="card">
          <div className="card-head">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Activity size={17} /> Live Activity</h2>
            <button className="btn small ghost" onClick={() => navigate('/audit-logs')}>View all</button>
          </div>
          <div className="feed">
            {auditLogs.slice(0, 6).map((l) => {
              const F = FEED_ICON[l.type];
              return (
                <div key={l.id} className="feed-item">
                  <div className={`feed-icon ${F.cls}`}><F.icon size={15} /></div>
                  <div>
                    <div className="feed-text"><b>{byId(candidates, l.candidateId)?.name}</b> · {l.event}</div>
                    <div className="feed-time">{timeAgo(l.timestamp)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Crown size={17} /> Top Performers</h2>
            <button className="btn small ghost" onClick={() => navigate('/results')}>Results</button>
          </div>
          {topPerformers.map((p, i) => (
            <div key={p.candidate.id} className="leader">
              <span className={`leader-rank r${i + 1}`}>{i + 1}</span>
              <Avatar name={p.candidate.name} size="sm" />
              <div className="leader-info">
                <div className="strong small">{p.candidate.name}</div>
                <div className="muted small">{p.candidate.department} · {p.n} exam{p.n > 1 ? 's' : ''}</div>
              </div>
              <b className="text-green">{p.avg}%</b>
            </div>
          ))}
        </section>

        <section className="card">
          <div className="card-head">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CalendarClock size={17} /> Upcoming Exams</h2>
            <button className="btn small ghost" onClick={() => navigate('/exams')}>All exams</button>
          </div>
          {upcoming.map((e) => (
            <div key={e.id} className="feed-item">
              <div className="feed-icon badge-blue"><CalendarClock size={15} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="feed-text strong">{e.title}</div>
                <div className="feed-time">{fmtDateTime(e.startTime)} · {e.duration} min · {e.candidates.length} candidates</div>
              </div>
            </div>
          ))}
          {!upcoming.length && <Empty icon={CalendarClock}>Nothing scheduled.</Empty>}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Candidates</h2>
            <div className="card-sub">{filtered.length} of {candidates.length} candidates</div>
          </div>
          <div className="filters">
            <SearchInput value={search} onChange={setSearch} placeholder="Search name, ID or email…" />
            <select className="input" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
              <option value="All">All departments</option>
              {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
            </select>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="All">All statuses</option>
              <option>Active</option>
              <option>Inactive</option>
              <option>Online</option>
            </select>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>User ID</th>
                <th>Department</th>
                <th>Status</th>
                <th>Warnings</th>
                <th>Flags</th>
                <th>Exams</th>
                <th>Last Active</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td><Person name={c.name} sub={c.email} online={c.online} /></td>
                  <td className="mono">{c.id}</td>
                  <td>{c.department}</td>
                  <td><Badge>{c.status}</Badge></td>
                  <td><CountPill value={c.warnings} tone="amber" /></td>
                  <td><CountPill value={c.cheatingFlags} tone="red" /></td>
                  <td>
                    <span
                      className="badge badge-purple plain"
                      title={c.assignedExams.map((id) => byId(exams, id)?.title).filter(Boolean).join('\n') || 'No exams assigned'}
                    >
                      {c.assignedExams.length} assigned
                    </span>
                  </td>
                  <td className="small nowrap muted">{timeAgo(c.lastActive)}</td>
                  <td>
                    {isAdmin && <div className="row-actions nowrap" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn small primary" onClick={() => setAssignFor(c)}><Send size={13} /> Assign Exam</button>
                      <button
                        className="icon-btn"
                        title={c.status === 'Active' ? 'Deactivate' : 'Activate'}
                        aria-label={c.status === 'Active' ? 'Deactivate' : 'Activate'}
                        onClick={() => toggleCandidateStatus(c.id)}
                        style={{ color: c.status === 'Active' ? 'var(--red)' : 'var(--green)' }}
                      >
                        <Power size={16} />
                      </button>
                    </div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <Empty icon={Users}>No candidates match your filters.</Empty>}
        </div>
      </section>

      {assignFor && (
        <AssignExamModal
          candidate={assignFor}
          exams={exams}
          onClose={() => setAssignFor(null)}
          onAssign={(examId) => {
            assignExam(assignFor.id, examId);
            setAssignFor(null);
          }}
        />
      )}
      {showAdd && (
        <AddCandidateModal
          onClose={() => setShowAdd(false)}
          onSave={(data) => {
            addCandidate(data).then(() => setShowAdd(false)).catch(() => {});
          }}
        />
      )}
    </>
  );
}

function AssignExamModal({ candidate, exams, onClose, onAssign }) {
  const available = exams.filter((e) => e.status !== 'Completed' && !candidate.assignedExams.includes(e.id));
  const [examId, setExamId] = useState(available[0]?.id || '');
  return (
    <Modal title="Assign exam" onClose={onClose}>
      <div className="info-box"><Person name={candidate.name} sub={`${candidate.id} · ${candidate.department}`} /></div>
      {available.length ? (
        <form onSubmit={(e) => { e.preventDefault(); onAssign(examId); }}>
          <Field label="Exam">
            <select className="input" value={examId} onChange={(e) => setExamId(e.target.value)}>
              {available.map((e) => (
                <option key={e.id} value={e.id}>{e.title} ({e.status})</option>
              ))}
            </select>
          </Field>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn primary"><Send size={14} /> Assign</button>
          </div>
        </form>
      ) : (
        <Empty>No scheduled or live exams left to assign.</Empty>
      )}
    </Modal>
  );
}

function AddCandidateModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', email: '', department: DEPARTMENTS[0] });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal title="Add candidate" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
        <Field label="Full name"><input className="input" required value={form.name} onChange={set('name')} /></Field>
        <Field label="Email"><input className="input" type="email" required value={form.email} onChange={set('email')} /></Field>
        <Field label="Department">
          <select className="input" value={form.department} onChange={set('department')}>
            {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary"><UserPlus size={14} /> Add Candidate</button>
        </div>
      </form>
    </Modal>
  );
}
