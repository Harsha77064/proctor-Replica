import { useMemo, useState } from 'react';
import { useStore, byId, fmtDateTime, timeAgo } from '../context/StoreContext.jsx';
import { ScrollText, Info, AlertTriangle, ShieldCheck, Download, Users, ListTree } from 'lucide-react';
import { PageHeader, Badge, Empty, Tabs, StatCard, Person, SearchInput, CountPill } from '../components/UI.jsx';

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
      <PageHeader title="Audit Logs" subtitle="Every candidate and organization event, warning and validation" crumb="Monitoring">
        <button className="btn" onClick={exportCsv}><Download size={15} /> Export CSV</button>
      </PageHeader>

      <section className="stat-grid">
        <StatCard label="Total Events" value={auditLogs.length} icon={ScrollText} tone="purple" />
        <StatCard label="Normal Events" value={auditLogs.filter((l) => l.type === 'Normal').length} icon={Info} tone="blue" />
        <StatCard label="Warnings" value={auditLogs.filter((l) => l.type === 'Warning').length} icon={AlertTriangle} tone="amber" />
        <StatCard label="Validations" value={auditLogs.filter((l) => l.type === 'Validation').length} icon={ShieldCheck} tone="cyan" />
      </section>

      <div className="row-between wrap">
        <Tabs
          active={view}
          onChange={setView}
          tabs={[
            { key: 'summary', label: 'Candidate Summary', icon: Users },
            { key: 'events', label: 'All Events', icon: ListTree, count: events.length },
          ]}
        />
        <div className="filters">
          <SearchInput value={search} onChange={setSearch} placeholder="Search candidate or event…" />
          {view === 'events' && (
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="All">All types</option><option>Normal</option><option>Warning</option><option>Validation</option>
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
                    <td><Person name={s.candidate.name} sub={s.candidate.id} online={s.candidate.online} /></td>
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
                    <td><CountPill value={s.normal} tone="blue" /></td>
                    <td><CountPill value={s.warning} tone="amber" /></td>
                    <td><CountPill value={s.validation} tone="purple" /></td>
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
                    <td className="small nowrap muted">{fmtDateTime(l.timestamp)}</td>
                    <td><Person name={byId(candidates, l.candidateId)?.name || l.candidateId} sub={l.candidateId} /></td>
                    <td><Badge>{l.type}</Badge></td>
                    <td>{l.event}</td>
                    <td className="small">{byId(exams, l.examId)?.title || <span className="muted">—</span>}</td>
                    <td className="mono small">{l.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {view === 'summary' && !summaryRows.length && <Empty icon={Users}>No candidates found.</Empty>}
          {view === 'events' && !events.length && <Empty icon={ScrollText}>No events match your filters.</Empty>}
        </div>
      </section>
    </>
  );
}
