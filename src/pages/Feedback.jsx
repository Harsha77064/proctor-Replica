import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore, byId, fmtDateTime } from '../context/StoreContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Star, Send, Trash2, MessageSquareText, CheckCircle2 } from 'lucide-react';
import { PageHeader, Badge, Field, Empty, Person, SearchInput, Toast } from '../components/UI.jsx';

const Stars = ({ value, onChange }) => (
  <div className="stars" role={onChange ? 'radiogroup' : undefined}>
    {[1, 2, 3, 4, 5].map((n) =>
      onChange ? (
        <button type="button" key={n} className={n <= value ? 'on' : ''} onClick={() => onChange(n)} aria-label={`${n} stars`}>
          <Star size={24} />
        </button>
      ) : (
        <span key={n} className={n <= value ? 'on' : ''}><Star size={15} /></span>
      )
    )}
  </div>
);

export default function Feedback() {
  const { feedback, candidates, exams, results, sendFeedback, deleteFeedback } = useStore();
  const { isAdmin } = useAuth();
  const location = useLocation();
  const preset = location.state?.resultId ? byId(results, location.state.resultId) : null;

  const [form, setForm] = useState({
    candidateId: preset?.candidateId || candidates[0]?.id || '',
    examId: preset?.examId || '',
    rating: 4,
    message: '',
  });
  const [filter, setFilter] = useState('');
  const [sent, setSent] = useState(false);

  const candidate = byId(candidates, form.candidateId) || candidates[0];
  const candidateExams = exams.filter((e) => candidate?.assignedExams.includes(e.id));
  const candidateId = candidate?.id || '';
  const result = results.find((r) => r.candidateId === form.candidateId && r.examId === form.examId);

  const submit = (e) => {
    e.preventDefault();
    sendFeedback({ ...form, candidateId })
      .then(() => {
        setForm({ ...form, candidateId, message: '' });
        setSent(true);
        setTimeout(() => setSent(false), 2500);
      })
      .catch(() => {});
  };

  const list = feedback.filter((f) =>
    `${byId(candidates, f.candidateId)?.name} ${byId(exams, f.examId)?.title} ${f.message}`
      .toLowerCase()
      .includes(filter.toLowerCase())
  );

  return (
    <>
      <PageHeader title="Feedback" subtitle="Feedback from the organization to candidates about their exams" crumb="Engagement" />

      <div className="split">
        <section className="card">
          <h2>Send Feedback</h2>
          <form onSubmit={submit}>
            <Field label="Candidate">
              <select
                className="input"
                value={candidateId}
                onChange={(e) => setForm({ ...form, candidateId: e.target.value, examId: '' })}
              >
                {candidates.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
              </select>
            </Field>
            <Field label="Exam">
              <select className="input" required value={form.examId} onChange={(e) => setForm({ ...form, examId: e.target.value })}>
                <option value="">Select exam…</option>
                {candidateExams.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </Field>
            {result && (
              <div className="info-box small">
                Result: <strong>{result.score}%</strong> <Badge>{result.result}</Badge>
              </div>
            )}
            <Field label="Rating"><Stars value={form.rating} onChange={(rating) => setForm({ ...form, rating })} /></Field>
            <Field label="Message">
              <textarea
                className="input"
                rows={5}
                required
                placeholder="Write feedback about the candidate's performance…"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
              />
            </Field>
            <div className="modal-actions">
              <button className="btn primary"><Send size={15} /> Send Feedback</button>
            </div>
          </form>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Sent Feedback ({list.length})</h2>
            <SearchInput value={filter} onChange={setFilter} />
          </div>
          <div className="feedback-list">
            {list.map((f) => {
              const c = byId(candidates, f.candidateId);
              const ex = byId(exams, f.examId);
              return (
                <article key={f.id} className="feedback-item">
                  <div className="row-between">
                    <Person name={c?.name || f.candidateId} sub={`${ex?.title || ''} · ${fmtDateTime(f.sentAt)}`} />
                    <div className="row-actions">
                      <Stars value={f.rating} />
                      {isAdmin && <button className="icon-btn" title="Delete" aria-label="Delete feedback" onClick={() => deleteFeedback(f.id)}><Trash2 size={15} /></button>}
                    </div>
                  </div>
                  <p>{f.message}</p>
                  <div className="muted small">— {f.sentBy}</div>
                </article>
              );
            })}
            {!list.length && <Empty icon={MessageSquareText}>No feedback yet.</Empty>}
          </div>
        </section>
      </div>
      {sent && <Toast><CheckCircle2 size={16} color="#22c55e" /> Feedback sent to candidate</Toast>}
    </>
  );
}
