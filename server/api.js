// HTTP API. Staff routes need an admin/proctor session; candidate routes need an
// invite session. Every write is validated here, never trusted from the browser.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import {
  db, now, tx, newId, audit, sha256, randomToken, getSettings, saveSettings, DEFAULT_SETTINGS,
} from './db.js';
import {
  hashPassword, verifyPassword, passwordProblem, createSession, destroySession, revokeSessions,
  requireStaff, requireCandidate, staffFromCookies, candidateFromCookies,
} from './auth.js';
import {
  listCandidates, listBanks, listExams, listResults, listFeedback, listAudit, listRecordings,
  flagCandidate, startAttempt, attemptQuestions, finishAttempt, getAttemptByInvite, finishAttemptsForExam,
  touchCandidate,
} from './services.js';
import { isCandidateOnline, notifyStaff, disconnectInvite, disconnectUser } from './signaling.js';
import { emailEnabled, sendInviteEmail } from './mailer.js';
import { iceServers } from './ice.js';
import { seedDemo } from './seed.js';

export const api = express.Router();
api.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------- helpers
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);
const notFound = (what) => new HttpError(404, `${what} not found.`);

function str(v, label, { max = 200, required = true } = {}) {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  if (required && !s) throw bad(`${label} is required.`);
  if (s.length > max) throw bad(`${label} must be at most ${max} characters.`);
  return s;
}
function int(v, label, min, max) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${label} must be a whole number from ${min} to ${max}.`);
  return n;
}
function email(v, label = 'Email') {
  const s = str(v, label, { max: 254 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw bad(`${label} is not a valid email address.`);
  return s.toLowerCase();
}
function oneOf(v, label, options) {
  if (!options.includes(v)) throw bad(`${label} must be one of: ${options.join(', ')}.`);
  return v;
}
function isoDate(v, label) {
  const d = new Date(v);
  if (!v || Number.isNaN(d.getTime())) throw bad(`${label} is not a valid date and time.`);
  return d.toISOString();
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const ipOf = (req) => req.ip;
const baseUrl = (req) => config.publicUrl || `${req.protocol}://${req.get('host')}`;

const limiter = (max, minutes) =>
  rateLimit({
    windowMs: minutes * 60000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Wait a few minutes and try again.' },
  });

function dataPayload(only, user) {
  const want = (k) => !only || only.includes(k);
  const out = {};
  if (want('candidates')) out.candidates = listCandidates(isCandidateOnline);
  if (want('questionBanks')) out.questionBanks = listBanks({ includeAnswers: user.role === 'admin' });
  if (want('exams')) out.exams = listExams();
  if (want('results')) out.results = listResults();
  if (want('feedback')) out.feedback = listFeedback();
  if (want('auditLogs')) out.auditLogs = listAudit(1000);
  if (want('settings')) out.settings = getSettings();
  return out;
}

const changed = (...collections) => notifyStaff(collections);

// ---------------------------------------------------------------- health / setup
api.get('/health', (req, res) => res.json({ ok: true, time: now() }));

const userCount = () => db.prepare('SELECT COUNT(*) AS n FROM users').get().n;

api.get('/setup/status', (req, res) => res.json({ needsSetup: userCount() === 0, emailEnabled: emailEnabled() }));

api.post('/setup', limiter(10, 60), wrap(async (req, res) => {
  if (userCount() > 0) throw new HttpError(409, 'Setup is already complete. Sign in instead.');
  const name = str(req.body.name, 'Your name', { max: 100 });
  const mail = email(req.body.email);
  const problem = passwordProblem(req.body.password);
  if (problem) throw bad(`Password: ${problem}`);
  const orgName = str(req.body.orgName, 'Organization name', { max: 120 });
  const hash = await hashPassword(req.body.password);
  const id = tx(() => {
    if (userCount() > 0) throw new HttpError(409, 'Setup is already complete.');
    const uid = newId('USR');
    db.prepare('INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uid, name, mail, hash, 'admin', now());
    if (req.body.loadDemo) seedDemo();
    const org = getSettings().organization;
    saveSettings('organization', { ...org, name: orgName, supportEmail: org.supportEmail || mail });
    return uid;
  });
  const expires = new Date(Date.now() + config.staffSessionHours * 3600000);
  createSession(res, 'staff', id, expires);
  res.json({ user: { id, name, email: mail, role: 'admin' } });
}));

// ---------------------------------------------------------------- staff auth
api.post('/auth/login', limiter(10, 15), wrap(async (req, res) => {
  const mail = str(req.body.email, 'Email', { max: 254 }).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(mail);
  // Always run the hash so response time does not reveal which emails exist.
  const ok = await verifyPassword(password, u?.password_hash || 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==');
  if (!u || !ok || !u.active) throw new HttpError(401, 'Email or password is incorrect.');
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), u.id);
  createSession(res, 'staff', u.id, new Date(Date.now() + config.staffSessionHours * 3600000));
  res.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role } });
}));

