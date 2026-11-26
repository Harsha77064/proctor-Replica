// Candidate-facing exam portal (/exam?t=<invite token>).
// The candidate signs in with the access code from their invitation, passes a
// camera/microphone/connection check, then takes the exam while their camera
// and microphone stream to the proctor. Answers are saved to the server as they
// go; the server keeps the clock and scores the exam.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera, Mic, Wifi, Maximize, CheckCircle2, XCircle, Loader2, ShieldCheck, ArrowRight, ArrowLeft, Clock, AlertTriangle,
  MessageSquare, Ban, Send, Eye, KeyRound, Flag as FlagIcon, Hourglass, CloudOff, Cloud, Link2Off,
} from 'lucide-react';
import { api } from '../api.js';
import { LogoMark } from '../components/UI.jsx';
import { SignalingClient, getIceConfig, makeQueue } from '../live/signaling.js';
import { FormError } from './Login.jsx';

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function CandidatePortal() {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('t') || '');
  const [phase, setPhase] = useState('loading'); // loading | invalid | code | check | exam | done | terminated
  const [invite, setInvite] = useState(null); // lookup result (before sign-in)
  const [me, setMe] = useState(null); // /candidate/me
  const [fatal, setFatal] = useState('');
  const [stream, setStream] = useState(null);
  const [sigStatus, setSigStatus] = useState('offline');
  const [messages, setMessages] = useState([]);
  const [warning, setWarning] = useState(null);

  const sigRef = useRef(null);
  const pcs = useRef(new Map());
  const streamRef = useRef(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // Keep the secret token out of the address bar once read.
  useEffect(() => {
    if (token) window.history.replaceState(null, '', '/exam');
  }, [token]);

  const applyMe = useCallback((data) => {
    setMe(data);
    const a = data.attempt;
    if (a?.status === 'Submitted') setPhase('done');
    else if (a?.status === 'Terminated') setPhase('terminated');
    else setPhase((p) => (p === 'exam' && a?.status === 'InProgress' ? 'exam' : 'check'));
  }, []);

  // Restore an existing session, otherwise look up the invitation link.
  useEffect(() => {
    (async () => {
      try {
        applyMe(await api('/candidate/me', { quiet401: true }));
        return;
      } catch {
        /* not signed in yet */
      }
      if (!token) {
        setFatal('Open this page from the link in your exam invitation email.');
        return setPhase('invalid');
      }
      try {
        setInvite(await api('/candidate/lookup', { method: 'POST', body: { token } }));
        setPhase('code');
      } catch (err) {
        setFatal(err.message);
        setPhase('invalid');
      }
    })();
  }, [token, applyMe]);

  const stopEverything = useCallback(() => {
    pcs.current.forEach(({ pc }) => pc?.close());
    pcs.current.clear();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setTimeout(() => sigRef.current?.close(), 300); // let final messages flush
  }, []);

  useEffect(() => () => {
    pcs.current.forEach(({ pc }) => pc?.close());
    streamRef.current?.getTracks().forEach((t) => t.stop());
    sigRef.current?.close();
  }, []);

  const report = useCallback((type, event) => sigRef.current?.toAdmins({ kind: 'event', type, event }), []);
  const announcePhase = useCallback(() => sigRef.current?.toAdmins({ kind: 'phase' }), []);

  const endWith = useCallback(
    async (nextPhase) => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      let finalPhase = nextPhase;
      try {
        const fresh = await api('/candidate/me', { quiet401: true });
        setMe(fresh);
        // The server's record decides: e.g. an exam ended by the admin counts as submitted.
        if (fresh.attempt?.status === 'Submitted') finalPhase = 'done';
        else if (fresh.attempt?.status === 'Terminated') finalPhase = 'terminated';
      } catch {
        /* session ended (e.g. invitation withdrawn): keep what we have */
      }
      setPhase(finalPhase);
      announcePhase();
      stopEverything();
    },
    [announcePhase, stopEverything]
  );

  const connect = useCallback(
    (media) => {
      const sig = new SignalingClient({
        onStatus: setSigStatus,
        onDisconnect: () => {
          pcs.current.forEach(({ pc }) => pc?.close());
          pcs.current.clear();
        },
        onMessage: async (msg) => {
          if (msg.type === 'admin-left') {
            pcs.current.get(msg.id)?.pc?.close();
            pcs.current.delete(msg.id);
            return;
          }
          if (msg.type !== 'relay') return;
          const { from, payload } = msg;
          if (payload?.kind === 'offer') {
            pcs.current.get(from)?.pc?.close();
            const queue = makeQueue();
            pcs.current.set(from, { pc: null, queue });
            queue(async () => {
              const pc = new RTCPeerConnection(await getIceConfig());
              pcs.current.set(from, { pc, queue });
              pc.onicecandidate = (e) => e.candidate && sig.relay(from, { kind: 'ice', candidate: e.candidate });
              await pc.setRemoteDescription(payload.sdp);
              media.getTracks().forEach((t) => pc.addTrack(t, media));
              await pc.setLocalDescription(await pc.createAnswer());
              sig.relay(from, { kind: 'answer', sdp: pc.localDescription });
            });
          } else if (payload?.kind === 'ice') {
            const entry = pcs.current.get(from);
            entry?.queue(() => entry.pc?.addIceCandidate(payload.candidate));
          } else if (payload?.kind === 'command') {
            const text = String(payload.text || '').slice(0, 300);
            if (payload.action === 'message') setMessages((m) => [{ id: Date.now(), text }, ...m].slice(0, 5));
            else if (payload.action === 'warn') setWarning(text || 'Please follow the exam rules.');
            else if (payload.action === 'terminate') endWith('terminated');
          }
        },
      });
      sigRef.current = sig;
    },
    [endWith]
  );

  const org = me?.organization || invite?.organization;

  return (
    <div className="portal">
      <header className="portal-head">
        <div className="person">
          {org?.logoUrl ? <img className="portal-logo" src={org.logoUrl} alt="" /> : <div className="brand-mark sm"><LogoMark size={18} /></div>}
          <div>
            <div className="strong">{org?.name || 'Oversee'}</div>
            <div className="muted small">Proctored exam · Oversee</div>
          </div>
        </div>
        {(phase === 'check' || phase === 'exam') && (
          <div className="row-actions">
            <span className={`server-status ${sigStatus === 'online' ? 'badge-green' : 'badge-amber'}`}>
              <Wifi size={14} /> {sigStatus === 'online' ? 'Connected to proctor' : 'Connecting to proctor…'}
            </span>
            {phase === 'exam' && <span className="rec-chip static"><i /> Proctored · Camera on</span>}
          </div>
        )}
      </header>

      <main className="portal-main">
        {phase === 'loading' && <Loader2 size={30} className="spin muted" style={{ marginTop: 80 }} />}
        {phase === 'invalid' && <Finished icon={Link2Off} tone="red" title="This exam link cannot be used" text={fatal} />}
        {phase === 'code' && invite && (
          <CodeEntry
            invite={invite}
            onSubmit={async (code) => {
              await api('/candidate/login', { method: 'POST', body: { token, code } });
              applyMe(await api('/candidate/me'));
            }}
          />
        )}
        {phase === 'check' && me && (
          <SystemCheck
            me={me}
            sigStatus={sigStatus}
            onRefresh={async () => applyMe(await api('/candidate/me'))}
            onStream={(media) => {
              streamRef.current = media;
              setStream(media);
              if (!sigRef.current) connect(media);
            }}
            onStart={async () => {
              const data = await api('/candidate/start', { method: 'POST' });
              try {
                await document.documentElement.requestFullscreen?.();
              } catch {
                /* full screen refused; reported once the exam starts */
              }
              setMe(data);
              setPhase('exam');
              announcePhase();
              report('Validation', 'System check passed (camera, microphone, connection)');
            }}
          />
        )}
        {phase === 'exam' && me?.attempt?.questions && (
          <Exam
            me={me}
            stream={stream}
            report={report}
            progress={(p) => sigRef.current?.toAdmins({ kind: 'progress', progress: p })}
            onFinished={() => endWith('done')}
          />
        )}
        {phase === 'done' && (
          <Finished
            icon={CheckCircle2}
            tone="green"
            title="Exam submitted"
            text={
              me?.attempt?.result
                ? `You answered ${me.attempt.result.correct} of ${me.attempt.result.total} questions correctly (${me.attempt.result.score}%).`
                : 'Your answers have been submitted. Your organization will share your result.'
            }
          />
        )}
        {phase === 'terminated' && (
          <Finished
            icon={Ban}
            tone="red"
            title="Your exam was ended by the proctor"
            text={me?.attempt?.reason || 'Please contact your organization for more information.'}
          />
        )}
      </main>

      {messages.length > 0 && (phase === 'exam' || phase === 'check') && (
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
function CodeEntry({ invite, onSubmit }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="portal-card narrow">
      <div className="big-icon badge-purple"><KeyRound size={28} /></div>
      <h1 style={{ marginTop: 14 }}>Hi {invite.candidate.firstName}, enter your access code</h1>
      <p className="muted">
        <b style={{ color: 'var(--text)' }}>{invite.exam.title}</b> · {invite.exam.duration} minutes. The code is in your invitation email.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await onSubmit(code);
          } catch (err) {
            setError(err.message);
            setBusy(false);
          }
        }}
      >
        <label className="field">
          <span>Access code</span>
          <input
            id="access-code"
            className="input code-input"
            placeholder="ABCD-1234"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
        <FormError>{error}</FormError>
        <button className="btn primary block" disabled={busy || code.replace(/[^A-Z0-9]/gi, '').length < 8}>
          {busy ? <Loader2 size={16} className="spin" /> : null} Continue <ArrowRight size={16} />
        </button>
      </form>
      <p className="muted small" style={{ marginTop: 16 }}>
        This exam is live proctored. Your camera and microphone will be monitored and may be recorded.
        {invite.organization.supportEmail && <> Need help? Contact {invite.organization.supportEmail}.</>}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
function SystemCheck({ me, sigStatus, onStream, onStart, onRefresh }) {
  const videoRef = useRef(null);
  const [cam, setCam] = useState('pending'); // pending | ok | error
  const [camError, setCamError] = useState('');
  const [level, setLevel] = useState(0);
  const resuming = me.attempt?.status === 'InProgress';
  const [consent, setConsent] = useState(resuming);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fsSupported = !!document.documentElement.requestFullscreen;
  const examOpen = me.exam.status === 'Live';

  // Waiting for the exam to open: check again every 10 seconds.
  useEffect(() => {
    if (examOpen) return undefined;
    const t = setInterval(() => onRefresh().catch(() => {}), 10000);
    return () => clearInterval(t);
  }, [examOpen, onRefresh]);

  useEffect(() => {
    let cancelled = false;
    let audioCtx;
    let raf;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCam('error');
      setCamError(window.isSecureContext ? 'This browser cannot access a camera. Use a recent Chrome, Edge, Firefox or Safari.' : 'Camera access needs a secure (https) address.');
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
            ? 'Camera or microphone permission was blocked. Allow access in your browser settings and reload this page.'
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
    { icon: Maximize, label: 'Full screen', state: fsSupported ? 'ok' : 'error', detail: fsSupported ? 'The exam opens in full screen' : 'Not supported; leaving the exam window will be reported' },
  ];
  const ready = cam === 'ok' && sigStatus === 'online' && consent && examOpen;

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
          <h1>{resuming ? 'Resume your exam' : 'System check'}</h1>
          <p className="muted">
            {me.candidate.name} · {me.exam.title} · {me.exam.duration} min · {me.exam.questionCount} questions
          </p>
          {resuming && (
            <div className="info-box small"><Clock size={16} /> Your answers are saved. The timer kept running: {fmt(me.attempt.secondsLeft)} left.</div>
          )}
          {!examOpen && (
            <div className="info-box small"><Hourglass size={16} /> The exam has not started yet. This page updates automatically when it opens.</div>
          )}
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
              {me.rules.browserLockdown && <li>Copy, paste and right-click are disabled.</li>}
              <li>Every rule break is reported to your proctor and logged.</li>
            </ul>
          </div>
          {!resuming && (
            <label className="consent">
              <input id="consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>I agree to be monitored through my camera and microphone, and to my session being recorded by the proctor.</span>
            </label>
          )}
          <FormError>{error}</FormError>
          <div className="modal-actions">
            <button
              className="btn primary"
              disabled={!ready || busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await onStart();
                } catch (err) {
                  setError(err.message);
                  setBusy(false);
                }
              }}
            >
              {busy && <Loader2 size={16} className="spin" />} {resuming ? 'Resume exam' : 'Start exam'} <ArrowRight size={16} />
            </button>
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
      const t = Date.now();
      if (last[key] && t - last[key] < gap) return;
      last[key] = t;
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
      darkCount = sum / (px.length / 4) < 16 ? darkCount + 1 : 0;
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

function Exam({ me, stream, report, progress, onFinished }) {
  const questions = me.attempt.questions;
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState(me.attempt.answers || {});
  const [marked, setMarked] = useState({});
  const deadline = useMemo(() => Date.now() + me.attempt.secondsLeft * 1000, [me.attempt.secondsLeft]);
  const [secondsLeft, setSecondsLeft] = useState(me.attempt.secondsLeft);
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);
  const [confirming, setConfirming] = useState(false);
  const [saveState, setSaveState] = useState('saved'); // saved | saving | error
  const [submitError, setSubmitError] = useState('');
  const submitting = useRef(false);
  const selfRef = useRef(null);
  const saveChain = useRef(Promise.resolve());

  useEffect(() => {
    if (selfRef.current) selfRef.current.srcObject = stream;
  }, [stream]);

  const saveAnswer = (questionId, value) => {
    setAnswers((a) => ({ ...a, [questionId]: value }));
    setSaveState('saving');
    // Save in order; retry a failed save up to three times.
    saveChain.current = saveChain.current.then(async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await api('/candidate/answers', { method: 'PUT', body: { questionId, value } });
          setSaveState('saved');
          return;
        } catch (err) {
          if (err.status === 409) {
            setSaveState('error');
            return;
          }
          await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        }
      }
      setSaveState('error');
    });
  };

  const submit = useCallback(async () => {
    if (submitting.current) return;
    submitting.current = true;
    setSubmitError('');
    try {
      await saveChain.current;
      await api('/candidate/submit', { method: 'POST' });
      onFinished();
    } catch (err) {
      submitting.current = false;
      setSubmitError(`${err.message} Your answers are saved; try submitting again.`);
    }
  }, [onFinished]);

  useEffect(() => {
    const t = setInterval(() => setSecondsLeft(Math.max(0, Math.round((deadline - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [deadline]);

  useEffect(() => {
    if (secondsLeft === 0) submit();
  }, [secondsLeft, submit]);

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
  useProctoring({ stream, report, lockdown: me.rules.browserLockdown, onFullscreenChange });

  const q = questions[current];
  const low = secondsLeft <= 300;

  return (
    <div className="exam-layout">
      <section className="portal-card exam-card">
        <div className="row-between">
          <span className="muted small strong">Question {current + 1} of {questions.length}</span>
          <div className="row-actions">
            <span className={`save-state ${saveState}`}>
              {saveState === 'saving' ? <><Loader2 size={13} className="spin" /> Saving</> : saveState === 'error' ? <><CloudOff size={13} /> Not saved</> : <><Cloud size={13} /> Saved</>}
            </span>
            <span className={`timer ${low ? 'low' : ''}`}><Clock size={15} /> {fmt(secondsLeft)}</span>
          </div>
        </div>
        <div className="exam-progress"><div style={{ width: `${(answered / questions.length) * 100}%` }} /></div>
        <h2 className="exam-question">{q.text}</h2>
        <div className="exam-options">
          {q.options.map((o, pos) => (
            <button key={o.value} className={`exam-option ${answers[q.id] === o.value ? 'selected' : ''}`} onClick={() => saveAnswer(q.id, o.value)}>
              <span className="opt-letter">{String.fromCharCode(65 + pos)}</span>
              {o.label}
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
              aria-label={`Question ${i + 1}`}
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

      {(confirming || submitError) && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <div className="big-icon badge-purple"><ShieldCheck size={28} /></div>
              <h2 style={{ marginTop: 14 }}>Submit your exam?</h2>
              <p className="muted">
                You answered {answered} of {questions.length} questions.
                {answered < questions.length && ' Unanswered questions are marked wrong.'}
              </p>
              <FormError>{submitError}</FormError>
              <div className="modal-actions" style={{ justifyContent: 'center' }}>
                <button className="btn" onClick={() => { setConfirming(false); setSubmitError(''); }}>Keep working</button>
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
      <p className="muted small">Your camera is off. You can close this window.</p>
    </div>
  );
}
