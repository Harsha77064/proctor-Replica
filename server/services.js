// Domain logic shared by the HTTP API and the signaling server.
import { db, now, audit, newId, getSettings, tx } from './db.js';

// ---------------------------------------------------------------- serializers
const parse = (s, fallback) => {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};

export function listCandidates(isOnline = () => false) {
  const assigned = {};
  for (const r of db.prepare('SELECT exam_id, candidate_id FROM exam_candidates').all()) {
    (assigned[r.candidate_id] ||= []).push(r.exam_id);
  }
  return db.prepare('SELECT * FROM candidates ORDER BY id').all().map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    department: c.department,
    status: c.status,
    online: isOnline(c.id),
    warnings: c.warnings,
    cheatingFlags: c.cheating_flags,
    assignedExams: assigned[c.id] || [],
    lastActive: c.last_active || c.created_at,
  }));
}

export function listBanks({ includeAnswers }) {
  const qs = {};
  for (const q of db.prepare('SELECT * FROM questions ORDER BY position, id').all()) {
    (qs[q.bank_id] ||= []).push({
      id: q.id,
      text: q.text,
      options: parse(q.options, []),
      ...(includeAnswers ? { answer: q.answer } : {}),
      difficulty: q.difficulty,
    });
  }
  return db.prepare('SELECT * FROM question_banks ORDER BY created_at DESC').all().map((b) => ({
    id: b.id,
    name: b.name,
    topic: b.topic,
    description: b.description,
    createdAt: b.created_at,
    questions: qs[b.id] || [],
  }));
}

export function listExams() {
  const members = {};
  for (const r of db.prepare('SELECT exam_id, candidate_id FROM exam_candidates ORDER BY candidate_id').all()) {
    (members[r.exam_id] ||= []).push(r.candidate_id);
  }
  return db.prepare('SELECT * FROM exams ORDER BY start_time').all().map((e) => ({
    id: e.id,
    title: e.title,
    bankId: e.bank_id,
    status: e.status,
    startTime: e.start_time,
    duration: e.duration,
    passMark: e.pass_mark,
    candidates: members[e.id] || [],
  }));
}

export const listResults = () =>
  db.prepare('SELECT * FROM results ORDER BY submitted_at DESC').all().map((r) => ({
    id: r.id,
    candidateId: r.candidate_id,
    examId: r.exam_id,
    score: r.score,
    correct: r.correct,
    total: r.total,
    timeTaken: r.time_taken,
    submittedAt: r.submitted_at,
    result: r.result,
  }));

export const listFeedback = () =>
  db.prepare('SELECT * FROM feedback ORDER BY sent_at DESC').all().map((f) => ({
    id: f.id,
    candidateId: f.candidate_id,
    examId: f.exam_id,
    rating: f.rating,
    message: f.message,
    sentBy: f.sent_by,
    sentAt: f.sent_at,
  }));

export const listAudit = (limit = 1000) =>
  db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC, id DESC LIMIT ?').all(limit).map((l) => ({
    id: `LOG-${l.id}`,
    candidateId: l.candidate_id,
    type: l.type,
    event: l.event,
    examId: l.exam_id,
    actor: l.actor,
    ip: l.ip || '',
    timestamp: l.timestamp,
  }));

export const listRecordings = () =>
  db.prepare('SELECT r.*, c.name AS candidate_name, e.title AS exam_title FROM recordings r LEFT JOIN candidates c ON c.id = r.candidate_id LEFT JOIN exams e ON e.id = r.exam_id ORDER BY r.created_at DESC').all().map((r) => ({
    id: r.id,
    candidateId: r.candidate_id,
    name: r.candidate_name || r.candidate_id,
    examId: r.exam_id,
    examTitle: r.exam_title || '',
    mime: r.mime,
    size: r.size,
    duration: r.duration,
    recordedBy: r.recorded_by,
    at: r.created_at,
    url: `/api/recordings/${r.id}/file`,
  }));

// ---------------------------------------------------------------- proctoring
export function touchCandidate(candidateId) {
  db.prepare('UPDATE candidates SET last_active = ? WHERE id = ?').run(now(), candidateId);
}

/** Logs an integrity event; warnings count towards the auto-flag limit. Returns { autoFlagged }. */
export function recordProctorEvent({ candidateId, examId, type, event, actor = null, ip = null }) {
  return tx(() => {
    audit({ candidateId, type, event, examId, actor, ip });
    touchCandidate(candidateId);
    if (type !== 'Warning') return { autoFlagged: false };
    const limit = Math.max(1, Number(getSettings().security.maxWarningsBeforeFlag) || 3);
    db.prepare('UPDATE candidates SET warnings = warnings + 1 WHERE id = ?').run(candidateId);
    const { warnings } = db.prepare('SELECT warnings FROM candidates WHERE id = ?').get(candidateId) || { warnings: 0 };
    if (warnings > 0 && warnings % limit === 0) {
      db.prepare('UPDATE candidates SET cheating_flags = cheating_flags + 1 WHERE id = ?').run(candidateId);
      audit({ candidateId, type: 'Warning', event: `Auto-flagged: reached ${limit} warnings`, examId });
      return { autoFlagged: true };
    }
    return { autoFlagged: false };
  });
}

export function flagCandidate({ candidateId, examId, reason, actor }) {
  tx(() => {
    db.prepare('UPDATE candidates SET cheating_flags = cheating_flags + 1 WHERE id = ?').run(candidateId);
    audit({ candidateId, type: 'Warning', event: `Flagged by proctor${reason ? `: ${reason}` : ''}`, examId, actor });
  });
}