api.post('/auth/logout', (req, res) => {
  destroySession(req, res, 'staff');
  res.json({ ok: true });
});

api.get('/auth/me', (req, res) => {
  const user = staffFromCookies(req.cookies);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, emailEnabled: emailEnabled() });
});

api.post('/auth/password', requireStaff(), wrap(async (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!(await verifyPassword(String(req.body.currentPassword || ''), u.password_hash))) throw bad('Current password is incorrect.');
  const problem = passwordProblem(req.body.newPassword);
  if (problem) throw bad(`New password: ${problem}`);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(req.body.newPassword), u.id);
  revokeSessions('staff', u.id);
  createSession(res, 'staff', u.id, new Date(Date.now() + config.staffSessionHours * 3600000));
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- data
const anyStaff = requireStaff('admin', 'proctor');
const adminOnly = requireStaff('admin');

api.get('/data', anyStaff, (req, res) => {
  const only = typeof req.query.only === 'string' && req.query.only ? req.query.only.split(',') : null;
  res.json(dataPayload(only, req.user));
});

// Candidates
const DEPARTMENT_MAX = 60;
api.post('/candidates', adminOnly, (req, res) => {
  const name = str(req.body.name, 'Name', { max: 100 });
  const mail = email(req.body.email);
  const department = str(req.body.department, 'Department', { max: DEPARTMENT_MAX, required: false });
  if (db.prepare('SELECT 1 FROM candidates WHERE email = ?').get(mail)) throw bad('A candidate with this email already exists.');
  const id = tx(() => {
    const cid = newId('CND');
    db.prepare('INSERT INTO candidates (id, name, email, department, created_at) VALUES (?, ?, ?, ?, ?)').run(cid, name, mail, department, now());
    audit({ candidateId: cid, event: 'Candidate registered by organization', actor: req.user.name, ip: ipOf(req) });
    return cid;
  });
  changed('candidates', 'auditLogs');
  res.status(201).json({ id });
});

api.patch('/candidates/:id', adminOnly, (req, res) => {
  const c = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id);
  if (!c) throw notFound('Candidate');
  const next = {
    name: req.body.name !== undefined ? str(req.body.name, 'Name', { max: 100 }) : c.name,
    email: req.body.email !== undefined ? email(req.body.email) : c.email,
    department: req.body.department !== undefined ? str(req.body.department, 'Department', { max: DEPARTMENT_MAX, required: false }) : c.department,
    status: req.body.status !== undefined ? oneOf(req.body.status, 'Status', ['Active', 'Inactive']) : c.status,
  };
  tx(() => {
    db.prepare('UPDATE candidates SET name = ?, email = ?, department = ?, status = ? WHERE id = ?').run(next.name, next.email, next.department, next.status, c.id);
    if (next.status !== c.status) audit({ candidateId: c.id, event: `Status changed to ${next.status} by organization`, actor: req.user.name, ip: ipOf(req) });
  });
  if (next.status === 'Inactive') {
    revokeSessionsForCandidate(c.id);
  }
  changed('candidates', 'auditLogs');
  res.json({ ok: true });
});

function revokeSessionsForCandidate(candidateId) {
  for (const inv of db.prepare('SELECT id FROM invites WHERE candidate_id = ?').all(candidateId)) {
    revokeSessions('candidate', inv.id);
    disconnectInvite(inv.id, 'Your account was deactivated by the organization.');
  }
}

api.post('/candidates/:id/assign', adminOnly, (req, res) => {
  const c = db.prepare('SELECT id FROM candidates WHERE id = ?').get(req.params.id);
  const e = db.prepare('SELECT id, title FROM exams WHERE id = ?').get(String(req.body.examId || ''));
  if (!c) throw notFound('Candidate');
  if (!e) throw notFound('Exam');
  tx(() => {
    db.prepare('INSERT OR IGNORE INTO exam_candidates (exam_id, candidate_id) VALUES (?, ?)').run(e.id, c.id);
    audit({ candidateId: c.id, event: `Assigned exam "${e.title}"`, examId: e.id, actor: req.user.name, ip: ipOf(req) });
  });
  changed('candidates', 'exams', 'auditLogs');
  res.json({ ok: true });
});

