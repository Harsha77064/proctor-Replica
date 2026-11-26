import { useState } from 'react';
import { Plus, Trash2, Eye, Library, FileQuestion, Flame, Layers } from 'lucide-react';
import { useStore, fmtDate } from '../context/StoreContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { PageHeader, Badge, Modal, Field, Empty, SearchInput, StatCard } from '../components/UI.jsx';

const TOPIC_STYLE = {
  'React JS': { abbr: 'Re', grad: 'linear-gradient(135deg,#06b6d4,#3b82f6)' },
  Selenium: { abbr: 'Se', grad: 'linear-gradient(135deg,#22c55e,#15803d)' },
  Python: { abbr: 'Py', grad: 'linear-gradient(135deg,#3b82f6,#facc15)' },
  'Java OOPs': { abbr: 'Jv', grad: 'linear-gradient(135deg,#f97316,#dc2626)' },
  JavaScript: { abbr: 'JS', grad: 'linear-gradient(135deg,#facc15,#f59e0b)' },
  SQL: { abbr: 'SQ', grad: 'linear-gradient(135deg,#8b5cf6,#6366f1)' },
  DevOps: { abbr: 'Do', grad: 'linear-gradient(135deg,#0ea5e9,#14b8a6)' },
};
const topicStyle = (t) => TOPIC_STYLE[t] || { abbr: t.slice(0, 2), grad: 'linear-gradient(135deg,#64748b,#334155)' };
const DIFF_COLORS = { Easy: '#10b981', Medium: '#f59e0b', Hard: '#ef4444' };

