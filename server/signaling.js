// Oversee signaling server.
//
// Browsers exchange WebRTC connection details (offers, answers, ICE candidates)
// and proctoring messages through this WebSocket relay. The camera video itself
// flows directly between the candidate's and the admin's browsers; it never
// passes through this server.
//
// Protocol (JSON messages):
//   client -> server  { type: 'hello', role: 'admin' | 'candidate', info }
//   server -> client  { type: 'welcome', id }
//   server -> admin   { type: 'peers', peers: [{ id, info }] }      (on admin hello)
//   server -> admins  { type: 'peer-joined', id, info } / { type: 'peer-left', id }
//   server -> cands   { type: 'admin-left', id }
//   client -> server  { type: 'relay', to, payload }                (point to point)
//   client -> server  { type: 'to-admins', payload }                (candidate -> every admin)
//   server -> client  { type: 'relay', from, payload }
import { WebSocketServer } from 'ws';

const PATH = '/signal';
const MAX_MESSAGE_BYTES = 256 * 1024;

export function attachSignaling(httpServer, log = console) {
  if (!httpServer) return;
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const clients = new Map(); // id -> { ws, role, info }
  let seq = 0;

  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url || !req.url.startsWith(PATH)) return; // leave other upgrades (e.g. Vite HMR) alone
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });

  const send = (ws, msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
  const admins = () => [...clients.entries()].filter(([, c]) => c.role === 'admin');
  const candidates = () => [...clients.entries()].filter(([, c]) => c.role === 'candidate');

  wss.on('connection', (ws) => {
    const id = `p${++seq}`;
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const me = clients.get(id);

      if (msg.type === 'hello' && !me) {
        const role = msg.role === 'admin' ? 'admin' : 'candidate';
        const info = typeof msg.info === 'object' && msg.info ? msg.info : {};
        clients.set(id, { ws, role, info });
        send(ws, { type: 'welcome', id });
        if (role === 'admin') {
          send(ws, { type: 'peers', peers: candidates().map(([pid, c]) => ({ id: pid, info: c.info })) });
        } else {
          admins().forEach(([, a]) => send(a.ws, { type: 'peer-joined', id, info }));
        }
        log.info?.(`[signaling] ${role} joined (${id})`);
        return;
      }
      if (!me) return;

      if (msg.type === 'relay' && typeof msg.to === 'string') {
        const target = clients.get(msg.to);
        if (target) send(target.ws, { type: 'relay', from: id, payload: msg.payload });
      } else if (msg.type === 'to-admins' && me.role === 'candidate') {
        admins().forEach(([, a]) => send(a.ws, { type: 'relay', from: id, payload: msg.payload }));
      } else if (msg.type === 'update-info' && me.role === 'candidate') {
        me.info = { ...me.info, ...(msg.info || {}) };
      }
    });

    ws.on('close', () => {
      const me = clients.get(id);
      clients.delete(id);
      if (!me) return;
      if (me.role === 'candidate') admins().forEach(([, a]) => send(a.ws, { type: 'peer-left', id }));
      else candidates().forEach(([, c]) => send(c.ws, { type: 'admin-left', id }));
      log.info?.(`[signaling] ${me.role} left (${id})`);
    });
  });

  // Drop dead connections so admins see candidates disconnect promptly.
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 15000);
  wss.on('close', () => clearInterval(heartbeat));
  httpServer.on('close', () => wss.close());
}

/** Vite plugin: serves the signaling endpoint from `vite` dev and `vite preview`. */
export function signalingPlugin() {
  return {
    name: 'oversee-signaling',
    configureServer(server) {
      attachSignaling(server.httpServer, server.config.logger);
    },
    configurePreviewServer(server) {
      attachSignaling(server.httpServer, server.config.logger);
    },
  };
}