api.post('/candidates/:id/flag', anyStaff, (req, res) => {
  const c = db.prepare('SELECT id FROM candidates WHERE id = ?').get(req.params.id);
  if (!c) throw notFound('Candidate');
  const examId = req.body.examId ? String(req.body.examId) : null;
  flagCandidate({ candidateId: c.id, examId, reason: str(req.body.reason, 'Reason', { max: 300, required: false }), actor: req.user.name });
  changed('candidates', 'auditLogs');
  res.json({ ok: true });
});

// Question banks
api.post('/banks', adminOnly, (req, res) => {
  const name = str(req.body.name, 'Bank name', { max: 120 });
  const topic = str(req.body.topic, 'Topic', { max: 60 });
  const description = str(req.body.description, 'Description', { max: 500, required: false });
  const id = newId('QB');
  db.prepare('INSERT INTO question_banks (id, name, topic, description, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, topic, description, now());
  changed('questionBanks');
  res.status(201).json({ id });
});

api.delete('/banks/:id', adminOnly, (req, res) => {
  const r = db.prepare('DELETE FROM question_banks WHERE id = ?').run(req.params.id);
  if (!r.changes) throw notFound('Question bank');
  changed('questionBanks', 'exams');
  res.json({ ok: true });
});

api.post('/banks/:id/questions', adminOnly, (req, res) => {
  const bank = db.prepare('SELECT id FROM question_banks WHERE id = ?').get(req.params.id);
  if (!bank) throw notFound('Question bank');
  const text = str(req.body.text, 'Question', { max: 1000 });
  if (!Array.isArray(req.body.options) || req.body.options.length < 2 || req.body.options.length > 8) throw bad('Give between 2 and 8 options.');
  const options = req.body.options.map((o, i) => str(o, `Option ${i + 1}`, { max: 300 }));
  const answer = int(req.body.answer, 'Correct answer', 0, options.length - 1);
  const difficulty = oneOf(req.body.difficulty || 'Medium', 'Difficulty', ['Easy', 'Medium', 'Hard']);
  const pos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM questions WHERE bank_id = ?').get(bank.id).p;
  const id = newId('Q');
  db.prepare('INSERT INTO questions (id, bank_id, text, options, answer, difficulty, position) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, bank.id, text, JSON.stringify(options), answer, difficulty, pos);
  changed('questionBanks');
  res.status(201).json({ id });
});

api.delete('/banks/:id/questions/:qid', adminOnly, (req, res) => {
  const r = db.prepare('DELETE FROM questions WHERE id = ? AND bank_id = ?').run(req.params.qid, req.params.id);
  if (!r.changes) throw notFound('Question');
  changed('questionBanks');
  res.json({ ok: true });
});

// Exams
api.post('/exams', adminOnly, (req, res) => {
  const title = str(req.body.title, 'Exam title', { max: 150 });
  const bankId = str(req.body.bankId, 'Question bank');
  if (!db.prepare('SELECT 1 FROM question_banks WHERE id = ?').get(bankId)) throw notFound('Question bank');
  const startTime = isoDate(req.body.startTime, 'Start time');
  const duration = int(req.body.duration, 'Duration', 5, 600);
  const passMark = int(req.body.passMark, 'Pass mark', 1, 100);
  const id = newId('EX');
  db.prepare('INSERT INTO exams (id, title, bank_id, start_time, duration, pass_mark, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, title, bankId, startTime, duration, passMark, now());
  changed('exams');
  res.status(201).json({ id });
});

api.patch('/exams/:id', adminOnly, (req, res) => {
  const e = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!e) throw notFound('Exam');
  const status = oneOf(req.body.status, 'Status', ['Scheduled', 'Live', 'Completed']);
  db.prepare('UPDATE exams SET status = ?, start_time = CASE WHEN ? = \'Live\' AND status = \'Scheduled\' THEN ? ELSE start_time END WHERE id = ?')
    .run(status, status, now(), e.id);
  if (status === 'Completed') {
    const open = db.prepare("SELECT invite_id FROM attempts WHERE exam_id = ? AND status = 'InProgress'").all(e.id);
    finishAttemptsForExam(e.id);
    open.forEach((a) => disconnectInvite(a.invite_id, 'The exam has ended. Your answers were submitted.'));
  }
  audit({ type: 'Normal', event: `Exam "${e.title}" set to ${status}`, examId: e.id, actor: req.user.name, ip: ipOf(req) });
  changed('exams', 'results', 'auditLogs');
  res.json({ ok: true });
});

api.delete('/exams/:id', adminOnly, (req, res) => {
  const invites = db.prepare('SELECT id FROM invites WHERE exam_id = ?').all(req.params.id);
  const r = db.prepare('DELETE FROM exams WHERE id = ?').run(req.params.id);
  if (!r.changes) throw notFound('Exam');
  invites.forEach((i) => {
    revokeSessions('candidate', i.id);
    disconnectInvite(i.id, 'This exam was cancelled.');
  });
  changed('exams', 'candidates', 'results');
  res.json({ ok: true });
});

// ---------------------------------------------------------------- invites
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

api.get('/exams/:id/invites', adminOnly, (req, res) => {
  const e = db.prepare('SELECT id FROM exams WHERE id = ?').get(req.params.id);
  if (!e) throw notFound('Exam');
  const latest = db.prepare(`
    SELECT i.* FROM invites i
    WHERE i.exam_id = ? AND i.created_at = (SELECT MAX(created_at) FROM invites WHERE exam_id = i.exam_id AND candidate_id = i.candidate_id)`).all(e.id);
  const byCand = Object.fromEntries(latest.map((i) => [i.candidate_id, i]));
  const rows = db.prepare('SELECT c.id, c.name, c.email FROM exam_candidates ec JOIN candidates c ON c.id = ec.candidate_id WHERE ec.exam_id = ? ORDER BY c.name').all(e.id);
  res.json({
    emailEnabled: emailEnabled(),
    invites: rows.map((c) => {
      const inv = byCand[c.id];
      const expired = inv && inv.expires_at < now() && ['Pending', 'Started'].includes(inv.status);
      return {
        candidateId: c.id,
        name: c.name,
        email: c.email,
        inviteId: inv?.id || null,
        status: inv ? (expired ? 'Expired' : inv.status) : 'Not invited',
        createdAt: inv?.created_at || null,
        emailedAt: inv?.emailed_at || null,
      };
    }),
  });
});

// Creates fresh invites (new link + code) for the chosen assigned candidates. Old links stop working.
api.post('/exams/:id/invites', adminOnly, wrap(async (req, res) => {
  const e = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!e) throw notFound('Exam');
  const assigned = new Set(db.prepare('SELECT candidate_id FROM exam_candidates WHERE exam_id = ?').all(e.id).map((r) => r.candidate_id));
  const ids = Array.isArray(req.body.candidateIds) && req.body.candidateIds.length ? req.body.candidateIds.map(String) : [...assigned];
  if (!ids.length) throw bad('Assign candidates to this exam first.');
  const bad_ = ids.filter((id) => !assigned.has(id));
  if (bad_.length) throw bad(`Not assigned to this exam: ${bad_.join(', ')}`);
  const doEmail = !!req.body.sendEmail;
  if (doEmail && !emailEnabled()) throw bad('Email is not set up on the server. Copy the links instead, or add SMTP settings.');

  const settings = getSettings();
  const expires = new Date(Date.now() + config.inviteValidDays * 86400000).toISOString();
  const created = tx(() =>
    ids.map((cid) => {
      const c = db.prepare('SELECT id, name, email, status FROM candidates WHERE id = ?').get(cid);
      // Retire older invites that were never finished.
      const old = db.prepare("SELECT id FROM invites WHERE exam_id = ? AND candidate_id = ? AND status IN ('Pending','Locked')").all(e.id, cid);
      old.forEach((o) => {
        db.prepare("UPDATE invites SET status = 'Revoked' WHERE id = ?").run(o.id);
        revokeSessions('candidate', o.id);
      });
      const started = db.prepare("SELECT id FROM invites WHERE exam_id = ? AND candidate_id = ? AND status IN ('Started','Submitted','Terminated')").get(e.id, cid);
      if (started) return { candidateId: cid, name: c.name, email: c.email, skipped: 'Already started this exam' };
      const token = randomToken(24);
      const code = newCode();
      const id = newId('INV');
      db.prepare('INSERT INTO invites (id, exam_id, candidate_id, token_hash, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, e.id, cid, sha256(token), sha256(normCode(code)), now(), expires);
      audit({ candidateId: cid, type: 'Normal', event: 'Exam invitation created', examId: e.id, actor: req.user.name, ip: ipOf(req) });
      return { candidateId: cid, name: c.name, email: c.email, inviteId: id, link: `${baseUrl(req)}/exam?t=${token}`, code };
    })
  );

  if (doEmail) {
    for (const inv of created) {
      if (!inv.link) continue;
      try {
        await sendInviteEmail({
          to: inv.email, name: inv.name, examTitle: e.title, startTime: e.start_time, duration: e.duration,
          link: inv.link, code: inv.code, orgName: settings.organization.name, supportEmail: settings.organization.supportEmail,
        });
        db.prepare('UPDATE invites SET emailed_at = ? WHERE id = ?').run(now(), inv.inviteId);
        inv.emailed = true;
      } catch (err) {
        inv.emailError = 'Email could not be sent.';
        console.error('[mail]', err.message);
      }
    }
  }
  changed('auditLogs');
  res.status(201).json({ invites: created });
}));

api.post('/invites/:id/revoke', adminOnly, (req, res) => {
  const inv = db.prepare('SELECT * FROM invites WHERE id = ?').get(req.params.id);
  if (!inv) throw notFound('Invitation');
  db.prepare("UPDATE invites SET status = 'Revoked' WHERE id = ?").run(inv.id);
  revokeSessions('candidate', inv.id);
  disconnectInvite(inv.id, 'Your invitation was withdrawn by the organization.');
  audit({ candidateId: inv.candidate_id, type: 'Normal', event: 'Exam invitation revoked', examId: inv.exam_id, actor: req.user.name, ip: ipOf(req) });
  changed('auditLogs');
  res.json({ ok: true });
});

// ---------------------------------------------------------------- feedback
api.post('/feedback', anyStaff, (req, res) => {
  const candidateId = str(req.body.candidateId, 'Candidate');
  if (!db.prepare('SELECT 1 FROM candidates WHERE id = ?').get(candidateId)) throw notFound('Candidate');
  const examId = req.body.examId ? str(req.body.examId, 'Exam') : null;
  if (examId && !db.prepare('SELECT 1 FROM exams WHERE id = ?').get(examId)) throw notFound('Exam');
  const rating = int(req.body.rating, 'Rating', 1, 5);
  const message = str(req.body.message, 'Message', { max: 2000 });
  const id = newId('FB');
  tx(() => {
    db.prepare('INSERT INTO feedback (id, candidate_id, exam_id, rating, message, sent_by, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, candidateId, examId, rating, message, req.user.name, now());
    audit({ candidateId, event: 'Feedback sent by organization', examId, actor: req.user.name, ip: ipOf(req) });
  });
  changed('feedback', 'auditLogs');
  res.status(201).json({ id });
});

api.delete('/feedback/:id', adminOnly, (req, res) => {
  if (!db.prepare('DELETE FROM feedback WHERE id = ?').run(req.params.id).changes) throw notFound('Feedback');
  changed('feedback');
  res.json({ ok: true });
});

// ---------------------------------------------------------------- settings
api.put('/settings/:section', adminOnly, (req, res) => {
  const section = oneOf(req.params.section, 'Section', Object.keys(DEFAULT_SETTINGS));
  const current = getSettings()[section];
  const next = { ...current };
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS[section])) {
    if (req.body[key] === undefined) continue;
    const v = req.body[key];
    if (typeof def === 'boolean') next[key] = !!v;
    else if (typeof def === 'number') next[key] = int(v, key, 0, 100000);
    else next[key] = str(v, key, { max: 500, required: false });
  }
  if (section === 'organization') {
    if (!next.name) throw bad('Organization name is required.');
    for (const k of ['companyUrl', 'logoUrl']) {
      if (next[k] && !/^(https:\/\/|data:image\/)/i.test(next[k])) throw bad(`${k === 'logoUrl' ? 'Logo URL' : 'Company URL'} must start with https://`);
    }
    if (next.supportEmail) next.supportEmail = email(next.supportEmail, 'Support email');
  }
  saveSettings(section, next);
  audit({ event: `Settings updated: ${section}`, actor: req.user.name, ip: ipOf(req) });
  changed('settings', 'auditLogs');
  res.json({ settings: getSettings() });
});

// ---------------------------------------------------------------- users
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: !!u.active, createdAt: u.created_at, lastLoginAt: u.last_login_at });

