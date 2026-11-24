// Candidate-facing exam portal (/exam). Captures the candidate's camera and
// microphone, streams them to every connected proctor over WebRTC, runs the
// exam and reports integrity events (tab switches, leaving full screen, a
// covered camera, copy/paste attempts) to the proctor in real time.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera, Mic, Wifi, Maximize, CheckCircle2, XCircle, Loader2, ShieldCheck, ArrowRight, ArrowLeft, Clock, AlertTriangle,
  MessageSquare, Ban, Send, Eye, LogIn, Flag as FlagIcon,
} from 'lucide-react';
import { useStore, byId } from '../context/StoreContext.jsx';
import { LogoMark, Avatar } from '../components/UI.jsx';
import { ICE_CONFIG, SignalingClient, makeQueue } from '../live/signaling.js';

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function CandidatePortal() {
  const store = useStore();
  const [step, setStep] = useState('login'); // login | check | exam | done | terminated
  const [session, setSession] = useState(null); // { candidate, exam, bank }
  const [stream, setStream] = useState(null);
  const [sigStatus, setSigStatus] = useState('offline');
  const [messages, setMessages] = useState([]);
  const [warning, setWarning] = useState(null);
  const [terminateReason, setTerminateReason] = useState('');
  const [result, setResult] = useState(null);

  const sigRef = useRef(null);
  const pcs = useRef(new Map());
  const streamRef = useRef(null);
  const stepRef = useRef(step);
  stepRef.current = step;

  const stopEverything = useCallback(() => {
    pcs.current.forEach(({ pc }) => pc.close());
    pcs.current.clear();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setTimeout(() => sigRef.current?.close(), 300); // let final messages flush
  }, []);

  useEffect(() => () => {
    pcs.current.forEach(({ pc }) => pc.close());
    streamRef.current?.getTracks().forEach((t) => t.stop());
    sigRef.current?.close();
  }, []);

  const report = useCallback((type, event) => sigRef.current?.toAdmins({ kind: 'event', type, event }), []);

  const connect = useCallback(
    (s, media) => {
      const sig = new SignalingClient(
        'candidate',
        {
          candidateId: s.candidate.id,
          name: s.candidate.name,
          department: s.candidate.department,
          examId: s.exam.id,
          examTitle: s.exam.title,
          phase: 'system-check',
        },
        {
          onStatus: setSigStatus,
          onDisconnect: () => {
            pcs.current.forEach(({ pc }) => pc.close());
            pcs.current.clear();
          },
          onMessage: (msg) => {
            if (msg.type === 'admin-left') {
              pcs.current.get(msg.id)?.pc.close();
              pcs.current.delete(msg.id);
              return;
            }
            if (msg.type !== 'relay') return;
            const { from, payload } = msg;
            if (payload?.kind === 'offer') {
              pcs.current.get(from)?.pc.close();
              const pc = new RTCPeerConnection(ICE_CONFIG);
              const queue = makeQueue();
              pcs.current.set(from, { pc, queue });
              pc.onicecandidate = (e) => e.candidate && sig.relay(from, { kind: 'ice', candidate: e.candidate });
              queue(async () => {
                await pc.setRemoteDescription(payload.sdp);
                media.getTracks().forEach((t) => pc.addTrack(t, media));
                await pc.setLocalDescription(await pc.createAnswer());
                sig.relay(from, { kind: 'answer', sdp: pc.localDescription });
              });
            } else if (payload?.kind === 'ice') {
              const entry = pcs.current.get(from);
              entry?.queue(() => entry.pc.addIceCandidate(payload.candidate));
            } else if (payload?.kind === 'command') {
              const text = String(payload.text || '').slice(0, 300);
              if (payload.action === 'message') {
                setMessages((m) => [{ id: Date.now(), text }, ...m].slice(0, 5));
              } else if (payload.action === 'warn') {
                setWarning(text || 'Please follow the exam rules.');
              } else if (payload.action === 'terminate' && stepRef.current === 'exam') {
                setTerminateReason(text);
                setStep('terminated');
                sig.updateInfo({ phase: 'terminated' });
                if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
                stopEverything();
              }
            }
          },
        }
      );
      sigRef.current = sig;
    },
    [stopEverything]
  );

  const setPhase = (phase) => {
    sigRef.current?.updateInfo({ phase });
    sigRef.current?.toAdmins({ kind: 'phase', phase });
  };

  return (
    <div className="portal">
      <header className="portal-head">
        <div className="person">
          <div className="brand-mark sm"><LogoMark size={18} /></div>
          <div>
            <div className="strong">Oversee</div>
            <div className="muted small">{store.settings.organization.name}</div>
          </div>
        </div>
        {(step === 'check' || step === 'exam') && (
          <div className="row-actions">
            <span className={`server-status ${sigStatus === 'online' ? 'badge-green' : 'badge-amber'}`}>
              <Wifi size={14} /> {sigStatus === 'online' ? 'Connected to proctor' : 'Connecting to proctor…'}
            </span>
            {step === 'exam' && <span className="rec-chip static"><i /> Proctored · Camera on</span>}
          </div>
        )}
      </header>

      <main className="portal-main">
        {step === 'login' && (
          <Login
            store={store}
            onContinue={(s) => {
              setSession(s);
              setStep('check');
            }}
          />
        )}
        {step === 'check' && session && (
          <SystemCheck
            session={session}
            sigStatus={sigStatus}
            onStream={(media) => {
              streamRef.current = media;
              setStream(media);
              if (!sigRef.current) connect(session, media);
            }}
            onBack={() => {
              stopEverything();
              sigRef.current = null;
              setStream(null);
              setStep('login');
            }}
            onStart={async () => {
              try {
                await document.documentElement.requestFullscreen?.();
              } catch {
                /* full screen refused; reported once the exam starts */
              }
              setPhase('in-exam');
              report('Validation', 'System check passed (camera, microphone, connection)');
              setStep('exam');
            }}
          />
        )}
        {step === 'exam' && session && (
          <Exam
            session={session}
            stream={stream}
            settings={store.settings}
            report={report}
            progress={(p) => sigRef.current?.toAdmins({ kind: 'progress', progress: p })}
            onSubmit={(r) => {
              sigRef.current?.toAdmins({ kind: 'submit', result: r });
              setPhase('submitted');
              setResult(r);
              setStep('done');
              if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
              stopEverything();
            }}
          />
        )}
        {step === 'done' && (
          <Finished
            icon={CheckCircle2}
            tone="green"
            title="Exam submitted"
            text={
              store.settings.exam.showResultsToCandidate && result
                ? `You answered ${result.correct} of ${result.total} questions correctly (${Math.round((result.correct / result.total) * 100)}%).`
                : 'Your answers have been submitted. Your organization will share your result.'
            }
          />
        )}
        {step === 'terminated' && (
          <Finished
            icon={Ban}
            tone="red"
            title="Your exam was ended by the proctor"
            text={terminateReason || 'Please contact your organization for more information.'}
          />
        )}
      </main>

      {messages.length > 0 && (step === 'exam' || step === 'check') && (
        <div className="portal-messages">
          {messages.map((m) => (
            <div key={m.id} className="portal-message">
              <MessageSquare size={16} />
              <div><b>Message from proctor</b><div>{m.text}</div></div>
              <button className="icon-btn" aria-label="Dismiss" onClick={() => setMessages((x) => x.filter((y) => y.id !== m.id))}>×</button>
            </div>
          ))}
        </div>
      )}

      {warning && (
        <div className="modal-backdrop">
          <div className="modal" role="alertdialog" aria-modal="true">
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <div className="big-icon badge-amber"><AlertTriangle size={30} /></div>
              <h2 style={{ marginTop: 14 }}>Warning from your proctor</h2>
              <p style={{ color: 'var(--text-2)' }}>{warning}</p>
              <button
                className="btn primary"
                onClick={() => {
                  report('Normal', 'Acknowledged proctor warning');
                  setWarning(null);
                }}
              >
                I understand
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Login({ store, onContinue }) {
  const { candidates, exams, questionBanks } = store;
  const liveExams = exams.filter((e) => e.status === 'Live');
  const [id, setId] = useState('');
  const [examId, setExamId] = useState('');
  const [error, setError] = useState('');

  const candidate = candidates.find((c) => c.id.toLowerCase() === id.trim().toLowerCase());
  const myExams = candidate ? liveExams.filter((e) => e.candidates.includes(candidate.id)) : [];
  useEffect(() => setExamId(myExams[0]?.id || ''), [candidate?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const demo = useMemo(
    () => liveExams.flatMap((e) => e.candidates.map((cid) => byId(candidates, cid))).filter((c) => c?.status === 'Active').slice(0, 6),
    [liveExams, candidates]
  );

  const submit = (e) => {
    e.preventDefault();
    if (!candidate) return setError('No candidate found with that ID.');
    if (candidate.status !== 'Active') return setError('Your account is inactive. Contact your organization.');
    const exam = byId(exams, examId);
    if (!exam) return setError('You have no live exam assigned right now.');
    const bank = byId(questionBanks, exam.bankId);
    if (!bank?.questions.length) return setError('This exam has no questions yet.');
    onContinue({ candidate, exam, bank });
  };

  return (
    <div className="portal-card narrow">
      <div className="big-icon badge-purple"><LogIn size={28} /></div>
      <h1 style={{ marginTop: 14 }}>Join your exam</h1>
      <p className="muted">This exam is live proctored. Your camera and microphone will be monitored by an exam administrator.</p>
      <form onSubmit={submit}>
        <label className="field">
          <span>Candidate ID</span>
          <input className="input" placeholder="e.g. CND-1001" value={id} onChange={(e) => { setId(e.target.value); setError(''); }} required autoFocus />
        </label>
        {candidate && (
          <div className="info-box">
            <Avatar name={candidate.name} size="sm" />
            <div><b>{candidate.name}</b><div className="muted small">{candidate.department}</div></div>
          </div>
        )}
        {candidate && (
          <label className="field">
            <span>Live exam</span>
            <select className="input" value={examId} onChange={(e) => setExamId(e.target.value)} disabled={!myExams.length}>
              {myExams.length ? myExams.map((e) => <option key={e.id} value={e.id}>{e.title} · {e.duration} min</option>) : <option>No live exam assigned</option>}
            </select>
          </label>
        )}
        {error && <div className="form-error"><XCircle size={15} /> {error}</div>}
        <button className="btn primary block" disabled={!candidate || !myExams.length}>Continue <ArrowRight size={16} /></button>
      </form>
      {demo.length > 0 && (
        <div className="demo-ids">
          <div className="muted small">Demo candidates with a live exam:</div>
          <div className="chip-row">
            {demo.map((c) => <button key={c.id} type="button" className="chip" onClick={() => setId(c.id)}>{c.id} · {c.name.split(' ')[0]}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function SystemCheck({ session, sigStatus, onStream, onBack, onStart }) {
  const videoRef = useRef(null);
  const [cam, setCam] = useState('pending'); // pending | ok | error
  const [camError, setCamError] = useState('');
  const [level, setLevel] = useState(0);
  const [consent, setConsent] = useState(false);
  const fsSupported = !!document.documentElement.requestFullscreen;

  useEffect(() => {
    let cancelled = false;
    let audioCtx;
    let raf;
    const secure = window.isSecureContext;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCam('error');
      setCamError(secure ? 'This browser cannot access a camera.' : 'Camera access needs a secure (https) address. Ask your administrator for the https link.');
      return undefined;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: { echoCancellation: true, noiseSuppression: true } })
      .then((media) => {
        if (cancelled) return media.getTracks().forEach((t) => t.stop());
        if (videoRef.current) videoRef.current.srcObject = media;
        setCam('ok');
        onStream(media);
        try {
          audioCtx = new AudioContext();
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          audioCtx.createMediaStreamSource(media).connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            analyser.getByteFrequencyData(data);
            setLevel(Math.min(100, Math.round((data.reduce((a, b) => a + b, 0) / data.length) * 1.6)));
            raf = requestAnimationFrame(tick);
          };
          tick();
        } catch {
          /* level meter is optional */
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setCam('error');
        setCamError(
          err?.name === 'NotAllowedError'
            ? 'Camera or microphone permission was blocked. Allow access in your browser and reload this page.'
            : err?.name === 'NotFoundError'
            ? 'No camera or microphone was found on this device.'
            : 'Could not start the camera. Close other apps using it and reload.'
        );
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      audioCtx?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checks = [
    { icon: Camera, label: 'Camera', state: cam, detail: cam === 'error' ? camError : 'Your face should be clearly visible' },
    { icon: Mic, label: 'Microphone', state: cam, detail: cam === 'ok' ? 'Speak to see the level move' : '' },
    { icon: Wifi, label: 'Proctor connection', state: sigStatus === 'online' ? 'ok' : cam === 'error' ? 'error' : 'pending', detail: sigStatus === 'online' ? 'A proctor can now see your camera' : 'Connecting to the proctoring server…' },
    { icon: Maximize, label: 'Full screen', state: fsSupported ? 'ok' : 'error', detail: fsSupported ? 'The exam opens in full screen' : 'Not supported — leaving the exam window will be reported' },
  ];
  const ready = cam === 'ok' && sigStatus === 'online' && consent;

  return (
    <div className="portal-card wide">
      <div className="check-layout">
        <div>
          <div className="check-video">
            <video ref={videoRef} autoPlay playsInline muted />
            {cam !== 'ok' && (
              <div className="live-novideo">{cam === 'pending' ? <Loader2 size={28} className="spin" /> : <XCircle size={28} />}<span>{cam === 'pending' ? 'Starting camera…' : 'Camera unavailable'}</span></div>
            )}
            {cam === 'ok' && <span className="rec-chip static" style={{ position: 'absolute', top: 10, left: 10 }}><i /> Preview</span>}
          </div>
          <div className="mic-meter" aria-label="Microphone level"><div style={{ width: `${level}%` }} /></div>
        </div>
        <div>
          <h1>System check</h1>
          <p className="muted">{session.exam.title} · {session.exam.duration} min · {session.bank.questions.length} questions</p>
          <div className="checklist">
            {checks.map((c) => (
              <div key={c.label} className="check-row">
                <div className="feed-icon badge-blue"><c.icon size={16} /></div>
                <div style={{ flex: 1 }}>
                  <div className="strong small">{c.label}</div>
                  {c.detail && <div className="muted small">{c.detail}</div>}
                </div>
                {c.state === 'ok' ? <CheckCircle2 size={20} className="text-green" /> : c.state === 'error' ? <XCircle size={20} className="text-red" /> : <Loader2 size={20} className="spin muted" />}
              </div>
            ))}
          </div>
          <div className="rules">
            <div className="strong small" style={{ marginBottom: 6 }}>During the exam</div>
            <ul>
              <li>Stay in full screen and do not switch tabs or windows.</li>
              <li>Keep your face visible and your camera uncovered.</li>
              <li>Copy, paste and right-click are disabled.</li>
              <li>Every rule break is reported to your proctor and logged.</li>
            </ul>
          </div>
          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I agree to be monitored through my camera and microphone, and to my session being recorded by the proctor.</span>
          </label>
          <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
            <button className="btn ghost" onClick={onBack}><ArrowLeft size={15} /> Back</button>
            <button className="btn primary" disabled={!ready} onClick={onStart}>Start exam <ArrowRight size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function useProctoring({ stream, report, lockdown, onFullscreenChange }) {
  useEffect(() => {
    const last = {};
    const once = (key, type, text, gap = 4000) => {
      const now = Date.now();
      if (last[key] && now - last[key] < gap) return;
      last[key] = now;
      report(type, text);
    };
    const onVisibility = () => document.hidden && once('tab', 'Warning', 'Switched tab or minimised the exam window');
    const onBlur = () => !document.hidden && once('blur', 'Warning', 'Exam window lost focus');
    const onFs = () => {
      const fs = !!document.fullscreenElement;
      onFullscreenChange(fs);
      if (!fs) once('fs', 'Warning', 'Exited full screen');
    };
    const block = (e) => {
      if (!lockdown) return;
      e.preventDefault();
      once('clip', 'Warning', e.type === 'contextmenu' ? 'Right-click attempt blocked' : `${e.type[0].toUpperCase()}${e.type.slice(1)} attempt blocked`);
    };
    const onKey = (e) => {
      if (e.key === 'PrintScreen') once('print', 'Warning', 'Screenshot key pressed');
      if (lockdown && (e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'p', 's', 'u'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        once('keys', 'Warning', `Blocked shortcut ${e.ctrlKey ? 'Ctrl' : 'Cmd'}+${e.key.toUpperCase()}`);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFs);
    ['copy', 'cut', 'paste', 'contextmenu'].forEach((t) => document.addEventListener(t, block));
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    // Camera health: track ended, or the image goes almost black (covered lens).
    const video = stream?.getVideoTracks()[0];
    const onEnded = () => report('Warning', 'Camera was turned off or disconnected');
    video?.addEventListener('ended', onEnded);
    const probe = document.createElement('video');
    probe.muted = true;
    probe.playsInline = true;
    probe.srcObject = stream || null;
    probe.play().catch(() => {});
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 24;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let darkCount = 0;
    let darkReported = false;
    const timer = setInterval(() => {
      if (!probe.videoWidth) return;
      ctx.drawImage(probe, 0, 0, 32, 24);
      const px = ctx.getImageData(0, 0, 32, 24).data;
      let sum = 0;
      for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const avg = sum / (px.length / 4);
      darkCount = avg < 16 ? darkCount + 1 : 0;
      if (darkCount >= 3 && !darkReported) {
        darkReported = true;
        report('Warning', 'Camera covered or image too dark');
      } else if (darkCount === 0) darkReported = false;
    }, 1500);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFs);
      ['copy', 'cut', 'paste', 'contextmenu'].forEach((t) => document.removeEventListener(t, block));
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      video?.removeEventListener('ended', onEnded);
      clearInterval(timer);
      probe.srcObject = null;
    };
  }, [stream, report, lockdown, onFullscreenChange]);
}

function Exam({ session, stream, settings, report, progress, onSubmit }) {
  const { bank, exam } = session;
  const questions = useMemo(() => {
    const qs = bank.questions.map((q) => ({ ...q, order: q.options.map((_, i) => i) }));
    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    if (settings.exam.shuffleOptions) qs.forEach((q) => shuffle(q.order));
    return settings.exam.shuffleQuestions ? shuffle(qs) : qs;
  }, [bank, settings.exam.shuffleOptions, settings.exam.shuffleQuestions]);

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({}); // questionId -> original option index
  const [marked, setMarked] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(exam.duration * 60);
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);
  const [confirming, setConfirming] = useState(false);
  const startedAt = useRef(Date.now());
  const submitted = useRef(false);
  const selfRef = useRef(null);

  useEffect(() => {
    if (selfRef.current) selfRef.current.srcObject = stream;
  }, [stream]);

  const submit = useCallback(() => {
    if (submitted.current) return;
    submitted.current = true;
    const correct = questions.filter((q) => answers[q.id] === q.answer).length;
    onSubmit({ correct, total: questions.length, timeTaken: Math.max(1, Math.round((Date.now() - startedAt.current) / 60000)) });
  }, [answers, questions, onSubmit]);

  useEffect(() => {
    const end = startedAt.current + exam.duration * 60000;
    const t = setInterval(() => setSecondsLeft(Math.max(0, Math.round((end - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [exam.duration]);

  useEffect(() => {
    if (secondsLeft === 0) {
      report('Normal', 'Time ran out — exam auto-submitted');
      submit();
    }
  }, [secondsLeft, submit, report]);

  const answered = Object.keys(answers).length;
  const sendProgress = useRef(progress);
  sendProgress.current = progress;
  const stateRef = useRef({});
  stateRef.current = { answered, total: questions.length, current: current + 1, secondsLeft };
  useEffect(() => {
    sendProgress.current(stateRef.current);
    const t = setInterval(() => sendProgress.current(stateRef.current), 5000);
    return () => clearInterval(t);
  }, [answered, current]);

  const onFullscreenChange = useCallback((fs) => setFullscreen(fs), []);
  useProctoring({ stream, report, lockdown: settings.security.browserLockdown, onFullscreenChange });

  const q = questions[current];
  const low = secondsLeft <= 300;

  return (
    <div className="exam-layout">
      <section className="portal-card exam-card">
        <div className="row-between">
          <span className="muted small strong">Question {current + 1} of {questions.length}</span>
          <span className={`timer ${low ? 'low' : ''}`}><Clock size={15} /> {fmt(secondsLeft)}</span>
        </div>
        <div className="exam-progress"><div style={{ width: `${(answered / questions.length) * 100}%` }} /></div>
        <h2 className="exam-question">{q.text}</h2>
        <div className="exam-options">
          {q.order.map((oi, pos) => (
            <button
              key={oi}
              className={`exam-option ${answers[q.id] === oi ? 'selected' : ''}`}
              onClick={() => setAnswers({ ...answers, [q.id]: oi })}
            >
              <span className="opt-letter">{String.fromCharCode(65 + pos)}</span>
              {q.options[oi]}
            </button>
          ))}
        </div>
        <div className="row-between" style={{ marginTop: 22 }}>
          <button className="btn" disabled={current === 0} onClick={() => setCurrent(current - 1)}><ArrowLeft size={15} /> Previous</button>
          <button className={`btn ghost ${marked[q.id] ? 'text-amber' : ''}`} onClick={() => setMarked({ ...marked, [q.id]: !marked[q.id] })}>
            <FlagIcon size={15} /> {marked[q.id] ? 'Marked' : 'Mark for review'}
          </button>
          {current < questions.length - 1 ? (
            <button className="btn primary" onClick={() => setCurrent(current + 1)}>Next <ArrowRight size={15} /></button>
          ) : (
            <button className="btn primary" onClick={() => setConfirming(true)}><Send size={15} /> Submit</button>
          )}
        </div>
      </section>

      <aside className="portal-card exam-side">
        <div className="self-view">
          <video ref={selfRef} autoPlay playsInline muted />
          <span className="self-label"><Eye size={12} /> You are being proctored</span>
        </div>
        <div className="strong small" style={{ margin: '14px 0 8px' }}>Questions</div>
        <div className="palette">
          {questions.map((qq, i) => (
            <button
              key={qq.id}
              className={`pal ${i === current ? 'current' : ''} ${answers[qq.id] !== undefined ? 'done' : ''} ${marked[qq.id] ? 'marked' : ''}`}
              onClick={() => setCurrent(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <div className="muted small" style={{ marginTop: 10 }}>{answered} of {questions.length} answered</div>
        <button className="btn primary block" style={{ marginTop: 14 }} onClick={() => setConfirming(true)}><Send size={15} /> Submit exam</button>
      </aside>

      {!fullscreen && document.documentElement.requestFullscreen && (
        <div className="fs-banner">
          <AlertTriangle size={16} /> You left full screen. This has been reported to your proctor.
          <button className="btn small" onClick={() => document.documentElement.requestFullscreen().catch(() => {})}><Maximize size={14} /> Return to full screen</button>
        </div>
      )}

      {confirming && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <div className="big-icon badge-purple"><ShieldCheck size={28} /></div>
              <h2 style={{ marginTop: 14 }}>Submit your exam?</h2>
              <p className="muted">
                You answered {answered} of {questions.length} questions.
                {answered < questions.length && ' Unanswered questions are marked wrong.'}
              </p>
              <div className="modal-actions" style={{ justifyContent: 'center' }}>
                <button className="btn" onClick={() => setConfirming(false)}>Keep working</button>
                <button className="btn primary" onClick={submit}><Send size={15} /> Submit</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Finished({ icon: Icon, tone, title, text }) {
  return (
    <div className="portal-card narrow" style={{ textAlign: 'center' }}>
      <div className={`big-icon badge-${tone}`} style={{ margin: '0 auto' }}><Icon size={30} /></div>
      <h1 style={{ marginTop: 16 }}>{title}</h1>
      <p className="muted">{text}</p>
      <p className="muted small">Your camera has been turned off. You can close this window.</p>
    </div>
  );
}
