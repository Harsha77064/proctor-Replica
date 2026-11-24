import { useMemo, useState } from 'react';
import { useStore, timeAgo, byId } from '../context/StoreContext.jsx';
import { DEPARTMENTS } from '../data/mockData.js';
import { PageHeader, StatCard, Badge, Modal, Field, Empty } from '../components/UI.jsx';

export default function Dashboard() {
  const { candidates, exams, results, addCandidate, toggleCandidateStatus, assignExam } = useStore();
  const [search, setSearch] = useState('');
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
      activeExams: exams.filter((e) => e.status === 'Live').length,
      scheduledExams: exams.filter((e) => e.status === 'Scheduled').length,
      completedExams: exams.filter((e) => e.status === 'Completed').length,
      avg: scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—',
      high: scores.length ? Math.max(...scores) : '—',
      low: scores.length ? Math.min(...scores) : '—',
      warnings: candidates.reduce((a, c) => a + c.warnings, 0),
      flags: candidates.reduce((a, c) => a + c.cheatingFlags, 0),
    };
  }, [candidates, exams, results]);

  const filtered = candidates.filter(
    (c) =>
      (dept === 'All' || c.department === dept) &&
      (status === 'All' || c.status === status || (status === 'Online' && c.online)) &&
      `${c.id} ${c.name} ${c.email}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Overview of candidates, exams and proctoring activity">
        <button className="btn primary" onClick={() => setShowAdd(true)}>+ Add Candidate</button>
      </PageHeader>

      <section className="stat-grid">
        <StatCard label="Total Candidates" value={stats.total} icon="👥" tone="blue" />
        <StatCard label="Active Candidates" value={stats.active} icon="✅" tone="green" hint={`${stats.inactive} inactive`} />
        <StatCard label="Online Now" value={stats.online} icon="🟢" tone="green" />
        <StatCard label="Active (Live) Exams" value={stats.activeExams} icon="🔴" tone="red" hint={`${stats.scheduledExams} scheduled`} />
        <StatCard label="Completed Exams" value={stats.completedExams} icon="🏁" tone="gray" />
        <StatCard label="Average Score" value={`${stats.avg}%`} icon="📈" tone="blue" />
        <StatCard label="Highest Score" value={`${stats.high}%`} icon="⬆" tone="green" />
        <StatCard label="Lowest Score" value={`${stats.low}%`} icon="⬇" tone="amber" />
        <StatCard label="Warnings" value={stats.warnings} icon="⚠" tone="amber" />
        <StatCard label="Cheating Flags" value={stats.flags} icon="🚩" tone="red" />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Candidates</h2>
          <div className="filters">
            <input className="input" placeholder="Search name, ID or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="input" value={dept} onChange={(e) => setDept(e.target.value)}>
              <option>All</option>
              {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
            </select>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option>All</option>
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
                <th>User ID</th>
                <th>Candidate</th>
                <th>Department</th>
                <th>Status</th>
                <th>Presence</th>
                <th>Warnings</th>
                <th>Cheating Flags</th>
                <th>Assigned Exams</th>
                <th>Last Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.id}</td>
                  <td>
                    <div className="strong">{c.name}</div>
                    <div className="muted small">{c.email}</div>
                  </td>
                  <td>{c.department}</td>
                  <td><Badge>{c.status}</Badge></td>
                  <td>
                    <span className={`dot ${c.online ? 'on' : ''}`} /> {c.online ? 'Online' : 'Offline'}
                  </td>
                  <td>{c.warnings > 0 ? <Badge tone="amber">{c.warnings}</Badge> : 0}</td>
                  <td>{c.cheatingFlags > 0 ? <Badge tone="red">{c.cheatingFlags}</Badge> : 0}</td>
                  <td>
                    {c.assignedExams.length ? (
                      <span
                        className="badge badge-blue"
                        title={c.assignedExams.map((id) => byId(exams, id)?.title).filter(Boolean).join('\n')}
                      >
                        {c.assignedExams.length} exam{c.assignedExams.length > 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="muted small">None</span>
                    )}
                  </td>
                  <td className="small nowrap">{timeAgo(c.lastActive)}</td>
                  <td><div className="row-actions nowrap">
                    <button className="btn small" onClick={() => setAssignFor(c)}>Assign Exam</button>
                    <button className="btn small ghost" onClick={() => toggleCandidateStatus(c.id)}>
                      {c.status === 'Active' ? 'Deactivate' : 'Activate'}
                    </button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <Empty>No candidates match your filters.</Empty>}
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
            addCandidate(data);
            setShowAdd(false);
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
    <Modal title={`Assign exam to ${candidate.name}`} onClose={onClose}>
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
            <button className="btn primary">Assign</button>
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
          <button className="btn primary">Add Candidate</button>
        </div>
      </form>
    </Modal>
  );
}
