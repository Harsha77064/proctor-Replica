import { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts';
import { useStore, byId } from '../context/StoreContext.jsx';
import { DEPARTMENTS } from '../data/mockData.js';
import { Download, ShieldAlert } from 'lucide-react';
import { PageHeader, Person, CountPill, Empty } from '../components/UI.jsx';

const C = { blue: '#5b5bf0', green: '#10b981', red: '#ef4444', amber: '#f59e0b', purple: '#8b5cf6', gray: '#94a3b8' };
const TT = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)' };

function download(name, rows) {
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const { results, exams, candidates, auditLogs } = useStore();

  const examReport = useMemo(
    () =>
      exams
        .filter((e) => results.some((r) => r.examId === e.id))
        .map((e) => {
          const rs = results.filter((r) => r.examId === e.id);
          const scores = rs.map((r) => r.score);
          return {
            id: e.id,
            name: e.title,
            short: e.title.length > 18 ? e.title.slice(0, 16) + '…' : e.title,
            attempts: rs.length,
            Pass: rs.filter((r) => r.result === 'Pass').length,
            Fail: rs.filter((r) => r.result === 'Fail').length,
            avg: +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1),
            high: Math.max(...scores),
            low: Math.min(...scores),
          };
        }),
    [exams, results]
  );

  const distribution = useMemo(() => {
    const buckets = ['0-39', '40-49', '50-59', '60-69', '70-79', '80-89', '90-100'].map((range) => ({ range, count: 0 }));
    results.forEach((r) => {
      const i = r.score < 40 ? 0 : Math.min(6, Math.floor(r.score / 10) - 3);
      buckets[i].count++;
    });
    return buckets;
  }, [results]);

  const deptReport = useMemo(
    () =>
      DEPARTMENTS.map((d) => {
        const ids = new Set(candidates.filter((c) => c.department === d).map((c) => c.id));
        const rs = results.filter((r) => ids.has(r.candidateId));
        return {
          department: d,
          candidates: ids.size,
          avg: rs.length ? +(rs.reduce((a, r) => a + r.score, 0) / rs.length).toFixed(1) : 0,
          warnings: candidates.filter((c) => ids.has(c.id)).reduce((a, c) => a + c.warnings, 0),
        };
      }),
    [candidates, results]
  );

  const statusData = [
    { name: 'Active', value: candidates.filter((c) => c.status === 'Active').length, color: C.green },
    { name: 'Inactive', value: candidates.filter((c) => c.status === 'Inactive').length, color: C.gray },
  ];

  const eventTypes = useMemo(() => {
    const m = {};
    auditLogs.filter((l) => l.type === 'Warning').forEach((l) => (m[l.event] = (m[l.event] || 0) + 1));
    return Object.entries(m).map(([event, count]) => ({ event, count })).sort((a, b) => b.count - a.count);
  }, [auditLogs]);

  const flagged = candidates
    .filter((c) => c.cheatingFlags > 0 || c.warnings >= 4)
    .sort((a, b) => b.cheatingFlags - a.cheatingFlags || b.warnings - a.warnings);

  return (
    <>
      <PageHeader title="Reports" subtitle="Performance and proctoring analytics" crumb="Monitoring">
        <button
          className="btn"
          onClick={() =>
            download('exam-report.csv', [
              ['Exam ID', 'Exam', 'Attempts', 'Passed', 'Failed', 'Average', 'Highest', 'Lowest'],
              ...examReport.map((e) => [e.id, e.name, e.attempts, e.Pass, e.Fail, e.avg, e.high, e.low]),
            ])
          }
        >
          <Download size={15} /> Exam Report
        </button>
        <button
          className="btn"
          onClick={() =>
            download('candidate-report.csv', [
              ['Candidate ID', 'Name', 'Department', 'Status', 'Exams Taken', 'Average Score', 'Warnings', 'Cheating Flags'],
              ...candidates.map((c) => {
                const rs = results.filter((r) => r.candidateId === c.id);
                return [
                  c.id, c.name, c.department, c.status, rs.length,
                  rs.length ? (rs.reduce((a, r) => a + r.score, 0) / rs.length).toFixed(1) : '',
                  c.warnings, c.cheatingFlags,
                ];
              }),
            ])
          }
        >
          <Download size={15} /> Candidate Report
        </button>
      </PageHeader>

      <div className="chart-grid">
        <section className="card">
          <h2>Pass vs Fail by Exam</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={examReport}>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="short" interval={0} tick={{ fontSize: 12, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT} cursor={{ fill: 'var(--surface-3)' }} />
              <Legend />
              <Bar dataKey="Pass" stackId="a" fill={C.green} />
              <Bar dataKey="Fail" stackId="a" fill={C.red} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card">
          <h2>Score Distribution</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={distribution}>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="range" tick={{ fontSize: 12, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT} cursor={{ fill: 'var(--surface-3)' }} />
              <Bar dataKey="count" name="Candidates" fill={C.blue} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card">
          <h2>Average Score by Department</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={deptReport} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="var(--border)" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="department" width={90} tick={{ fontSize: 12, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT} cursor={{ fill: 'var(--surface-3)' }} />
              <Bar dataKey="avg" name="Average %" fill={C.purple} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card">
          <h2>Candidate Status</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie isAnimationActive={false} data={statusData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={3} stroke="none" label>
                {statusData.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={TT} cursor={{ fill: 'var(--surface-3)' }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </section>

        <section className="card">
          <h2>Proctoring Warnings by Type</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={eventTypes} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="var(--border)" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="event" width={150} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT} cursor={{ fill: 'var(--surface-3)' }} />
              <Bar dataKey="count" name="Occurrences" fill={C.amber} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card">
          <h2>High-Risk Candidates</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Candidate</th><th>Dept</th><th>Warnings</th><th>Flags</th></tr>
              </thead>
              <tbody>
                {flagged.map((c) => (
                  <tr key={c.id}>
                    <td><Person name={c.name} sub={c.id} /></td>
                    <td>{c.department}</td>
                    <td><CountPill value={c.warnings} tone="amber" /></td>
                    <td><CountPill value={c.cheatingFlags} tone="red" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!flagged.length && <Empty icon={ShieldAlert}>No high-risk candidates.</Empty>}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head"><div><h2>Exam Summary</h2><div className="card-sub">Per-exam attempts, pass rate and score range</div></div></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Exam</th><th>Attempts</th><th>Passed</th><th>Failed</th><th>Pass Rate</th><th>Average</th><th>Highest</th><th>Lowest</th></tr>
            </thead>
            <tbody>
              {examReport.map((e) => (
                <tr key={e.id}>
                  <td className="strong">{byId(exams, e.id)?.title}</td>
                  <td>{e.attempts}</td>
                  <td><CountPill value={e.Pass} tone="green" /></td>
                  <td><CountPill value={e.Fail} tone="red" /></td>
                  <td>{Math.round((e.Pass / e.attempts) * 100)}%</td>
                  <td>{e.avg}%</td>
                  <td>{e.high}%</td>
                  <td>{e.low}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
