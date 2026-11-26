// Oversee signaling server.
//
// Browsers exchange WebRTC connection details (offers, answers, ICE candidates)
// and proctoring messages through this authenticated WebSocket relay. Camera
// video flows directly between browsers (or through TURN); never through here.
//
// Identity comes only from session cookies: staff (admin/proctor) or a
// candidate's invite session. Candidate details are read from the database,
// never trusted from the browser.
//
//   client -> server  { type: 'relay', to, payload }       staff <-> candidate only
//   client -> server  { type: 'to-admins', payload }       candidate -> every staff member
//   server -> client  { type: 'welcome', id } / { type: 'peers', peers } / { type: 'peer-joined' | 'peer-left', ... }
//   server -> staff   { type: 'data-changed', collections } after API writes
import { WebSocketServer } from 'ws';
import { parseCookieHeader, staffFromCookies, candidateFromCookies } from './auth.js';
import { recordProctorEvent, finishAttempt, getAttemptByInvite, touchCandidate } from './services.js';
import { audit } from './db.js';

const PATH = '/signal';
const MAX_MESSAGE_BYTES = 128 * 1024;
const clients = new Map(); // id -> { ws, role: 'staff' | 'candidate', user?, ctx?, info }
let seq = 0;

const send = (ws, msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
const staff = () => [...clients.entries()].filter(([, c]) => c.role === 'staff');
const candidates = () => [...clients.entries()].filter(([, c]) => c.role === 'candidate');

export const isCandidateOnline = (candidateId) => candidates().some(([, c]) => c.ctx.candidate_id === candidateId);

export function notifyStaff(collections) {
  staff().forEach(([, c]) => send(c.ws, { type: 'data-changed', collections }));
}

export function disconnectInvite(inviteId, reason = 'Your exam session has ended.') {
  candidates().forEach(([, c]) => {
    if (c.ctx.invite_id === inviteId) {
      send(c.ws, { type: 'relay', from: 'server', payload: { kind: 'command', action: 'terminate', text: reason } });
      setTimeout(() => c.ws.close(4001, 'ended'), 200);
    }
  });
}

function candidateInfo(ctx) {
  const attempt = getAttemptByInvite(ctx.invite_id);
  return {
    candidateId: ctx.candidate_id,
    name: ctx.name,
    department: ctx.department,
    examId: ctx.exam_id,
    examTitle: ctx.exam_title,
    phase: !attempt ? 'system-check' : attempt.status === 'InProgress' ? 'in-exam' : attempt.status === 'Submitted' ? 'submitted' : 'terminated',
  };
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients cannot carry the user's cookies
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function attachSignaling(httpServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url || !req.url.startsWith(PATH)) return; // leave other upgrades (e.g. Vite HMR) alone
    const cookies = parseCookieHeader(req.headers.cookie);
    const user = staffFromCookies(cookies);
    const ctx = user ? null : candidateFromCookies(cookies);
    if (!sameOrigin(req) || (!user && !ctx)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, user, ctx));
  });

  wss.on('connection', (ws, req, user, ctx) => {
    const id = `p${++seq}`;
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));

    // Basic flood protection: 300 messages per 10 seconds.
    let budget = 300;
    const refill = setInterval(() => (budget = 300), 10000);

    if (user) {
      clients.set(id, { ws, role: 'staff', user, info: { name: user.name, role: user.role } });
      send(ws, { type: 'welcome', id, role: 'staff' });
      send(ws, { type: 'peers', peers: candidates().map(([pid, c]) => ({ id: pid, info: c.info })) });
    } else {
      const info = candidateInfo(ctx);
      clients.set(id, { ws, role: 'candidate', ctx, info, ip });
      touchCandidate(ctx.candidate_id);
      audit({ candidateId: ctx.candidate_id, type: 'Normal', event: 'Joined live proctoring session', examId: ctx.exam_id, ip });
      send(ws, { type: 'welcome', id, role: 'candidate' });
      staff().forEach(([, s]) => send(s.ws, { type: 'peer-joined', id, info }));
      notifyStaff(['candidates', 'auditLogs']);
    }

    ws.on('message', (raw) => {
      if (--budget < 0) return;
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const me = clients.get(id);
      if (!me || !msg || typeof msg !== 'object') return;

      if (me.role === 'candidate') handleCandidate(id, me, msg);
      else handleStaff(id, me, msg);
    });

    ws.on('close', () => {
      clearInterval(refill);
      const me = clients.get(id);
      clients.delete(id);
      if (!me) return;
      if (me.role === 'candidate') {
        staff().forEach(([, s]) => send(s.ws, { type: 'peer-left', id }));
        const attempt = getAttemptByInvite(me.ctx.invite_id);
        audit({
          candidateId: me.ctx.candidate_id,
          type: 'Normal',
          event: attempt?.status === 'InProgress' ? 'Disconnected from the live session during the exam' : 'Left the live session',
          examId: me.ctx.exam_id,
          ip: me.ip,
        });
        touchCandidate(me.ctx.candidate_id);
        notifyStaff(['candidates', 'auditLogs']);
      } else {
        candidates().forEach(([, c]) => send(c.ws, { type: 'admin-left', id }));
      }
    });
  });

  function handleCandidate(id, me, msg) {
    if (msg.type === 'relay' && typeof msg.to === 'string') {
      const target = clients.get(msg.to);
      // Candidates may only answer staff (WebRTC answers and ICE candidates).
      if (target?.role === 'staff' && ['answer', 'ice'].includes(msg.payload?.kind)) {
        send(target.ws, { type: 'relay', from: id, payload: msg.payload });
      }
      return;
    }
    if (msg.type !== 'to-admins') return;
    const p = msg.payload || {};
    if (p.kind === 'event') {
      const type = ['Normal', 'Warning', 'Validation'].includes(p.type) ? p.type : 'Normal';
      const event = String(p.event || '').slice(0, 160);
      if (!event) return;
      const { autoFlagged } = recordProctorEvent({ candidateId: me.ctx.candidate_id, examId: me.ctx.exam_id, type, event, ip: me.ip });
      staff().forEach(([, s]) => send(s.ws, { type: 'relay', from: id, payload: { kind: 'event', type, event, autoFlagged } }));
      notifyStaff(['candidates', 'auditLogs']);
    } else if (p.kind === 'progress' && p.progress && typeof p.progress === 'object') {
      const pr = p.progress;
      const progress = { answered: +pr.answered || 0, total: +pr.total || 0, current: +pr.current || 0, secondsLeft: +pr.secondsLeft || 0 };
      staff().forEach(([, s]) => send(s.ws, { type: 'relay', from: id, payload: { kind: 'progress', progress } }));
    } else if (p.kind === 'phase') {
      // Phase is re-derived from the database so a candidate cannot fake "submitted".
      me.info = candidateInfo(me.ctx);
      staff().forEach(([, s]) => send(s.ws, { type: 'relay', from: id, payload: { kind: 'phase', phase: me.info.phase } }));
      if (me.info.phase !== 'system-check') notifyStaff(['results', 'auditLogs', 'candidates']);
    }
  }

  function handleStaff(id, me, msg) {
    if (msg.type !== 'relay' || typeof msg.to !== 'string') return;
    const target = clients.get(msg.to);
    if (!target || target.role !== 'candidate') return;
    const p = msg.payload || {};
    const actor = me.user.name;
    const { candidate_id: candidateId, exam_id: examId, invite_id: inviteId } = target.ctx;

    if (p.kind === 'offer' || p.kind === 'ice') {
      send(target.ws, { type: 'relay', from: id, payload: p });
      return;
    }
    if (p.kind !== 'command') return;
    const text = String(p.text || '').slice(0, 300);
    if (p.action === 'message') {
      audit({ candidateId, type: 'Normal', event: `Proctor message: ${text}`, examId, actor });
    } else if (p.action === 'warn') {
      recordProctorEvent({ candidateId, examId, type: 'Warning', event: `Proctor warning: ${text}`, actor });
    } else if (p.action === 'terminate') {
      const attempt = getAttemptByInvite(inviteId);
      if (!attempt || attempt.status !== 'InProgress') return;
      finishAttempt(attempt.id, { status: 'Terminated', reason: text, actor });
      target.info = candidateInfo(target.ctx);
    } else return;
    send(target.ws, { type: 'relay', from: id, payload: { kind: 'command', action: p.action, text } });
    notifyStaff(['candidates', 'auditLogs', 'results']);
  }

  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 15000);
  wss.on('close', () => clearInterval(heartbeat));
  httpServer.on('close', () => wss.close());
  return wss;
}

// Session revocation: kick staff whose account was deactivated.
export function disconnectUser(userId) {
  staff().forEach(([, c]) => c.user.id === userId && c.ws.close(4003, 'signed out'));
}

