// Admin-side live proctoring: connects to the signaling server as a proctor,
// opens a WebRTC connection to every candidate who joins, receives their
// camera + microphone, records sessions and relays proctor commands.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../context/StoreContext.jsx';
import { ICE_CONFIG, SignalingClient, makeQueue, pickRecorderMime } from './signaling.js';

const LiveContext = createContext(null);
const MAX_EVENTS = 200;

export function LiveProvider({ children }) {
  const store = useStore();
  const storeRef = useRef(store);
  storeRef.current = store;

  const [status, setStatus] = useState('connecting');
  const [peers, setPeers] = useState({}); // id -> peer view model
  const [events, setEvents] = useState([]); // session alert feed
  const [recordings, setRecordings] = useState([]);
  const [recordingIds, setRecordingIds] = useState([]);

  const sigRef = useRef(null);
  const pcs = useRef(new Map()); // id -> { pc, queue }
  const recorders = useRef(new Map()); // id -> { recorder, chunks, startedAt, name }
  const peersRef = useRef(peers);
  peersRef.current = peers;

  const patchPeer = useCallback((id, patch) => {
    setPeers((p) => (p[id] ? { ...p, [id]: { ...p[id], ...(typeof patch === 'function' ? patch(p[id]) : patch) } } : p));
  }, []);

  const pushEvent = useCallback((ev) => {
    setEvents((list) => [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), ...ev }, ...list].slice(0, MAX_EVENTS));
  }, []);

  const stopRecording = useCallback((id) => {
    const r = recorders.current.get(id);
    if (r && r.recorder.state !== 'inactive') r.recorder.stop();
  }, []);

  const closePeer = useCallback(
    (id) => {
      stopRecording(id);
      const entry = pcs.current.get(id);
      entry?.pc.close();
      pcs.current.delete(id);
    },
    [stopRecording]
  );

  const call = useCallback(
    (id) => {
      const sig = sigRef.current;
      if (!sig || pcs.current.has(id)) return;
      const pc = new RTCPeerConnection(ICE_CONFIG);
      const queue = makeQueue();
      pcs.current.set(id, { pc, queue });
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      const remote = new MediaStream();
      pc.ontrack = (e) => {
        const src = e.streams[0];
        (src ? src.getTracks() : [e.track]).forEach((t) => {
          if (!remote.getTracks().includes(t)) remote.addTrack(t);
        });
        patchPeer(id, { stream: remote, streamVersion: Date.now() });
      };
      pc.onicecandidate = (e) => e.candidate && sig.relay(id, { kind: 'ice', candidate: e.candidate });
      pc.onconnectionstatechange = () => patchPeer(id, { connection: pc.connectionState });

      queue(async () => {
        await pc.setLocalDescription(await pc.createOffer());
        sig.relay(id, { kind: 'offer', sdp: pc.localDescription });
      });
    },
    [patchPeer]
  );

  const addPeer = useCallback(
    (id, info) => {
      const { candidateId } = info || {};
      if (!candidateId) return;
      setPeers((p) => {
        const next = { ...p };
        // A reconnecting candidate replaces their stale tile.
        Object.values(next).forEach((old) => {
          if (old.info.candidateId === candidateId && old.id !== id) {
            closePeer(old.id);
            delete next[old.id];
          }
        });
        next[id] = {
          id,
          info,
          stream: null,
          connection: 'new',
          phase: info.phase || 'system-check',
          progress: null,
          warnings: 0,
          joinedAt: new Date().toISOString(),
          left: false,
          submitted: null,
        };
        return next;
      });
      storeRef.current.setCandidateOnline(candidateId, true);
      storeRef.current.addAuditEvent(candidateId, 'Normal', 'Joined live proctoring session', info.examId);
      pushEvent({ peerId: id, name: info.name, type: 'Normal', text: 'joined the proctoring session' });
      call(id);
    },
    [call, closePeer, pushEvent]
  );

  const onRelay = useCallback(
    (from, payload) => {
      const entry = pcs.current.get(from);
      const peer = peersRef.current[from];
      switch (payload?.kind) {
        case 'answer':
          entry?.queue(() => entry.pc.setRemoteDescription(payload.sdp));
          break;
        case 'ice':
          entry?.queue(() => entry.pc.addIceCandidate(payload.candidate));
          break;
        case 'phase':
          patchPeer(from, { phase: payload.phase });
          if (peer && payload.phase === 'in-exam') {
            storeRef.current.addAuditEvent(peer.info.candidateId, 'Normal', 'Started exam (live proctored)', peer.info.examId);
            pushEvent({ peerId: from, name: peer.info.name, type: 'Normal', text: 'started the exam' });
          }
          break;
        case 'progress':
          patchPeer(from, { progress: payload.progress });
          break;
        case 'event': {
          if (!peer) break;
          const type = ['Normal', 'Warning', 'Validation'].includes(payload.type) ? payload.type : 'Normal';
          const text = String(payload.event || '').slice(0, 160);
          storeRef.current.recordProctorEvent(peer.info.candidateId, type, text, peer.info.examId);
          if (type === 'Warning') patchPeer(from, (p) => ({ warnings: p.warnings + 1 }));
          pushEvent({ peerId: from, name: peer.info.name, type, text });
          break;
        }
        case 'submit': {
          if (!peer) break;
          const r = payload.result || {};
          storeRef.current.addResult({
            candidateId: peer.info.candidateId,
            examId: peer.info.examId,
            correct: Number(r.correct) || 0,
            total: Number(r.total) || 0,
            timeTaken: Number(r.timeTaken) || 0,
          });
          patchPeer(from, { phase: 'submitted', submitted: r });
          pushEvent({ peerId: from, name: peer.info.name, type: 'Normal', text: `submitted the exam (${r.correct}/${r.total})` });
          break;
        }
        default:
      }
    },
    [patchPeer, pushEvent]
  );

  useEffect(() => {
    if (typeof RTCPeerConnection === 'undefined') {
      setStatus('unsupported');
      return undefined;
    }
    const sig = new SignalingClient('admin', { name: 'Exam Admin' }, {
      onStatus: setStatus,
      onDisconnect: () => {
        // The server forgets us on disconnect; drop connections and rejoin cleanly.
        [...pcs.current.keys()].forEach(closePeer);
        setPeers({});
      },
      onMessage: (msg) => {
        if (msg.type === 'peers') msg.peers.forEach((p) => addPeer(p.id, p.info));
        else if (msg.type === 'peer-joined') addPeer(msg.id, msg.info);
        else if (msg.type === 'peer-left') {
          const peer = peersRef.current[msg.id];
          closePeer(msg.id);
          if (peer) {
            patchPeer(msg.id, { left: true, connection: 'closed', stream: null });
            storeRef.current.setCandidateOnline(peer.info.candidateId, false);
            if (peer.phase !== 'submitted' && peer.phase !== 'terminated') {
              storeRef.current.recordProctorEvent(peer.info.candidateId, 'Warning', 'Left the live session before submitting', peer.info.examId);
            }
            pushEvent({ peerId: msg.id, name: peer.info.name, type: 'Normal', text: 'disconnected' });
          }
        } else if (msg.type === 'relay') onRelay(msg.from, msg.payload);
      },
    });
    sigRef.current = sig;
    return () => {
      sig.close();
      [...pcs.current.keys()].forEach(closePeer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- commands
  const command = useCallback((id, action, text = '') => {
    sigRef.current?.relay(id, { kind: 'command', action, text });
  }, []);

  const sendMessage = useCallback(
    (id, text) => {
      const peer = peersRef.current[id];
      command(id, 'message', text);
      if (peer) {
        storeRef.current.addAuditEvent(peer.info.candidateId, 'Normal', `Proctor message: ${text}`, peer.info.examId);
        pushEvent({ peerId: id, name: peer.info.name, type: 'Normal', text: `was sent a message: “${text}”` });
      }
    },
    [command, pushEvent]
  );

  const warn = useCallback(
    (id, text) => {
      const peer = peersRef.current[id];
      command(id, 'warn', text);
      if (peer) {
        storeRef.current.recordProctorEvent(peer.info.candidateId, 'Warning', `Proctor warning: ${text}`, peer.info.examId);
        patchPeer(id, (p) => ({ warnings: p.warnings + 1 }));
        pushEvent({ peerId: id, name: peer.info.name, type: 'Warning', text: `was warned: “${text}”` });
      }
    },
    [command, patchPeer, pushEvent]
  );

  const flag = useCallback(
    (id, reason) => {
      const peer = peersRef.current[id];
      if (!peer) return;
      storeRef.current.flagCandidate(peer.info.candidateId, reason, peer.info.examId);
      pushEvent({ peerId: id, name: peer.info.name, type: 'Warning', text: `was flagged for cheating${reason ? `: ${reason}` : ''}` });
    },
    [pushEvent]
  );

  const terminate = useCallback(
    (id, reason) => {
      const peer = peersRef.current[id];
      command(id, 'terminate', reason);
      if (peer) {
        storeRef.current.addAuditEvent(peer.info.candidateId, 'Warning', `Exam terminated by proctor${reason ? `: ${reason}` : ''}`, peer.info.examId);
        patchPeer(id, { phase: 'terminated' });
        pushEvent({ peerId: id, name: peer.info.name, type: 'Warning', text: 'had their exam terminated' });
      }
    },
    [command, patchPeer, pushEvent]
  );

  // ---------------------------------------------------------------- recording
  const startRecording = useCallback(
    (id) => {
      const peer = peersRef.current[id];
      if (!peer?.stream || recorders.current.has(id) || typeof MediaRecorder === 'undefined') return false;
      const mimeType = pickRecorderMime();
      let recorder;
      try {
        recorder = new MediaRecorder(peer.stream, mimeType ? { mimeType } : undefined);
      } catch {
        return false;
      }
      const rec = { recorder, chunks: [], startedAt: Date.now(), name: peer.info.name, candidateId: peer.info.candidateId };
      recorder.ondataavailable = (e) => e.data.size && rec.chunks.push(e.data);
      recorder.onstop = () => {
        recorders.current.delete(id);
        setRecordingIds((ids) => ids.filter((x) => x !== id));
        if (!rec.chunks.length) return;
        const type = recorder.mimeType || 'video/webm';
        const blob = new Blob(rec.chunks, { type });
        const ext = type.includes('mp4') ? 'mp4' : 'webm';
        const stamp = new Date(rec.startedAt).toISOString().replace(/[:.]/g, '-').slice(0, 19);
        setRecordings((list) => [
          {
            id: `${id}-${rec.startedAt}`,
            name: rec.name,
            candidateId: rec.candidateId,
            url: URL.createObjectURL(blob),
            size: blob.size,
            duration: Math.round((Date.now() - rec.startedAt) / 1000),
            fileName: `${rec.candidateId}-${stamp}.${ext}`,
            at: new Date(rec.startedAt).toISOString(),
          },
          ...list,
        ]);
        storeRef.current.addAuditEvent(rec.candidateId, 'Validation', 'Proctor saved a session recording', peer.info.examId);
      };
      recorder.start(1000);
      recorders.current.set(id, rec);
      setRecordingIds((ids) => [...ids, id]);
      storeRef.current.addAuditEvent(peer.info.candidateId, 'Validation', 'Proctor started recording the session', peer.info.examId);
      return true;
    },
    []
  );

  const deleteRecording = useCallback((recId) => {
    setRecordings((list) => {
      const r = list.find((x) => x.id === recId);
      if (r) URL.revokeObjectURL(r.url);
      return list.filter((x) => x.id !== recId);
    });
  }, []);

  const dismissPeer = useCallback((id) => {
    closePeer(id);
    setPeers((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
  }, [closePeer]);

  const value = useMemo(
    () => ({
      status,
      peers: Object.values(peers).sort((a, b) => a.joinedAt.localeCompare(b.joinedAt)),
      events,
      recordings,
      recordingIds,
      sendMessage,
      warn,
      flag,
      terminate,
      startRecording,
      stopRecording,
      deleteRecording,
      dismissPeer,
      clearEvents: () => setEvents([]),
    }),
    [status, peers, events, recordings, recordingIds, sendMessage, warn, flag, terminate, startRecording, stopRecording, deleteRecording, dismissPeer]
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive() {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error('useLive must be used inside LiveProvider');
  return ctx;
}