api.get('/users', adminOnly, (req, res) => {
  res.json({ users: db.prepare('SELECT * FROM users ORDER BY created_at').all().map(publicUser) });
});

api.post('/users', adminOnly, wrap(async (req, res) => {
  const name = str(req.body.name, 'Name', { max: 100 });
  const mail = email(req.body.email);
  const role = oneOf(req.body.role, 'Role', ['admin', 'proctor']);
  const problem = passwordProblem(req.body.password);
  if (problem) throw bad(`Temporary password: ${problem}`);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(mail)) throw bad('A user with this email already exists.');
  const id = newId('USR');
  db.prepare('INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name, mail, await hashPassword(req.body.password), role, now());
  audit({ event: `User ${mail} created as ${role}`, actor: req.user.name, ip: ipOf(req) });
  res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
}));

api.patch('/users/:id', adminOnly, wrap(async (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) throw notFound('User');
  const role = req.body.role !== undefined ? oneOf(req.body.role, 'Role', ['admin', 'proctor']) : u.role;
  const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : u.active;
  const losingAdmin = u.role === 'admin' && u.active && (role !== 'admin' || !active);
  if (losingAdmin && db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").get().n <= 1) {
    throw bad('There must be at least one active admin.');
  }
  let hash = u.password_hash;
  if (req.body.password !== undefined) {
    const problem = passwordProblem(req.body.password);
    if (problem) throw bad(`New password: ${problem}`);
    hash = await hashPassword(req.body.password);
  }
  db.prepare('UPDATE users SET role = ?, active = ?, password_hash = ? WHERE id = ?').run(role, active, hash, u.id);
  if (!active || hash !== u.password_hash || role !== u.role) {
    if (u.id !== req.user.id || !active) {
      revokeSessions('staff', u.id);
      disconnectUser(u.id);
    }
  }
  audit({ event: `User ${u.email} updated`, actor: req.user.name, ip: ipOf(req) });
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) });
}));

