// Admin-side live proctoring: connects to the signaling server as staff,
// opens a WebRTC connection to every candidate who joins, receives their
// camera + microphone, records sessions (uploaded to the server) and relays
// proctor commands. The server logs every event and enforces every action.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../context/StoreContext.jsx';
import { api } from '../api.js';
import { SignalingClient, getIceConfig, makeQueue, pickRecorderMime } from './signaling.js';

const LiveContext = createContext(null);
const MAX_EVENTS = 200;

export function LiveProvider({ children }) {
  const store = useStore();
  const storeRef = useRef(store);
  storeRef.current = store;

  const [status, setStatus] = useState('connecting');
  const [peers, setPeers] = useState({}); // id -> peer view model
  const [events, setEvents] = useState([]); // session alert feed
  const [recordings, setRecordings] = useState([]); // saved on the server
  const [uploads, setUploads] = useState([]); // in flight or failed
  const [recordingIds, setRecordingIds] = useState([]);

  const sigRef = useRef(null);
  const pcs = useRef(new Map()); // id -> { pc, queue }
  const recorders = useRef(new Map()); // id -> { recorder, chunks, startedAt, ... }
  const peersRef = useRef(peers);
  peersRef.current = peers;

  const loadRecordings = useCallback(async () => {
    try {
      setRecordings((await api('/recordings')).recordings);
    } catch {
      /* shown as empty; errors surface on the next action */
    }
  }, []);

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
      pcs.current.get(id)?.pc?.close();
      pcs.current.delete(id);
    },
    [stopRecording]
  );

  const call = useCallback(
    async (id) => {
      const sig = sigRef.current;
      if (!sig || pcs.current.has(id)) return;
      const queue = makeQueue();
      pcs.current.set(id, { pc: null, queue });
      const pc = new RTCPeerConnection(await getIceConfig());
      if (!pcs.current.has(id)) return pc.close(); // peer left while we waited
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
      if (!info?.candidateId) return;
      setPeers((p) => {
        const next = { ...p };
        // A reconnecting candidate replaces their stale tile.
        Object.values(next).forEach((old) => {
          if (old.info.candidateId === info.candidateId && old.id !== id) {
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
        };
        return next;
      });
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
          entry?.queue(() => entry.pc?.setRemoteDescription(payload.sdp));
          break;
        case 'ice':
          entry?.queue(() => entry.pc?.addIceCandidate(payload.candidate));
          break;
        case 'phase':
          patchPeer(from, { phase: payload.phase });
          if (peer && payload.phase !== peer.phase) {
            const text = { 'in-exam': 'started the exam', submitted: 'submitted the exam', terminated: 'had their exam ended' }[payload.phase];
            if (text) pushEvent({ peerId: from, name: peer.info.name, type: 'Normal', text });
          }
          break;
        case 'progress':
          patchPeer(from, { progress: payload.progress });
          break;
        case 'event':
          if (!peer) break;
          if (payload.type === 'Warning') patchPeer(from, (p) => ({ warnings: p.warnings + 1 }));
          pushEvent({ peerId: from, name: peer.info.name, type: payload.type, text: payload.event });
          if (payload.autoFlagged) pushEvent({ peerId: from, name: peer.info.name, type: 'Warning', text: 'was auto-flagged for reaching the warning limit' });
          break;
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
    loadRecordings();
    const sig = new SignalingClient({
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
            pushEvent({ peerId: msg.id, name: peer.info.name, type: 'Normal', text: 'disconnected' });
          }
        } else if (msg.type === 'relay') onRelay(msg.from, msg.payload);
        else if (msg.type === 'data-changed') {
          storeRef.current.refreshSoon(msg.collections || []);
          if (msg.collections?.includes('recordings')) loadRecordings();
        }
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
    if (!sigRef.current?.relay(id, { kind: 'command', action, text })) {
      storeRef.current.reportError('Not connected to the proctoring server. Try again in a moment.');
      return false;
    }
    return true;
  }, []);

  const sendMessage = useCallback(
    (id, text) => {
      const peer = peersRef.current[id];
      if (command(id, 'message', text) && peer) pushEvent({ peerId: id, name: peer.info.name, type: 'Normal', text: `was sent a message: “${text}”` });
    },
    [command, pushEvent]
  );

  const warn = useCallback(
    (id, text) => {
      const peer = peersRef.current[id];
      if (command(id, 'warn', text) && peer) {
        patchPeer(id, (p) => ({ warnings: p.warnings + 1 }));
        pushEvent({ peerId: id, name: peer.info.name, type: 'Warning', text: `was warned: “${text}”` });
      }
    },
    [command, patchPeer, pushEvent]
  );

  const flag = useCallback(
    async (id, reason) => {
      const peer = peersRef.current[id];
      if (!peer) return;
      try {
        await storeRef.current.flagCandidate(peer.info.candidateId, reason, peer.info.examId);
        pushEvent({ peerId: id, name: peer.info.name, type: 'Warning', text: `was flagged for cheating${reason ? `: ${reason}` : ''}` });
      } catch {
        /* error already shown */
      }
    },
    [pushEvent]
  );

  const terminate = useCallback(
    (id, reason) => {
      const peer = peersRef.current[id];
      if (command(id, 'terminate', reason) && peer) {
        patchPeer(id, { phase: 'terminated' });
        pushEvent({ peerId: id, name: peer.info.name, type: 'Warning', text: 'had their exam terminated' });
      }
    },
    [command, patchPeer, pushEvent]
  );

  // ---------------------------------------------------------------- recording
  const upload = useCallback(
    async (item) => {
      setUploads((u) => [...u.filter((x) => x.id !== item.id), { ...item, state: 'uploading' }]);
      const mime = item.blob.type.split(';')[0] || 'video/webm';
      const q = new URLSearchParams({ candidateId: item.candidateId, examId: item.examId || '', duration: String(item.duration) });
      try {
        await api(`/recordings?${q}`, { method: 'POST', body: item.blob, raw: true, headers: { 'Content-Type': mime } });
        setUploads((u) => u.filter((x) => x.id !== item.id));
        URL.revokeObjectURL(item.url);
        loadRecordings();
      } catch (err) {
        setUploads((u) => u.map((x) => (x.id === item.id ? { ...x, state: 'failed', error: err.message } : x)));
      }
    },
    [loadRecordings]
  );

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
      const rec = { recorder, chunks: [], startedAt: Date.now(), name: peer.info.name, candidateId: peer.info.candidateId, examId: peer.info.examId };
      recorder.ondataavailable = (e) => e.data.size && rec.chunks.push(e.data);
      recorder.onstop = () => {
        recorders.current.delete(id);
        setRecordingIds((ids) => ids.filter((x) => x !== id));
        if (!rec.chunks.length) return;
        const blob = new Blob(rec.chunks, { type: recorder.mimeType || 'video/webm' });
        upload({
          id: `${id}-${rec.startedAt}`,
          name: rec.name,
          candidateId: rec.candidateId,
          examId: rec.examId,
          blob,
          url: URL.createObjectURL(blob),
          size: blob.size,
          duration: Math.round((Date.now() - rec.startedAt) / 1000),
          at: new Date(rec.startedAt).toISOString(),
        });
      };
      recorder.start(1000);
      recorders.current.set(id, rec);
      setRecordingIds((ids) => [...ids, id]);
      return true;
    },
    [upload]
  );

  const deleteRecording = useCallback(
    async (recId) => {
      try {
        await api(`/recordings/${recId}`, { method: 'DELETE' });
        loadRecordings();
      } catch (err) {
        storeRef.current.reportError(err.message);
      }
    },
    [loadRecordings]
  );

  const discardUpload = useCallback((uploadId) => {
    setUploads((u) => {
      const it = u.find((x) => x.id === uploadId);
      if (it) URL.revokeObjectURL(it.url);
      return u.filter((x) => x.id !== uploadId);
    });
  }, []);

  const dismissPeer = useCallback(
    (id) => {
      closePeer(id);
      setPeers((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    },
    [closePeer]
  );

  const value = useMemo(
    () => ({
      status,
      peers: Object.values(peers).sort((a, b) => a.joinedAt.localeCompare(b.joinedAt)),
      events,
      recordings,
      uploads,
      recordingIds,
      sendMessage,
      warn,
      flag,
      terminate,
      startRecording,
      stopRecording,
      deleteRecording,
      retryUpload: upload,
      discardUpload,
      dismissPeer,
      clearEvents: () => setEvents([]),
    }),
    [status, peers, events, recordings, uploads, recordingIds, sendMessage, warn, flag, terminate, startRecording, stopRecording, deleteRecording, upload, discardUpload, dismissPeer]
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive() {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error('useLive must be used inside LiveProvider');
  return ctx;
}
