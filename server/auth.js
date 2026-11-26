// Password hashing, cookie sessions and role checks.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { db, now, sha256, randomToken } from './db.js';
import { config } from './config.js';

const scrypt = promisify(crypto.scrypt);
export const STAFF_COOKIE = 'ov_staff';
export const CANDIDATE_COOKIE = 'ov_cand';

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltB64, keyB64] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(key, expected);
}

export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 10) return 'Use at least 10 characters.';
  if (password.length > 200) return 'Use at most 200 characters.';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return 'Use both letters and numbers.';
  return null;
}

function cookieOptions(expires) {
  return { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/', expires };
}

export function createSession(res, kind, subjectId, expiresAt) {
  const token = randomToken(32);
  db.prepare('INSERT INTO sessions (token_hash, kind, subject_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(sha256(token), kind, subjectId, now(), expiresAt.toISOString());
  res.cookie(kind === 'staff' ? STAFF_COOKIE : CANDIDATE_COOKIE, token, cookieOptions(expiresAt));
}

export function destroySession(req, res, kind) {
  const name = kind === 'staff' ? STAFF_COOKIE : CANDIDATE_COOKIE;
  const token = req.cookies?.[name];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  res.clearCookie(name, cookieOptions(undefined));
}

export function revokeSessions(kind, subjectId) {
  db.prepare('DELETE FROM sessions WHERE kind = ? AND subject_id = ?').run(kind, subjectId);
}

function lookup(token, kind) {
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND kind = ?').get(sha256(token), kind);
  if (!s) return null;
  if (s.expires_at < now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(s.token_hash);
    return null;
  }
  return s;
}

/** Staff user for a cookie header map, or null. Used by HTTP and WebSocket. */
export function staffFromCookies(cookies) {
  const s = lookup(cookies?.[STAFF_COOKIE], 'staff');
  if (!s) return null;
  const u = db.prepare('SELECT id, name, email, role, active FROM users WHERE id = ?').get(s.subject_id);
  return u && u.active ? u : null;
}

/** Candidate invite context for a cookie header map, or null. */
export function candidateFromCookies(cookies) {
  const s = lookup(cookies?.[CANDIDATE_COOKIE], 'candidate');
  if (!s) return null;
  const inv = db.prepare(`
    SELECT i.id AS invite_id, i.status AS invite_status, i.exam_id, i.candidate_id,
           c.name, c.email, c.department, c.status AS candidate_status,
           e.title AS exam_title, e.status AS exam_status, e.duration, e.bank_id, e.pass_mark
    FROM invites i JOIN candidates c ON c.id = i.candidate_id JOIN exams e ON e.id = i.exam_id
    WHERE i.id = ?`).get(s.subject_id);
  if (!inv || inv.invite_status === 'Revoked' || inv.candidate_status !== 'Active') return null;
  return inv;
}

export function requireStaff(...roles) {
  return (req, res, next) => {
    const user = staffFromCookies(req.cookies);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    if (roles.length && !roles.includes(user.role)) return res.status(403).json({ error: 'You do not have permission to do that.' });
    req.user = user;
    next();
  };
}

export function requireCandidate(req, res, next) {
  const ctx = candidateFromCookies(req.cookies);
  if (!ctx) return res.status(401).json({ error: 'Your exam session has ended. Open your invitation link again.' });
  req.candidate = ctx;
  next();
}

/** Parse a raw Cookie header (for WebSocket upgrades). */
export function parseCookieHeader(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[k] = part.slice(i + 1).trim();
    }
  }
  return out;
}

export function purgeExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
}