// ---------------------------------------------------------------- recordings
const recDir = path.join(config.dataDir, 'recordings');

api.get('/recordings', anyStaff, (req, res) => res.json({ recordings: listRecordings() }));

api.post('/recordings', anyStaff, (req, res, next) => {
  const mime = String(req.headers['content-type'] || '').split(';')[0].trim();
  if (!['video/webm', 'video/mp4'].includes(mime)) return next(bad('Recordings must be WebM or MP4 video.'));
  const candidateId = String(req.query.candidateId || '');
  if (!db.prepare('SELECT 1 FROM candidates WHERE id = ?').get(candidateId)) return next(notFound('Candidate'));
  const examId = req.query.examId && db.prepare('SELECT 1 FROM exams WHERE id = ?').get(String(req.query.examId)) ? String(req.query.examId) : null;
  const duration = Math.max(0, Math.min(24 * 3600, Number(req.query.duration) || 0));
  const limit = config.maxRecordingMb * 1024 * 1024;
  const id = newId('REC');
  const fileName = `${id}.${mime === 'video/mp4' ? 'mp4' : 'webm'}`;
  const filePath = path.join(recDir, fileName);
  const out = fs.createWriteStream(filePath, { flags: 'wx' });
  let size = 0;
  let failed = false;
  const fail = (err) => {
    if (failed) return;
    failed = true;
    req.unpipe(out);
    out.destroy();
    fs.rm(filePath, { force: true }, () => {});
    next(err);
  };
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > limit) fail(new HttpError(413, `Recording is larger than ${config.maxRecordingMb} MB.`));
  });
  req.on('aborted', () => fail(bad('Upload was interrupted.')));
  out.on('error', fail);
  out.on('finish', () => {
    if (failed) return;
    if (!size) return fail(bad('Recording is empty.'));
    db.prepare('INSERT INTO recordings (id, candidate_id, exam_id, file_name, mime, size, duration, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, candidateId, examId, fileName, mime, size, duration, req.user.name, now());
    audit({ candidateId, type: 'Validation', event: 'Session recording saved to server', examId, actor: req.user.name, ip: ipOf(req) });
    changed('auditLogs', 'recordings');
    res.status(201).json({ recording: listRecordings().find((r) => r.id === id) });
  });
  req.pipe(out);
});

