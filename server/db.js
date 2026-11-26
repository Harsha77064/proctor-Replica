// SQLite database: schema, migrations and small query helpers.
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { config } from './config.js';

export const db = new Database(path.join(config.dataDir, 'oversee.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

const MIGRATIONS = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'proctor')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_login_at TEXT
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('staff', 'candidate')),
    subject_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX sessions_subject ON sessions(kind, subject_id);
  CREATE TABLE counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
  CREATE TABLE settings (section TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE candidates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    warnings INTEGER NOT NULL DEFAULT 0,
    cheating_flags INTEGER NOT NULL DEFAULT 0,
    last_active TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE question_banks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    topic TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE questions (
    id TEXT PRIMARY KEY,
    bank_id TEXT NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    options TEXT NOT NULL,
    answer INTEGER NOT NULL,
    difficulty TEXT NOT NULL DEFAULT 'Medium',
    position INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE exams (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    bank_id TEXT REFERENCES question_banks(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'Live', 'Completed')),
    start_time TEXT NOT NULL,
    duration INTEGER NOT NULL,
    pass_mark INTEGER NOT NULL DEFAULT 60,
    created_at TEXT NOT NULL
  );
  CREATE TABLE exam_candidates (
    exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    PRIMARY KEY (exam_id, candidate_id)
  );
  CREATE TABLE invites (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    code_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Started', 'Submitted', 'Terminated', 'Revoked', 'Locked')),
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    emailed_at TEXT
  );
  CREATE INDEX invites_exam ON invites(exam_id, candidate_id);
  CREATE TABLE attempts (
    id TEXT PRIMARY KEY,
    invite_id TEXT NOT NULL UNIQUE REFERENCES invites(id) ON DELETE CASCADE,
    exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'InProgress' CHECK (status IN ('InProgress', 'Submitted', 'Terminated')),
    question_order TEXT NOT NULL,
    answers TEXT NOT NULL DEFAULT '{}',
    started_at TEXT NOT NULL,
    deadline TEXT NOT NULL,
    finished_at TEXT,
    terminated_reason TEXT
  );
  CREATE TABLE results (
    id TEXT PRIMARY KEY,
    candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    correct INTEGER NOT NULL,
    total INTEGER NOT NULL,
    time_taken INTEGER NOT NULL,
    submitted_at TEXT NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('Pass', 'Fail')),
    UNIQUE (candidate_id, exam_id)
  );
  CREATE TABLE feedback (
    id TEXT PRIMARY KEY,
    candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    exam_id TEXT REFERENCES exams(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL,
    message TEXT NOT NULL,
    sent_by TEXT NOT NULL,
    sent_at TEXT NOT NULL
  );
  CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id TEXT,
    type TEXT NOT NULL CHECK (type IN ('Normal', 'Warning', 'Validation')),
    event TEXT NOT NULL,
    exam_id TEXT,
    actor TEXT,
    ip TEXT,
    timestamp TEXT NOT NULL
  );
  CREATE INDEX audit_time ON audit_logs(timestamp DESC);
  CREATE INDEX audit_candidate ON audit_logs(candidate_id, timestamp DESC);
  CREATE TABLE recordings (
    id TEXT PRIMARY KEY,
    candidate_id TEXT NOT NULL,
    exam_id TEXT,
    file_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    duration INTEGER NOT NULL DEFAULT 0,
    recorded_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
];

db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
const current = db.prepare('SELECT version FROM schema_version').get()?.version ?? 0;
for (let v = current; v < MIGRATIONS.length; v++) {
  db.transaction(() => {
    db.exec(MIGRATIONS[v]);
    if (v === 0) db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(1);
    else db.prepare('UPDATE schema_version SET version = ?').run(v + 1);
  })();
}

// ---------------------------------------------------------------------------
export const now = () => new Date().toISOString();
export const tx = (fn) => db.transaction(fn)();

/** Human-readable sequential ids such as CND-1025 or EX-210. */
export function nextId(prefix, start) {
  const row = db.prepare('SELECT value FROM counters WHERE name = ?').get(prefix);
  const value = row ? row.value + 1 : start;
  db.prepare('INSERT INTO counters (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value').run(prefix, value);
  return `${prefix}-${value}`;
}
export const ID_START = { CND: 1001, QB: 101, Q: 1, EX: 201, RS: 3001, FB: 4001, INV: 1, ATT: 1, REC: 1, USR: 1 };
export const newId = (prefix) => nextId(prefix, ID_START[prefix] ?? 1);

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export function audit({ candidateId = null, type = 'Normal', event, examId = null, actor = null, ip = null }) {
  db.prepare('INSERT INTO audit_logs (candidate_id, type, event, exam_id, actor, ip, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(candidateId, type, String(event).slice(0, 300), examId, actor, ip, now());
}

export const DEFAULT_SETTINGS = {
  organization: {
    name: 'My Organization',
    companyUrl: '',
    logoUrl: '',
    supportEmail: '',
    timezone: 'Asia/Kolkata',
  },
  exam: {
    defaultDuration: 60,
    passMark: 60,
    maxAttempts: 1,
    shuffleQuestions: true,
    shuffleOptions: true,
    showResultsToCandidate: false,
    negativeMarking: false,
  },
  security: {
    webcamRequired: true,
    microphoneRequired: true,
    screenRecording: true,
    browserLockdown: true,
    idVerification: true,
    maxWarningsBeforeFlag: 3,
    autoSubmitOnFlag: false,
  },
  notifications: {
    emailOnExamScheduled: true,
    emailOnResultPublished: true,
    alertOnCheatingFlag: true,
    dailySummary: false,
    reminderHoursBefore: 24,
  },
};

export function getSettings() {
  const out = structuredClone(DEFAULT_SETTINGS);
  for (const row of db.prepare('SELECT section, value FROM settings').all()) {
    try {
      out[row.section] = { ...(out[row.section] || {}), ...JSON.parse(row.value) };
    } catch {
      /* ignore a corrupt row; defaults stay */
    }
  }
  return out;
}

export function saveSettings(section, value) {
  db.prepare('INSERT INTO settings (section, value) VALUES (?, ?) ON CONFLICT(section) DO UPDATE SET value = excluded.value')
    .run(section, JSON.stringify(value));
}