export default function QuestionBanks() {
  const { questionBanks, addQuestionBank, deleteQuestionBank, addQuestion, deleteQuestion } = useStore();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [openId, setOpenId] = useState(null);
  const open = questionBanks.find((b) => b.id === openId);

  const filtered = questionBanks.filter((b) =>
    `${b.name} ${b.topic} ${b.description}`.toLowerCase().includes(search.toLowerCase())
  );
  const totalQ = questionBanks.reduce((a, b) => a + b.questions.length, 0);
  const topics = new Set(questionBanks.map((b) => b.topic)).size;

  return (
    <>
      <PageHeader title="Question Bank" subtitle="Build question banks and manage existing ones" crumb="Assessment">
        <SearchInput value={search} onChange={setSearch} placeholder="Search banks…" />
        {isAdmin && <button className="btn primary" onClick={() => setShowCreate(true)}><Plus size={16} /> New Question Bank</button>}
      </PageHeader>

      <section className="stat-grid">
        <StatCard label="Question Banks" value={questionBanks.length} icon={Library} tone="purple" />
        <StatCard label="Total Questions" value={totalQ} icon={FileQuestion} tone="blue" />
        <StatCard label="Technologies" value={topics} icon={Layers} tone="cyan" />
        <StatCard
          label="Hard Questions"
          value={questionBanks.reduce((a, b) => a + b.questions.filter((q) => q.difficulty === 'Hard').length, 0)}
          icon={Flame}
          tone="red"
        />
      </section>

      <div className="bank-grid">
        {filtered.map((b) => {
          const ts = topicStyle(b.topic);
          const n = b.questions.length || 1;
          const counts = ['Easy', 'Medium', 'Hard'].map((d) => [d, b.questions.filter((q) => q.difficulty === d).length]);
          return (
            <article key={b.id} className="card bank-card" style={{ '--accent': ts.grad }}>
              <div className="bank-top">
                <div className="bank-logo" style={{ background: ts.grad }}>{ts.abbr}</div>
                <Badge tone="purple" plain>{b.topic}</Badge>
              </div>
              <h3>{b.name}</h3>
              <p className="muted small">{b.description}</p>
              <div className="bank-meta">
                <span><strong style={{ fontSize: '1.2rem' }}>{b.questions.length}</strong> <span className="muted small">questions</span></span>
                <span className="muted small">{b.id} · {fmtDate(b.createdAt)}</span>
              </div>
              <div className="diff-bar">
                {counts.map(([d, c]) => <span key={d} style={{ width: `${(c / n) * 100}%`, background: DIFF_COLORS[d] }} />)}
              </div>
              <div className="diff-legend small muted">
                {counts.map(([d, c]) => <span key={d}><i style={{ background: DIFF_COLORS[d] }} />{d} {c}</span>)}
              </div>
              <div className="row-actions">
                <button className="btn small" onClick={() => setOpenId(b.id)}><Eye size={14} /> {isAdmin ? 'View & Edit' : 'View'}</button>
                {isAdmin && (
                  <button
                    className="btn small danger-ghost"
                    onClick={() => confirm(`Delete "${b.name}"? Exams using it will have no questions.`) && deleteQuestionBank(b.id)}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!filtered.length && <Empty icon={Library}>No question banks found.</Empty>}

      {showCreate && (
        <CreateBankModal
          onClose={() => setShowCreate(false)}
          onSave={(data) => {
            addQuestionBank(data).then(() => setShowCreate(false)).catch(() => {});
          }}
        />
      )}
      {open && (
        <BankDetailModal
          bank={open}
          canEdit={isAdmin}
          onClose={() => setOpenId(null)}
          onAddQuestion={(qq) => addQuestion(open.id, qq)}
          onDeleteQuestion={(qid) => deleteQuestion(open.id, qid)}
        />
      )}
    </>
  );
}

const TOPICS = ['React JS', 'Selenium', 'Python', 'Java OOPs', 'JavaScript', 'SQL', 'DevOps', 'Other'];

function CreateBankModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', topic: TOPICS[0], description: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal title="Create question bank" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
        <Field label="Bank name"><input className="input" required value={form.name} onChange={set('name')} placeholder="e.g. React Hooks Deep Dive" /></Field>
        <Field label="Topic / Technology">
          <select className="input" value={form.topic} onChange={set('topic')}>
            {TOPICS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Description"><textarea className="input" rows={3} value={form.description} onChange={set('description')} /></Field>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary"><Plus size={14} /> Create</button>
        </div>
      </form>
    </Modal>
  );
}

const blankQuestion = () => ({ text: '', options: ['', '', '', ''], answer: 0, difficulty: 'Medium' });

function BankDetailModal({ bank, canEdit, onClose, onAddQuestion, onDeleteQuestion }) {
  const [draft, setDraft] = useState(blankQuestion);
  const [adding, setAdding] = useState(false);
  const ts = topicStyle(bank.topic);

  const submit = (e) => {
    e.preventDefault();
    onAddQuestion(draft)
      .then(() => {
        setDraft(blankQuestion());
        setAdding(false);
      })
      .catch(() => {});
  };

  return (
    <Modal title={bank.name} onClose={onClose} wide>
      <div className="row-between">
        <div className="person">
          <div className="bank-logo" style={{ background: ts.grad, width: 36, height: 36 }}>{ts.abbr}</div>
          <span className="muted">{bank.questions.length} questions · {bank.topic}</span>
        </div>
        {canEdit && !adding && <button className="btn small primary" onClick={() => setAdding(true)}><Plus size={14} /> Add Question</button>}
      </div>

      {adding && (
        <form className="question-form" onSubmit={submit}>
          <Field label="Question">
            <textarea className="input" rows={2} required value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          </Field>
          <div className="options-grid">
            {draft.options.map((opt, i) => (
              <label key={i} className="option-input">
                <input
                  type="radio"
                  name="answer"
                  checked={draft.answer === i}
                  onChange={() => setDraft({ ...draft, answer: i })}
                  title="Mark as correct answer"
                />
                <input
                  className="input"
                  required
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  value={opt}
                  onChange={(e) => {
                    const options = [...draft.options];
                    options[i] = e.target.value;
                    setDraft({ ...draft, options });
                  }}
                />
              </label>
            ))}
          </div>
          <p className="muted small">Select the radio button next to the correct option.</p>
          <Field label="Difficulty">
            <select className="input" value={draft.difficulty} onChange={(e) => setDraft({ ...draft, difficulty: e.target.value })}>
              <option>Easy</option><option>Medium</option><option>Hard</option>
            </select>
          </Field>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn primary">Save Question</button>
          </div>
        </form>
      )}

      <ol className="question-list">
        {bank.questions.map((qq) => (
          <li key={qq.id}>
            <div className="row-between" style={{ alignItems: 'flex-start' }}>
              <div className="strong q-text">{qq.text}</div>
              <div className="row-actions nowrap">
                <Badge>{qq.difficulty}</Badge>
                {canEdit && (
                  <button className="icon-btn" title="Delete question" aria-label="Delete question" onClick={() => onDeleteQuestion(qq.id)}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
            <ul className="opts">
              {qq.options.map((o, i) => (
                <li key={i} className={i === qq.answer ? 'correct' : ''}>
                  {String.fromCharCode(65 + i)}. {o} {i === qq.answer && '✓'}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {!bank.questions.length && <Empty icon={FileQuestion}>No questions yet. Add the first one.</Empty>}
    </Modal>
  );
}
