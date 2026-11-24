// Browser-side client for the Oversee signaling server (server/signaling.js).

export const ICE_CONFIG = {
  // STUN lets browsers on different networks find a direct route to each other.
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export function signalingUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/signal`;
}

/**
 * Small reconnecting WebSocket wrapper.
 * handlers: { onMessage(msg), onStatus('connecting' | 'online' | 'offline') }
 */
export class SignalingClient {
  constructor(role, info, handlers) {
    this.role = role;
    this.info = info;
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
      ws.send(JSON.stringify({ type: 'hello', role: this.role, info: this.info }));
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
    ws.onclose = () => {
      this.id = null;
      if (this.closed) return;
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

  updateInfo(info) {
    this.info = { ...this.info, ...info };
    this.send({ type: 'update-info', info });
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
