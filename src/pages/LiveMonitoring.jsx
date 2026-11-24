import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Video, VideoOff, Circle, Square, Camera, Volume2, VolumeX, Maximize2, MessageSquare, AlertTriangle, Flag, Ban,
  ExternalLink, Radio, PlayCircle, Download, Trash2, Wifi, WifiOff, Clock, ListChecks, Info, ShieldCheck,
  X, Send, Film, Hourglass,
} from 'lucide-react';
import { useStore, byId, timeAgo, fmtDateTime } from '../context/StoreContext.jsx';
import { useLive } from '../live/LiveContext.jsx';
import { PageHeader, StatCard, Modal, Empty, Badge, Avatar, Field } from '../components/UI.jsx';

const PHASE_LABEL = {
  'system-check': { label: 'System check', tone: 'blue' },
  'in-exam': { label: 'In exam', tone: 'green' },
  submitted: { label: 'Submitted', tone: 'purple' },
  terminated: { label: 'Terminated', tone: 'red' },
};
const EVENT_ICON = { Normal: Info, Warning: AlertTriangle, Validation: ShieldCheck };
const EVENT_TONE = { Normal: 'badge-blue', Warning: 'badge-amber', Validation: 'badge-purple' };

const QUICK_WARNINGS = [
  'Please keep your face visible to the camera.',
  'Do not look away from the screen.',
  'Talking is not allowed during the exam.',
  'Remove any phones or notes from your desk.',
];

function StreamVideo({ stream, muted = true, className = '', videoRef }) {
  const ref = useRef(null);
  const el = videoRef || ref;
  useEffect(() => {
    if (el.current && el.current.srcObject !== stream) el.current.srcObject = stream || null;
  }, [stream, el]);
  return <video ref={el} className={className} autoPlay playsInline muted={muted} />;
}

function snapshot(video, name) {
  if (!video?.videoWidth) return;
  const c = document.createElement('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext('2d').drawImage(video, 0, 0);
  c.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/\s+/g, '-')}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
}

const fmtDuration = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const fmtSize = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