// ---------------------------------------------------------------- exam attempts
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export function getAttemptByInvite(inviteId) {
  return db.prepare('SELECT * FROM attempts WHERE invite_id = ?').get(inviteId);
}

/** Starts (or resumes) the candidate's attempt. Question and option order are fixed per attempt. */
export function startAttempt(ctx) {
  return tx(() => {
    const existing = getAttemptByInvite(ctx.invite_id);
    if (existing) return existing;
    const settings = getSettings();
    const questions = db.prepare('SELECT id, options FROM questions WHERE bank_id = ? ORDER BY position, id').all(ctx.bank_id);
    const order = questions.map((q) => ({
      id: q.id,
      options: parse(q.options, []).map((_, i) => i),
    }));
    if (settings.exam.shuffleOptions) order.forEach((q) => shuffle(q.options));
    if (settings.exam.shuffleQuestions) shuffle(order);
    const started = new Date();
    const deadline = new Date(started.getTime() + ctx.duration * 60000);
    const id = newId('ATT');
    db.prepare(`INSERT INTO attempts (id, invite_id, exam_id, candidate_id, question_order, started_at, deadline)
                VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, ctx.invite_id, ctx.exam_id, ctx.candidate_id, JSON.stringify(order), started.toISOString(), deadline.toISOString());
    db.prepare("UPDATE invites SET status = 'Started' WHERE id = ?").run(ctx.invite_id);
    audit({ candidateId: ctx.candidate_id, type: 'Normal', event: 'Started exam', examId: ctx.exam_id });
    return getAttemptByInvite(ctx.invite_id);
  });
}

/** Questions for the candidate, in their attempt order, without answer keys. */
export function attemptQuestions(attempt) {
  const order = parse(attempt.question_order, []);
  const byId = Object.fromEntries(
    db.prepare(`SELECT id, text, options FROM questions WHERE id IN (${order.map(() => '?').join(',') || "''"})`)
      .all(...order.map((o) => o.id))
      .map((q) => [q.id, q])
  );
  return order
    .filter((o) => byId[o.id])
    .map((o) => {
      const opts = parse(byId[o.id].options, []);
      // `value` is the original option index; the candidate never sees which one is correct.
      return { id: o.id, text: byId[o.id].text, options: o.options.map((i) => ({ value: i, label: opts[i] })) };
    });
}

/** Scores an attempt on the server and writes the result. Idempotent. */
export function finishAttempt(attemptId, { status = 'Submitted', reason = null, actor = null } = {}) {
  return tx(() => {
    const a = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId);
    if (!a || a.status !== 'InProgress') return null;
    const finishedAt = new Date();
    db.prepare('UPDATE attempts SET status = ?, finished_at = ?, terminated_reason = ? WHERE id = ?')
      .run(status, finishedAt.toISOString(), reason, a.id);
    db.prepare('UPDATE invites SET status = ? WHERE id = ?').run(status, a.invite_id);
    if (status === 'Terminated') {
      audit({ candidateId: a.candidate_id, type: 'Warning', event: `Exam terminated by proctor${reason ? `: ${reason}` : ''}`, examId: a.exam_id, actor });
      return { status };
    }
    const order = parse(a.question_order, []);
    const answers = parse(a.answers, {});
    const keys = Object.fromEntries(
      db.prepare(`SELECT id, answer FROM questions WHERE id IN (${order.map(() => '?').join(',') || "''"})`)
        .all(...order.map((o) => o.id))
        .map((q) => [q.id, q.answer])
    );
    const total = order.length;
    const correct = order.filter((o) => answers[o.id] !== undefined && answers[o.id] === keys[o.id]).length;
    const score = total ? Math.round((correct / total) * 100) : 0;
    const exam = db.prepare('SELECT pass_mark FROM exams WHERE id = ?').get(a.exam_id);
    const minutes = Math.max(1, Math.round((Math.min(finishedAt, new Date(a.deadline)) - new Date(a.started_at)) / 60000));
    const passFail = score >= (exam?.pass_mark ?? 60) ? 'Pass' : 'Fail';
    db.prepare(`INSERT INTO results (id, candidate_id, exam_id, score, correct, total, time_taken, submitted_at, result)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(candidate_id, exam_id) DO UPDATE SET score = excluded.score, correct = excluded.correct,
                  total = excluded.total, time_taken = excluded.time_taken, submitted_at = excluded.submitted_at, result = excluded.result`)
      .run(newId('RS'), a.candidate_id, a.exam_id, score, correct, total, minutes, finishedAt.toISOString(), passFail);
    audit({
      candidateId: a.candidate_id,
      type: 'Normal',
      event: reason ? `Exam auto-submitted (${reason}) — scored ${score}%` : `Submitted exam — scored ${score}%`,
      examId: a.exam_id,
    });
    return { status, correct, total, score, result: passFail };
  });
}

/** Auto-submits attempts whose time ran out (with a 30 s grace for slow connections). */
export function sweepExpiredAttempts() {
  const cutoff = new Date(Date.now() - 30000).toISOString();
  for (const a of db.prepare("SELECT id FROM attempts WHERE status = 'InProgress' AND deadline < ?").all(cutoff)) {
    finishAttempt(a.id, { reason: 'time ran out' });
  }
}

export function finishAttemptsForExam(examId) {
  for (const a of db.prepare("SELECT id FROM attempts WHERE status = 'InProgress' AND exam_id = ?").all(examId)) {
    finishAttempt(a.id, { reason: 'exam ended by admin' });
  }
}
