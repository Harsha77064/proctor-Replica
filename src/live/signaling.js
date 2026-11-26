// Browser-side client for the Oversee signaling server (server/signaling.js).

// Fallback when the server cannot be asked (STUN only).
export const ICE_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

let iceCache = null;
/** ICE servers from the server: STUN plus short-lived TURN credentials when configured. */
export async function getIceConfig() {
  if (iceCache && iceCache.expires > Date.now()) return iceCache.config;
  try {
    const res = await fetch('/api/ice', { credentials: 'same-origin' });
    if (!res.ok) throw new Error(String(res.status));
    const { iceServers } = await res.json();
    iceCache = { config: { iceServers }, expires: Date.now() + 30 * 60000 };
    return iceCache.config;
  } catch {
    return ICE_CONFIG;
  }
}

export function signalingUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/signal`;
}

/**
 * Small reconnecting WebSocket wrapper. The server identifies the user from
 * their session cookie, so there is nothing to announce on connect.
 * handlers: { onMessage(msg), onStatus('connecting' | 'online' | 'offline'), onDisconnect() }
 */
export class SignalingClient {
  constructor(handlers) {
    this.handlers = handlers;
    this.id = null;
    this.closed = false;
    this.retry = 0;
    this.connect();
  }

  connect() {
    if (this.closed) return;
    this.handlers.onStatus?.('connecting');
    let ws;
    try {
      ws = new WebSocket(signalingUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
    };
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === 'welcome') {
        this.id = msg.id;
        this.handlers.onStatus?.('online');
      }
      this.handlers.onMessage?.(msg);
    };
    ws.onclose = (e) => {
      this.id = null;
      if (this.closed) return;
      // 4001/4003: the server ended this session on purpose; do not reconnect.
      if (e.code === 4001 || e.code === 4003) {
        this.handlers.onStatus?.('offline');
        this.handlers.onDisconnect?.();
        return;
      }
      this.handlers.onStatus?.('offline');
      this.handlers.onDisconnect?.();
      this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  scheduleReconnect() {
    const delay = Math.min(10000, 1000 * 2 ** this.retry++);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), delay);
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  relay(to, payload) {
    return this.send({ type: 'relay', to, payload });
  }

  toAdmins(payload) {
    return this.send({ type: 'to-admins', payload });
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    this.ws?.close();
  }
}

/** Serialises async work per peer connection so ICE candidates never race the SDP. */
export function makeQueue() {
  let chain = Promise.resolve();
  return (fn) => {
    chain = chain.then(fn).catch((err) => console.warn('[webrtc]', err));
    return chain;
  };
}

export function pickRecorderMime() {
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
}
