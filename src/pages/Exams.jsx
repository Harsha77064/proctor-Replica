import { useState } from 'react';
import { useStore, byId, fmtDateTime } from '../context/StoreContext.jsx';
import { PageHeader, Badge, Modal, Field, Empty, Tabs } from '../components/UI.jsx';

export default function Exams() {
  const { exams, questionBanks, candidates, settings, addExam, setExamStatus, deleteExam } = useStore();
  const [tab, setTab] = useState('Scheduled');
  const [showCreate, setShowCreate] = useState(false);

  const list = exams
    .filter((e) => e.status === tab)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <>
      <PageHeader title="Exams" subtitle="Schedule exams and monitor live sessions">
        <button className="btn primary" onClick={() => setShowCreate(true)}>+ Schedule Exam</button>
      </PageHeader>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={['Scheduled', 'Live', 'Completed'].map((s) => ({
          key: s,
          label: s,
          count: exams.filter((e) => e.status === s).length,
        }))}
      />

      {tab === 'Live' ? (
        <div className="live-grid">
          {list.map((exam) => (
            <LiveExamCard
              key={exam.id}
              exam={exam}
              bank={byId(questionBanks, exam.bankId)}
              candidates={exam.candidates.map((id) => byId(candidates, id)).filter(Boolean)}
              onEnd={() => setExamStatus(exam.id, 'Completed')}
            />
          ))}
          {!list.length && <Empty>No exams are live right now.</Empty>}
        </div>
      ) : (
        <section className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Exam ID</th>
                  <th>Title</th>
                  <th>Question Bank</th>
                  <th>Start Time</th>
                  <th>Duration</th>
                  <th>Pass Mark</th>
                  <th>Candidates</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id}>
                    <td className="mono">{e.id}</td>
                    <td className="strong">{e.title}</td>
                    <td>{byId(questionBanks, e.bankId)?.name || <span className="muted">Deleted bank</span>}</td>
                    <td>{fmtDateTime(e.startTime)}</td>
                    <td>{e.duration} min</td>
                    <td>{e.passMark}%</td>
                    <td>{e.candidates.length}</td>
                    <td><Badge>{e.status}</Badge></td>
                    <td className="row-actions">
                      {e.status === 'Scheduled' && (
                        <button className="btn small primary" onClick={() => setExamStatus(e.id, 'Live')}>Start Now</button>
                      )}
                      <button className="btn small danger-ghost" onClick={() => confirm(`Delete "${e.title}"?`) && deleteExam(e.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!list.length && <Empty>No {tab.toLowerCase()} exams.</Empty>}
          </div>
        </section>
      )}

      {showCreate && (
        <CreateExamModal
          banks={questionBanks}
          defaults={settings.exam}
          onClose={() => setShowCreate(false)}
          onSave={(data) => {
            addExam(data);
            setShowCreate(false);
            setTab('Scheduled');
          }}
        />
      )}
    </>
  );
}

function LiveExamCard({ exam, bank, candidates, onEnd }) {
  const elapsed = Math.max(0, Math.round((Date.now() - new Date(exam.startTime).getTime()) / 60000));
  const pct = Math.min(100, Math.round((elapsed / exam.duration) * 100));
  const online = candidates.filter((c) => c.online).length;
  const warnings = candidates.reduce((a, c) => a + c.warnings, 0);
  const flags = candidates.reduce((a, c) => a + c.cheatingFlags, 0);

  return (
    <article className="card live-card">
      <div className="row-between">
        <div>
          <span className="live-pill">● LIVE</span>
          <h3>{exam.title}</h3>
          <div className="muted small">{bank?.name} · {exam.duration} min · started {fmtDateTime(exam.startTime)}</div>
        </div>
        <button className="btn small danger-ghost" onClick={onEnd}>End Exam</button>
      </div>
      <div className="progress" title={`${pct}% of time elapsed`}><div style={{ width: `${pct}%` }} /></div>
      <div className="live-stats">
        <div><strong>{candidates.length}</strong><span>Assigned</span></div>
        <div><strong className="text-green">{online}</strong><span>Online</span></div>
        <div><strong className="text-amber">{warnings}</strong><span>Warnings</span></div>
        <div><strong className="text-red">{flags}</strong><span>Flags</span></div>
      </div>
      <div className="tile-grid">
        {candidates.map((c) => (
          <div key={c.id} className={`cam-tile ${c.cheatingFlags ? 'flagged' : c.warnings >= 3 ? 'warn' : ''}`}>
            <div className="cam-feed">
              <span className="cam-initials">{c.name.split(' ').map((p) => p[0]).join('')}</span>
              <span className={`dot ${c.online ? 'on' : ''}`} />
            </div>
            <div className="cam-name">{c.name}</div>
            <div className="cam-meta small">
              ⚠ {c.warnings} · 🚩 {c.cheatingFlags}
            </div>
          </div>
        ))}
        {!candidates.length && <Empty>No candidates assigned.</Empty>}
      </div>
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
          <button className="btn primary">Schedule</button>
        </div>
      </form>
    </Modal>
  );
}
