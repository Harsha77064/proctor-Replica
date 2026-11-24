import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, byId, fmtDateTime } from '../context/StoreContext.jsx';
import { PageHeader, Badge, StatCard, Empty } from '../components/UI.jsx';

export default function Results() {
  const { results, candidates, exams } = useStore();
  const navigate = useNavigate();
  const [examId, setExamId] = useState('All');
  const [outcome, setOutcome] = useState('All');
  const [search, setSearch] = useState('');

  const rows = results
    .map((r) => ({ ...r, candidate: byId(candidates, r.candidateId), exam: byId(exams, r.examId) }))
    .filter(
      (r) =>
        (examId === 'All' || r.examId === examId) &&
        (outcome === 'All' || r.result === outcome) &&
        `${r.candidate?.name} ${r.candidateId}`.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => b.score - a.score);

  const passed = rows.filter((r) => r.result === 'Pass').length;
  const avg = rows.length ? (rows.reduce((a, r) => a + r.score, 0) / rows.length).toFixed(1) : '—';
  const completedExams = exams.filter((e) => results.some((r) => r.examId === e.id));

  return (
    <>
      <PageHeader title="Results" subtitle="Scores and pass / fail outcomes for completed exams" />

      <section className="stat-grid compact">
        <StatCard label="Results" value={rows.length} icon="📄" tone="blue" />
        <StatCard label="Passed" value={passed} icon="✅" tone="green" />
        <StatCard label="Failed" value={rows.length - passed} icon="❌" tone="red" />
        <StatCard label="Pass Rate" value={rows.length ? `${Math.round((passed / rows.length) * 100)}%` : '—'} icon="🎯" tone="amber" />
        <StatCard label="Average Score" value={`${avg}%`} icon="📈" tone="blue" />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>All Results</h2>
          <div className="filters">
            <input className="input" placeholder="Search candidate…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="input" value={examId} onChange={(e) => setExamId(e.target.value)}>
              <option value="All">All exams</option>
              {completedExams.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
            <select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option>All</option><option>Pass</option><option>Fail</option>
            </select>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Candidate</th>
                <th>Exam</th>
                <th>Score</th>
                <th>Correct</th>
                <th>Time Taken</th>
                <th>Submitted</th>
                <th>Result</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td>#{i + 1}</td>
                  <td>
                    <div className="strong">{r.candidate?.name}</div>
                    <div className="muted small mono">{r.candidateId}</div>
                  </td>
                  <td>{r.exam?.title}</td>
                  <td>
                    <div className="score">
                      <div className="score-bar">
                        <div className={r.result === 'Pass' ? 'pass' : 'fail'} style={{ width: `${r.score}%` }} />
                      </div>
                      <span className="strong">{r.score}%</span>
                    </div>
                  </td>
                  <td>{r.correct}/{r.total}</td>
                  <td>{r.timeTaken} min</td>
                  <td className="small">{fmtDateTime(r.submittedAt)}</td>
                  <td><Badge>{r.result}</Badge></td>
                  <td>
                    <button className="btn small ghost" onClick={() => navigate('/feedback', { state: { resultId: r.id } })}>
                      Give Feedback
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <Empty>No results match your filters.</Empty>}
        </div>
      </section>
    </>
  );
}