export default function LiveMonitoring() {
  const { exams, candidates } = useStore();
  const live = useLive();
  const [examFilter, setExamFilter] = useState('All');
  const [focusId, setFocusId] = useState(null);
  const [audioId, setAudioId] = useState(null); // only one candidate audible at a time
  const [dialog, setDialog] = useState(null); // { id, mode: 'message' | 'warn' | 'flag' | 'terminate' }

  const liveExams = exams.filter((e) => e.status === 'Live');
  const peers = live.peers.filter((p) => examFilter === 'All' || p.info.examId === examFilter);
  const active = peers.filter((p) => !p.left);
  const connectedIds = new Set(live.peers.filter((p) => !p.left).map((p) => p.info.candidateId));

  const waiting = useMemo(
    () =>
      liveExams
        .filter((e) => examFilter === 'All' || e.id === examFilter)
        .flatMap((e) => e.candidates.map((cid) => ({ exam: e, candidate: byId(candidates, cid) })))
        .filter((x) => x.candidate && !connectedIds.has(x.candidate.id)),
    [liveExams, examFilter, candidates, connectedIds]
  );

  const focus = live.peers.find((p) => p.id === focusId);
  const portalUrl = `${window.location.origin}/exam`;

  return (
    <>
      <PageHeader
        title="Live Monitoring"
        crumb="Monitoring"
        subtitle="Watch candidates' cameras in real time, record sessions and act on suspicious behaviour"
      >
        <ServerStatus status={live.status} />
        <a className="btn" href="/exam" target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open Candidate Portal</a>
        {active.some((p) => p.stream) && (
          live.recordingIds.length ? (
            <button className="btn danger-ghost" onClick={() => live.recordingIds.forEach(live.stopRecording)}>
              <Square size={14} /> Stop all recordings
            </button>
          ) : (
            <button className="btn primary" onClick={() => active.forEach((p) => p.stream && live.startRecording(p.id))}>
              <Circle size={14} fill="currentColor" /> Record all
            </button>
          )
        )}
      </PageHeader>

      <section className="stat-grid">
        <StatCard label="Connected Cameras" value={active.filter((p) => p.stream).length} icon={Video} tone="green" hint={`${active.length} in session`} />
        <StatCard label="Taking Exam" value={active.filter((p) => p.phase === 'in-exam').length} icon={PlayCircle} tone="blue" />
        <StatCard label="Waiting to Join" value={waiting.length} icon={Hourglass} tone="gray" />
        <StatCard label="Recording" value={live.recordingIds.length} icon={Circle} tone="red" />
        <StatCard label="Session Warnings" value={live.events.filter((e) => e.type === 'Warning').length} icon={AlertTriangle} tone="amber" />
      </section>

      <div className="monitor-layout">
        <div className="monitor-main">
          <div className="row-between wrap">
            <div className="filters">
              <select className="input" value={examFilter} onChange={(e) => setExamFilter(e.target.value)} aria-label="Exam">
                <option value="All">All live exams</option>
                {liveExams.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </div>
            <span className="muted small">Click a feed's speaker icon to listen to that candidate.</span>
          </div>

          {peers.length ? (
            <div className="monitor-grid">
              {peers.map((p) => (
                <LiveTile
                  key={p.id}
                  peer={p}
                  recording={live.recordingIds.includes(p.id)}
                  audible={audioId === p.id}
                  onAudio={() => setAudioId(audioId === p.id ? null : p.id)}
                  onFocus={() => setFocusId(p.id)}
                  onRecord={() => (live.recordingIds.includes(p.id) ? live.stopRecording(p.id) : live.startRecording(p.id))}
                  onDialog={(mode) => setDialog({ id: p.id, mode })}
                  onDismiss={() => live.dismissPeer(p.id)}
                />
              ))}
            </div>
          ) : (
            <div className="card">
              <Empty icon={VideoOff}>
                <div className="strong" style={{ color: 'var(--text)' }}>No candidates are connected yet</div>
                <div style={{ maxWidth: 520 }}>
                  Candidates join from the candidate portal at <span className="mono">{portalUrl}</span>. Their camera appears
                  here as soon as they allow camera access.
                </div>
                <a className="btn primary" href="/exam" target="_blank" rel="noreferrer" style={{ marginTop: 8 }}>
                  <ExternalLink size={15} /> Open Candidate Portal
                </a>
              </Empty>
            </div>
          )}

          {waiting.length > 0 && (
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Waiting to join</h2>
                  <div className="card-sub">Assigned to a live exam but not connected yet</div>
                </div>
              </div>
              <div className="waiting-grid">
                {waiting.map(({ exam, candidate }) => (
                  <div key={`${exam.id}-${candidate.id}`} className="waiting-item">
                    <Avatar name={candidate.name} size="sm" />
                    <div style={{ minWidth: 0 }}>
                      <div className="strong small ellipsis">{candidate.name}</div>
                      <div className="muted small ellipsis">{candidate.id} · {exam.title}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <Recordings recordings={live.recordings} onDelete={live.deleteRecording} />
        </div>

        <aside className="card monitor-feed">
          <div className="card-head">
            <div>
              <h2>Live Alerts</h2>
              <div className="card-sub">Events from this monitoring session</div>
            </div>
            {live.events.length > 0 && <button className="btn small ghost" onClick={live.clearEvents}>Clear</button>}
          </div>
          <div className="feed">
            {live.events.map((e) => {
              const Icon = EVENT_ICON[e.type] || Info;
              return (
                <div key={e.id} className="feed-item">
                  <div className={`feed-icon ${EVENT_TONE[e.type]}`}><Icon size={15} /></div>
                  <div>
                    <div className="feed-text"><b>{e.name}</b> {e.text}</div>
                    <div className="feed-time">{timeAgo(e.at)}</div>
                  </div>
                </div>
              );
            })}
            {!live.events.length && <Empty icon={Radio}>Alerts such as tab switches, leaving full screen or a covered camera appear here.</Empty>}
          </div>
        </aside>
      </div>

      {focus && (
        <FocusModal
          peer={focus}
          exam={byId(exams, focus.info.examId)}
          recording={live.recordingIds.includes(focus.id)}
          events={live.events.filter((e) => e.peerId === focus.id)}
          onClose={() => setFocusId(null)}
          onRecord={() => (live.recordingIds.includes(focus.id) ? live.stopRecording(focus.id) : live.startRecording(focus.id))}
          onDialog={(mode) => setDialog({ id: focus.id, mode })}
        />
      )}
      {dialog && live.peers.find((p) => p.id === dialog.id) && (
        <ActionDialog
          peer={live.peers.find((p) => p.id === dialog.id)}
          mode={dialog.mode}
          onClose={() => setDialog(null)}
          onSubmit={(text) => {
            const { id, mode } = dialog;
            if (mode === 'message') live.sendMessage(id, text);
            if (mode === 'warn') live.warn(id, text);
            if (mode === 'flag') live.flag(id, text);
            if (mode === 'terminate') live.terminate(id, text);
            setDialog(null);
          }}
        />
      )}
    </>
  );
}

function ServerStatus({ status }) {
  const map = {
    online: { icon: Wifi, text: 'Proctor server connected', cls: 'badge-green' },
    connecting: { icon: Wifi, text: 'Connecting…', cls: 'badge-amber' },
    offline: { icon: WifiOff, text: 'Proctor server offline', cls: 'badge-red' },
    unsupported: { icon: WifiOff, text: 'Browser not supported', cls: 'badge-red' },
  };
  const s = map[status] || map.connecting;
  return (
    <span className={`server-status ${s.cls}`} title={status === 'offline' ? 'Run the app with npm run dev so the proctoring server is available' : ''}>
      <s.icon size={14} /> {s.text}
    </span>
  );
}

function PhaseBadge({ peer }) {
  if (peer.left) return <Badge tone="gray">Disconnected</Badge>;
  const p = PHASE_LABEL[peer.phase] || PHASE_LABEL['system-check'];
  return <Badge tone={p.tone}>{p.label}</Badge>;
}

function LiveTile({ peer, recording, audible, onAudio, onFocus, onRecord, onDialog, onDismiss }) {
  const videoRef = useRef(null);
  const hasVideo = !!peer.stream && !peer.left;
  const state = peer.warnings >= 3 ? 'flagged' : peer.warnings > 0 ? 'warn' : '';
  const prog = peer.progress;

  return (
    <article className={`live-tile ${state}`}>
      <div className="live-video" onDoubleClick={onFocus}>
        {hasVideo ? (
          <StreamVideo stream={peer.stream} muted={!audible} videoRef={videoRef} key={peer.streamVersion} />
        ) : (
          <div className="live-novideo">
            {peer.left ? <VideoOff size={28} /> : <span className="spinner" />}
            <span>{peer.left ? 'Disconnected' : 'Connecting camera…'}</span>
          </div>
        )}
        <div className="live-overlay top">
          {recording ? <span className="rec-chip"><i /> REC</span> : hasVideo && <span className="live-chip"><i /> LIVE</span>}
          {peer.warnings > 0 && <span className="warn-chip"><AlertTriangle size={12} /> {peer.warnings}</span>}
        </div>
        <div className="live-overlay bottom">
          <span className="live-name">{peer.info.name}</span>
          {prog && peer.phase === 'in-exam' && (
            <span className="live-prog"><ListChecks size={12} /> {prog.answered}/{prog.total} · <Clock size={12} /> {fmtDuration(prog.secondsLeft)}</span>
          )}
        </div>
      </div>
      <div className="live-info">
        <div style={{ minWidth: 0 }}>
          <div className="small muted ellipsis">{peer.info.candidateId} · {peer.info.examTitle}</div>
        </div>
        <PhaseBadge peer={peer} />
      </div>
      <div className="live-actions">
        {peer.left ? (
          <button className="btn small ghost" onClick={onDismiss}><X size={13} /> Remove tile</button>
        ) : (
          <>
            <button className={`tool ${recording ? 'on-red' : ''}`} onClick={onRecord} disabled={!hasVideo} title={recording ? 'Stop recording' : 'Start recording'} aria-label="Record">
              {recording ? <Square size={15} /> : <Circle size={15} />}
            </button>
            <button className="tool" onClick={() => snapshot(videoRef.current, peer.info.name)} disabled={!hasVideo} title="Take snapshot" aria-label="Snapshot"><Camera size={15} /></button>
            <button className={`tool ${audible ? 'on' : ''}`} onClick={onAudio} disabled={!hasVideo} title={audible ? 'Mute candidate' : 'Listen to candidate'} aria-label="Audio">
              {audible ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
            <button className="tool" onClick={() => onDialog('message')} title="Send message" aria-label="Message"><MessageSquare size={15} /></button>
            <button className="tool amber" onClick={() => onDialog('warn')} title="Warn candidate" aria-label="Warn"><AlertTriangle size={15} /></button>
            <button className="tool red" onClick={() => onDialog('flag')} title="Flag for cheating" aria-label="Flag"><Flag size={15} /></button>
            <button className="tool red" onClick={() => onDialog('terminate')} disabled={peer.phase !== 'in-exam'} title="Terminate exam" aria-label="Terminate"><Ban size={15} /></button>
            <button className="tool" onClick={onFocus} title="Expand" aria-label="Expand" style={{ marginLeft: 'auto' }}><Maximize2 size={15} /></button>
          </>
        )}
      </div>
    </article>
  );
}

function FocusModal({ peer, exam, recording, events, onClose, onRecord, onDialog }) {
  const videoRef = useRef(null);
  const [audible, setAudible] = useState(true);
  const prog = peer.progress;
  return (
    <Modal title={`Monitoring · ${peer.info.name}`} onClose={onClose} wide>
      <div className="focus-layout">
        <div>
          <div className="live-video focus">
            {peer.stream && !peer.left ? (
              <StreamVideo stream={peer.stream} muted={!audible} videoRef={videoRef} key={peer.streamVersion} />
            ) : (
              <div className="live-novideo"><VideoOff size={32} /><span>No video</span></div>
            )}
            <div className="live-overlay top">
              {recording ? <span className="rec-chip"><i /> REC</span> : <span className="live-chip"><i /> LIVE</span>}
            </div>
          </div>
          <div className="row-actions" style={{ marginTop: 12 }}>
            <button className={`btn small ${recording ? 'danger-ghost' : 'primary'}`} onClick={onRecord} disabled={!peer.stream || peer.left}>
              {recording ? <><Square size={13} /> Stop recording</> : <><Circle size={13} fill="currentColor" /> Record</>}
            </button>
            <button className="btn small" onClick={() => snapshot(videoRef.current, peer.info.name)} disabled={!peer.stream}><Camera size={13} /> Snapshot</button>
            <button className="btn small" onClick={() => setAudible(!audible)}>{audible ? <><Volume2 size={13} /> Mute</> : <><VolumeX size={13} /> Unmute</>}</button>
            <button className="btn small" onClick={() => onDialog('message')} disabled={peer.left}><MessageSquare size={13} /> Message</button>
            <button className="btn small" onClick={() => onDialog('warn')} disabled={peer.left}><AlertTriangle size={13} /> Warn</button>
            <button className="btn small danger-ghost" onClick={() => onDialog('flag')}><Flag size={13} /> Flag</button>
            <button className="btn small danger-ghost" onClick={() => onDialog('terminate')} disabled={peer.left || peer.phase !== 'in-exam'}><Ban size={13} /> Terminate</button>
          </div>
        </div>
        <div className="focus-side">
          <div className="person" style={{ marginBottom: 12 }}>
            <Avatar name={peer.info.name} size="lg" online={!peer.left} />
            <div>
              <div className="strong">{peer.info.name}</div>
              <div className="muted small">{peer.info.candidateId} · {peer.info.department}</div>
            </div>
          </div>
          <dl className="kv">
            <dt>Exam</dt><dd>{exam?.title || peer.info.examTitle}</dd>
            <dt>Status</dt><dd><PhaseBadge peer={peer} /></dd>
            <dt>Joined</dt><dd>{fmtDateTime(peer.joinedAt)}</dd>
            <dt>Connection</dt><dd className="cap">{peer.connection}</dd>
            {prog && <><dt>Progress</dt><dd>{prog.answered}/{prog.total} answered · Q{prog.current}</dd></>}
            {prog && <><dt>Time left</dt><dd>{fmtDuration(prog.secondsLeft)}</dd></>}
            <dt>Warnings</dt><dd>{peer.warnings}</dd>
            {peer.submitted && <><dt>Score</dt><dd>{peer.submitted.correct}/{peer.submitted.total}</dd></>}
          </dl>
          <h3 style={{ marginTop: 14 }}>Session events</h3>
          <div className="feed" style={{ maxHeight: 220, overflowY: 'auto' }}>
            {events.map((e) => {
              const Icon = EVENT_ICON[e.type] || Info;
              return (
                <div key={e.id} className="feed-item">
                  <div className={`feed-icon ${EVENT_TONE[e.type]}`}><Icon size={14} /></div>
                  <div><div className="feed-text">{e.text}</div><div className="feed-time">{timeAgo(e.at)}</div></div>
                </div>
              );
            })}
            {!events.length && <div className="muted small">No events yet.</div>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

const DIALOG = {
  message: { title: 'Send message', label: 'Message to candidate', button: 'Send', icon: Send, cls: 'primary', required: true },
  warn: { title: 'Warn candidate', label: 'Warning shown to the candidate', button: 'Send warning', icon: AlertTriangle, cls: 'primary', required: true },
  flag: { title: 'Flag for cheating', label: 'Reason (kept in the audit log, not shown to the candidate)', button: 'Flag candidate', icon: Flag, cls: 'danger', required: false },
  terminate: { title: 'Terminate exam', label: 'Reason shown to the candidate', button: 'Terminate exam', icon: Ban, cls: 'danger', required: false },
};

function ActionDialog({ peer, mode, onClose, onSubmit }) {
  const d = DIALOG[mode];
  const [text, setText] = useState(mode === 'warn' ? QUICK_WARNINGS[0] : '');
  return (
    <Modal title={`${d.title} · ${peer.info.name}`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(text.trim()); }}>
        {mode === 'warn' && (
          <div className="chip-row">
            {QUICK_WARNINGS.map((w) => (
              <button type="button" key={w} className={`chip ${text === w ? 'active' : ''}`} onClick={() => setText(w)}>{w}</button>
            ))}
          </div>
        )}
        {mode === 'terminate' && (
          <div className="info-box small" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>
            <Ban size={16} /> The candidate's exam ends immediately and their answers are not submitted.
          </div>
        )}
        <Field label={d.label}>
          <textarea className="input" rows={3} required={d.required} value={text} onChange={(e) => setText(e.target.value)} maxLength={300} autoFocus />
        </Field>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className={`btn ${d.cls === 'danger' ? 'danger-solid' : 'primary'}`}><d.icon size={14} /> {d.button}</button>
        </div>
      </form>
    </Modal>
  );
}

function Recordings({ recordings, onDelete }) {
  if (!recordings.length) return null;
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Film size={17} /> Session Recordings</h2>
          <div className="card-sub">Saved in this browser until you close the tab. Download the ones you need to keep.</div>
        </div>
      </div>
      <div className="rec-grid">
        {recordings.map((r) => (
          <div key={r.id} className="rec-item">
            <video src={r.url} controls preload="metadata" />
            <div className="row-between" style={{ marginTop: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div className="strong small ellipsis">{r.name}</div>
                <div className="muted small">{fmtDuration(r.duration)} · {fmtSize(r.size)} · {timeAgo(r.at)}</div>
              </div>
              <div className="row-actions nowrap">
                <a className="icon-btn" href={r.url} download={r.fileName} title="Download" aria-label="Download recording"><Download size={16} /></a>
                <button className="icon-btn" onClick={() => onDelete(r.id)} title="Delete" aria-label="Delete recording"><Trash2 size={16} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