api.get('/recordings/:id/file', anyStaff, (req, res, next) => {
  const r = db.prepare('SELECT * FROM recordings WHERE id = ?').get(req.params.id);
  if (!r) return next(notFound('Recording'));
  if (req.query.download) res.attachment(`${r.candidate_id}-${r.created_at.slice(0, 19).replace(/[:T]/g, '-')}.${path.extname(r.file_name).slice(1)}`);
  res.sendFile(path.join(recDir, r.file_name), { headers: { 'Content-Type': r.mime, 'Cache-Control': 'private, no-store' } }, (err) => err && next(err.status === 404 ? notFound('Recording file') : err));
});

api.delete('/recordings/:id', adminOnly, (req, res) => {
  const r = db.prepare('SELECT * FROM recordings WHERE id = ?').get(req.params.id);
  if (!r) throw notFound('Recording');
  db.prepare('DELETE FROM recordings WHERE id = ?').run(r.id);
  fs.rm(path.join(recDir, r.file_name), { force: true }, () => {});
  audit({ candidateId: r.candidate_id, event: 'Session recording deleted', examId: r.exam_id, actor: req.user.name, ip: ipOf(req) });
  changed('recordings', 'auditLogs');
  res.json({ ok: true });
});

// ---------------------------------------------------------------- WebRTC config
api.get('/ice', (req, res) => {
  const user = staffFromCookies(req.cookies);
  const cand = user ? null : candidateFromCookies(req.cookies);
  if (!user && !cand) return res.status(401).json({ error: 'Please sign in.' });
  res.json({ iceServers: iceServers(user ? `staff-${user.id}` : `cand-${cand.invite_id}`) });
});

