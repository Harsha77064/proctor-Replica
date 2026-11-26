// Optional demo data, loaded from the same seed file the UI was designed with.
import { db, now, getSettings, saveSettings } from './db.js';
import {
  seedCandidates, seedQuestionBanks, seedExams, seedResults, seedFeedback, seedAuditLogs, seedSettings,
} from '../src/data/mockData.js';

const num = (id) => Number(String(id).split('-').pop()) || 0;

export function seedDemo() {
  const has = db.prepare('SELECT COUNT(*) AS n FROM candidates').get().n;
  if (has) return false;
  db.transaction(() => {
    const t = now();
    const insC = db.prepare('INSERT INTO candidates (id, name, email, department, status, warnings, cheating_flags, last_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    seedCandidates.forEach((c) => insC.run(c.id, c.name, c.email, c.department, c.status, c.warnings, c.cheatingFlags, c.lastActive, t));

    const insB = db.prepare('INSERT INTO question_banks (id, name, topic, description, created_at) VALUES (?, ?, ?, ?, ?)');
    const insQ = db.prepare('INSERT INTO questions (id, bank_id, text, options, answer, difficulty, position) VALUES (?, ?, ?, ?, ?, ?, ?)');
    seedQuestionBanks.forEach((b) => {
      insB.run(b.id, b.name, b.topic, b.description, b.createdAt);
      b.questions.forEach((q, i) => insQ.run(q.id, b.id, q.text, JSON.stringify(q.options), q.answer, q.difficulty, i + 1));
    });

    const insE = db.prepare('INSERT INTO exams (id, title, bank_id, status, start_time, duration, pass_mark, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const insEC = db.prepare('INSERT OR IGNORE INTO exam_candidates (exam_id, candidate_id) VALUES (?, ?)');
    seedExams.forEach((e) => {
      insE.run(e.id, e.title, e.bankId, e.status, e.startTime, e.duration, e.passMark, t);
      e.candidates.forEach((cid) => insEC.run(e.id, cid));
    });

    const insR = db.prepare('INSERT INTO results (id, candidate_id, exam_id, score, correct, total, time_taken, submitted_at, result) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    seedResults.forEach((r) => insR.run(r.id, r.candidateId, r.examId, r.score, r.correct, r.total, r.timeTaken, r.submittedAt, r.result));

    const insF = db.prepare('INSERT INTO feedback (id, candidate_id, exam_id, rating, message, sent_by, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    seedFeedback.forEach((f) => insF.run(f.id, f.candidateId, f.examId, f.rating, f.message, f.sentBy, f.sentAt));

    const insL = db.prepare('INSERT INTO audit_logs (candidate_id, type, event, exam_id, ip, timestamp) VALUES (?, ?, ?, ?, ?, ?)');
    seedAuditLogs.forEach((l) => insL.run(l.candidateId, l.type, l.event, l.examId, l.ip, l.timestamp));

    const setCounter = db.prepare('INSERT INTO counters (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = MAX(value, excluded.value)');
    setCounter.run('CND', Math.max(...seedCandidates.map((c) => num(c.id))));
    setCounter.run('QB', Math.max(...seedQuestionBanks.map((b) => num(b.id))));
    setCounter.run('EX', Math.max(...seedExams.map((e) => num(e.id))));
    setCounter.run('RS', Math.max(3000, ...seedResults.map((r) => num(r.id))));
    setCounter.run('FB', Math.max(4000, ...seedFeedback.map((f) => num(f.id))));

    const current = getSettings();
    for (const section of ['exam', 'security', 'notifications']) saveSettings(section, { ...current[section], ...seedSettings[section] });
  })();
  return true;
}
