import { useMemo, useState } from 'react';
import { useStore, byId, fmtDateTime, timeAgo } from '../context/StoreContext.jsx';
import { PageHeader, Badge, Empty, Tabs, StatCard } from '../components/UI.jsx';

export default function AuditLogs() {
  const { auditLogs, candidates, exams } = useStore();
  const [view, setView] = useState('summary');
  const [type, setType] = useState('All');
  const [search, setSearch] = useState('');

  const summary = useMemo(
    () =>
      candidates.map((c) => {
        const logs = auditLogs.filter((l) => l.candidateId === c.id);
        const last = logs[0];
        return {
          candidate: c,
          lastEvent: last,
          lastActive: last && last.timestamp > c.lastActive ? last.timestamp : c.lastActive,
          normal: logs.filter((l) => l.type === 'Normal').length,
          warning: logs.filter((l) => l.type === 'Warning').length,
          validation: logs.filter((l) => l.type === 'Validation').length,
        };
      }),
    [auditLogs, candidates]
  );

  const q = search.toLowerCase();
  const events = auditLogs.filter(
    (l) =>
      (type === 'All' || l.type === type) &&
      `${byId(candidates, l.candidateId)?.name} ${l.candidateId} ${l.event}`.toLowerCase().includes(q)
  );
  const summaryRows = summary.filter((s) => `${s.candidate.name} ${s.candidate.id}`.toLowerCase().includes(q));

  const exportCsv = () => {
    const header = 'Log ID,Timestamp,Candidate ID,Candidate,Type,Event,Exam,IP\n';
    const body = events
      .map((l) =>
        [l.id, l.timestamp, l.candidateId, byId(candidates, l.candidateId)?.name, l.type, l.event, byId(exams, l.examId)?.title || '', l.ip]
          .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');
    const url = URL.createObjectURL(new Blob([header + body], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-logs.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader title="Audit Logs" subtitle="Every candidate and organization event, warning and validation">
        <button className="btn" onClick={exportCsv}>⬇ Export CSV</button>
      </PageHeader>

      <section className="stat-grid compact">
        <StatCard label="Total Events" value={auditLogs.length} icon="🧾" tone="blue" />
        <StatCard label="Normal Events" value={auditLogs.filter((l) => l.type === 'Normal').length} icon="ℹ" tone="blue" />
        <StatCard label="Warnings" value={auditLogs.filter((l) => l.type === 'Warning').length} icon="⚠" tone="amber" />
        <StatCard label="Validations" value={auditLogs.filter((l) => l.type === 'Validation').length} icon="✔" tone="purple" />
      </section>

      <div className="row-between wrap">
        <Tabs
          active={view}
          onChange={setView}
          tabs={[
            { key: 'summary', label: 'Candidate Summary' },
            { key: 'events', label: 'All Events', count: events.length },
          ]}
        />
        <div className="filters">
          <input className="input" placeholder="Search candidate or event…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {view === 'events' && (
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option>All</option><option>Normal</option><option>Warning</option><option>Validation</option>
            </select>
          )}
        </div>
      </div>

      <section className="card">
        <div className="table-wrap">
          {view === 'summary' ? (
            <table>
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Last Active</th>
                  <th>Last Event</th>
                  <th>Normal Events</th>
                  <th>Warnings</th>
                  <th>Validations</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((s) => (
                  <tr key={s.candidate.id}>
                    <td>
                      <div className="strong">{s.candidate.name}</div>
                      <div className="muted small mono">{s.candidate.id}</div>
                    </td>
                    <td>
                      <div>{timeAgo(s.lastActive)}</div>
                      <div className="muted small">{fmtDateTime(s.lastActive)}</div>
                    </td>
                    <td>
                      {s.lastEvent ? (
                        <>
                          <Badge>{s.lastEvent.type}</Badge> <span className="small">{s.lastEvent.event}</span>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{s.normal}</td>
                    <td>{s.warning ? <Badge tone="amber">{s.warning}</Badge> : 0}</td>
                    <td>{s.validation ? <Badge tone="purple">{s.validation}</Badge> : 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Candidate</th>
                  <th>Type</th>
                  <th>Event</th>
                  <th>Exam</th>
                  <th>Source IP</th>
                </tr>
              </thead>
              <tbody>
                {events.map((l) => (
                  <tr key={l.id}>
                    <td className="small">{fmtDateTime(l.timestamp)}</td>
                    <td>
                      <div className="strong">{byId(candidates, l.candidateId)?.name || '—'}</div>
                      <div className="muted small mono">{l.candidateId}</div>
                    </td>
                    <td><Badge>{l.type}</Badge></td>
                    <td>{l.event}</td>
                    <td className="small">{byId(exams, l.examId)?.title || <span className="muted">—</span>}</td>
                    <td className="mono small">{l.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {view === 'summary' && !summaryRows.length && <Empty>No candidates found.</Empty>}
          {view === 'events' && !events.length && <Empty>No events match your filters.</Empty>}
        </div>
      </section>
    </>
  );
}