// ---------------------------------------------------------------- candidate portal
function inviteByToken(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  return db.prepare(`
    SELECT i.*, c.name, c.status AS candidate_status, e.title, e.duration, e.status AS exam_status, e.start_time
    FROM invites i JOIN candidates c ON c.id = i.candidate_id JOIN exams e ON e.id = i.exam_id
    WHERE i.token_hash = ?`).get(sha256(token));
}

function inviteProblem(inv) {
  if (!inv) return 'This exam link is not valid. Check that you copied the whole link from your invitation.';
  if (inv.status === 'Revoked') return 'This invitation has been withdrawn. Contact your organization for a new link.';
  if (inv.status === 'Locked') return 'This invitation is locked after too many wrong access codes. Contact your organization for a new link.';
  if (inv.status === 'Submitted') return 'You have already submitted this exam.';
  if (inv.status === 'Terminated') return 'This exam was ended by the proctor.';
  if (inv.expires_at < now()) return 'This invitation has expired. Contact your organization for a new link.';
  if (inv.candidate_status !== 'Active') return 'Your account is inactive. Contact your organization.';
  if (inv.exam_status === 'Completed') return 'This exam has already ended.';
  return null;
}

api.post('/candidate/lookup', limiter(60, 15), (req, res) => {
  const inv = inviteByToken(req.body.token);
  const problem = inviteProblem(inv);
  if (problem) return res.status(inv ? 409 : 404).json({ error: problem });
  const org = getSettings().organization;
  res.json({
    exam: { title: inv.title, duration: inv.duration, status: inv.exam_status, startTime: inv.start_time },
    candidate: { firstName: inv.name.split(' ')[0] },
    organization: { name: org.name, logoUrl: org.logoUrl, supportEmail: org.supportEmail },
  });
});

api.post('/candidate/login', limiter(20, 15), (req, res) => {
  const inv = inviteByToken(req.body.token);
  const problem = inviteProblem(inv);
  if (problem) return res.status(inv ? 409 : 404).json({ error: problem });
  const ok = crypto.timingSafeEqual(Buffer.from(sha256(normCode(req.body.code))), Buffer.from(inv.code_hash));
  if (!ok) {
    const fails = inv.failed_attempts + 1;
    db.prepare('UPDATE invites SET failed_attempts = ?, status = CASE WHEN ? >= 5 THEN \'Locked\' ELSE status END WHERE id = ?').run(fails, fails, inv.id);
    audit({ candidateId: inv.candidate_id, type: 'Warning', event: fails >= 5 ? 'Invitation locked after 5 wrong access codes' : 'Wrong exam access code entered', examId: inv.exam_id, ip: ipOf(req) });
    changed('auditLogs');
    return res.status(401).json({ error: fails >= 5 ? 'Too many wrong codes. This invitation is now locked; contact your organization.' : `That access code is not correct. ${5 - fails} tries left.` });
  }
  db.prepare('UPDATE invites SET failed_attempts = 0 WHERE id = ?').run(inv.id);
  revokeSessions('candidate', inv.id); // one active device per invitation
  disconnectInvite(inv.id, 'You signed in to this exam on another device.');
  const expires = new Date(Math.min(Date.now() + 12 * 3600000, new Date(inv.expires_at).getTime()));
  createSession(res, 'candidate', inv.id, expires);
  audit({ candidateId: inv.candidate_id, type: 'Validation', event: 'Signed in with exam access code', examId: inv.exam_id, ip: ipOf(req) });
  touchCandidate(inv.candidate_id);
  changed('auditLogs', 'candidates');
  res.json({ ok: true });
});

