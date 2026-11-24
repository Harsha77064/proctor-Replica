import { useState } from 'react';
import { useStore, fmtDate } from '../context/StoreContext.jsx';
import { PageHeader, Badge, Modal, Field, Empty } from '../components/UI.jsx';

export default function QuestionBanks() {
  const { questionBanks, addQuestionBank, deleteQuestionBank, addQuestion, deleteQuestion } = useStore();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [openId, setOpenId] = useState(null);
  const open = questionBanks.find((b) => b.id === openId);

  const filtered = questionBanks.filter((b) =>
    `${b.name} ${b.topic} ${b.description}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <PageHeader title="Question Bank" subtitle="Create question banks and manage existing ones">
        <input className="input" placeholder="Search banks…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn primary" onClick={() => setShowCreate(true)}>+ New Question Bank</button>
      </PageHeader>

      <div className="bank-grid">
        {filtered.map((b) => {
          const counts = ['Easy', 'Medium', 'Hard'].map((d) => b.questions.filter((q) => q.difficulty === d).length);
          return (
            <article key={b.id} className="card bank-card">
              <div className="bank-top">
                <Badge tone="blue">{b.topic}</Badge>
                <span className="muted small mono">{b.id}</span>
              </div>
              <h3>{b.name}</h3>
              <p className="muted small">{b.description}</p>
              <div className="bank-meta">
                <span><strong>{b.questions.length}</strong> questions</span>
                <span className="muted small">Created {fmtDate(b.createdAt)}</span>
              </div>
              <div className="diff-row small">
                <span className="text-green">Easy {counts[0]}</span>
                <span className="text-amber">Medium {counts[1]}</span>
                <span className="text-red">Hard {counts[2]}</span>
              </div>
              <div className="row-actions">
                <button className="btn small" onClick={() => setOpenId(b.id)}>View / Edit</button>
                <button
                  className="btn small danger-ghost"
                  onClick={() => confirm(`Delete "${b.name}"?`) && deleteQuestionBank(b.id)}
                >
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!filtered.length && <Empty>No question banks found.</Empty>}

      {showCreate && (
        <CreateBankModal
          onClose={() => setShowCreate(false)}
          onSave={(data) => {
            addQuestionBank(data);
            setShowCreate(false);
          }}
        />
      )}
      {open && (
        <BankDetailModal
          bank={open}
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
          <button className="btn primary">Create</button>
        </div>
      </form>
    </Modal>
  );
}

const blankQuestion = () => ({ text: '', options: ['', '', '', ''], answer: 0, difficulty: 'Medium' });

function BankDetailModal({ bank, onClose, onAddQuestion, onDeleteQuestion }) {
  const [draft, setDraft] = useState(blankQuestion);
  const [adding, setAdding] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    onAddQuestion(draft);
    setDraft(blankQuestion());
    setAdding(false);
  };

  return (
    <Modal title={bank.name} onClose={onClose} wide>
      <div className="row-between">
        <span className="muted">{bank.questions.length} questions · {bank.topic}</span>
        {!adding && <button className="btn small primary" onClick={() => setAdding(true)}>+ Add Question</button>}
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
            <div className="row-between">
              <div className="strong">{qq.text}</div>
              <div className="row-actions">
                <Badge>{qq.difficulty}</Badge>
                <button className="icon-btn" title="Delete question" onClick={() => onDeleteQuestion(qq.id)}>🗑</button>
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
      {!bank.questions.length && <Empty>No questions yet. Add the first one.</Empty>}
    </Modal>
  );
}