function candidateState(ctx) {
  const settings = getSettings();
  const attempt = getAttemptByInvite(ctx.invite_id);
  const bankSize = ctx.bank_id ? db.prepare('SELECT COUNT(*) AS n FROM questions WHERE bank_id = ?').get(ctx.bank_id).n : 0;
  const base = {
    candidate: { id: ctx.candidate_id, name: ctx.name, department: ctx.department },
    exam: { id: ctx.exam_id, title: ctx.exam_title, status: ctx.exam_status, duration: ctx.duration, questionCount: bankSize },
    rules: { browserLockdown: !!settings.security.browserLockdown },
    organization: { name: settings.organization.name, logoUrl: settings.organization.logoUrl },
    attempt: null,
  };
  if (!attempt) return base;
  const secondsLeft = Math.max(0, Math.round((new Date(attempt.deadline) - Date.now()) / 1000));
  base.attempt = { status: attempt.status, secondsLeft, startedAt: attempt.started_at };
  if (attempt.status === 'InProgress') {
    base.attempt.questions = attemptQuestions(attempt);
    base.attempt.answers = JSON.parse(attempt.answers || '{}');
  } else if (attempt.status === 'Submitted' && settings.exam.showResultsToCandidate) {
    const r = db.prepare('SELECT score, correct, total, result FROM results WHERE candidate_id = ? AND exam_id = ?').get(ctx.candidate_id, ctx.exam_id);
    if (r) base.attempt.result = r;
  } else if (attempt.status === 'Terminated') {
    base.attempt.reason = attempt.terminated_reason || '';
  }
  return base;
}

function expireIfNeeded(ctx) {
  const a = getAttemptByInvite(ctx.invite_id);
  if (a && a.status === 'InProgress' && new Date(a.deadline).getTime() + 30000 < Date.now()) {
    finishAttempt(a.id, { reason: 'time ran out' });
    changed('results', 'auditLogs');
  }
}

api.get('/candidate/me', requireCandidate, (req, res) => {
  expireIfNeeded(req.candidate);
  res.json(candidateState(req.candidate));
});

api.post('/candidate/start', requireCandidate, (req, res) => {
  const ctx = req.candidate;
  if (ctx.exam_status !== 'Live') throw new HttpError(409, ctx.exam_status === 'Scheduled' ? 'The exam has not started yet. This page updates when it does.' : 'This exam has ended.');
  if (!ctx.bank_id || !db.prepare('SELECT 1 FROM questions WHERE bank_id = ?').get(ctx.bank_id)) throw new HttpError(409, 'This exam has no questions yet. Contact your organization.');
  const a = getAttemptByInvite(ctx.invite_id);
  if (a && a.status !== 'InProgress') throw new HttpError(409, 'You have already finished this exam.');
  startAttempt(ctx);
  changed('auditLogs', 'candidates');
  res.json(candidateState(ctx));
});

api.put('/candidate/answers', requireCandidate, (req, res) => {
  const ctx = req.candidate;
  expireIfNeeded(ctx);
  const a = getAttemptByInvite(ctx.invite_id);
  if (!a || a.status !== 'InProgress') throw new HttpError(409, 'This exam is no longer accepting answers.');
  const order = JSON.parse(a.question_order);
  const q = order.find((o) => o.id === req.body.questionId);
  if (!q) throw bad('Unknown question.');
  const answers = JSON.parse(a.answers || '{}');
  if (req.body.value === null) delete answers[q.id];
  else {
    const value = Number(req.body.value);
    if (!q.options.includes(value)) throw bad('Unknown option.');
    answers[q.id] = value;
  }
  db.prepare('UPDATE attempts SET answers = ? WHERE id = ?').run(JSON.stringify(answers), a.id);
  touchCandidate(ctx.candidate_id);
  res.json({ ok: true, saved: Object.keys(answers).length });
});

api.post('/candidate/submit', requireCandidate, (req, res) => {
  const ctx = req.candidate;
  const a = getAttemptByInvite(ctx.invite_id);
  if (!a) throw new HttpError(409, 'You have not started this exam.');
  if (a.status === 'InProgress') finishAttempt(a.id);
  changed('results', 'auditLogs', 'candidates');
  res.json(candidateState(ctx));
});

api.post('/candidate/logout', (req, res) => {
  destroySession(req, res, 'candidate');
  res.json({ ok: true });
});

// ---------------------------------------------------------------- errors
api.use((req, res) => res.status(404).json({ error: 'Not found.' }));
// eslint-disable-next-line no-unused-vars
api.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON.' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
  console.error('[api]', err);
  res.status(500).json({ error: 'Something went wrong on the server. Try again.' });
});
