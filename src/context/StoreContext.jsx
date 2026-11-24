import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  seedCandidates,
  seedQuestionBanks,
  seedExams,
  seedResults,
  seedFeedback,
  seedAuditLogs,
  seedSettings,
} from '../data/mockData.js';

const STORAGE_KEY = 'oversee-state-v1';

const initialState = () => ({
  candidates: structuredClone(seedCandidates),
  questionBanks: structuredClone(seedQuestionBanks),
  exams: structuredClone(seedExams),
  results: structuredClone(seedResults),
  feedback: structuredClone(seedFeedback),
  auditLogs: structuredClone(seedAuditLogs),
  settings: structuredClone(seedSettings),
});

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...initialState(), ...JSON.parse(raw) };
  } catch {
    /* ignore corrupt / unavailable storage */
  }
  return initialState();
}

const StoreContext = createContext(null);

let counter = Date.now() % 100000;
const nextId = (prefix) => `${prefix}-${++counter}`;

export function StoreProvider({ children }) {
  const [state, setState] = useState(loadState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked */
    }
  }, [state]);

  const actions = useMemo(() => {
    const log = (s, candidateId, type, event, examId = null) => ({
      ...s,
      auditLogs: [
        { id: nextId('LOG'), candidateId, type, event, examId, timestamp: new Date().toISOString(), ip: 'admin-console' },
        ...s.auditLogs,
      ],
    });

    return {
      // Candidates
      addCandidate: (data) =>
        setState((s) => {
          const c = {
            id: nextId('CND'),
            status: 'Active',
            online: false,
            warnings: 0,
            cheatingFlags: 0,
            assignedExams: [],
            lastActive: new Date().toISOString(),
            ...data,
          };
          return log({ ...s, candidates: [c, ...s.candidates] }, c.id, 'Normal', 'Candidate registered by organization');
        }),
      toggleCandidateStatus: (id) =>
        setState((s) => {
          const c = s.candidates.find((x) => x.id === id);
          const status = c.status === 'Active' ? 'Inactive' : 'Active';
          return log(
            {
              ...s,
              candidates: s.candidates.map((x) =>
                x.id === id ? { ...x, status, online: status === 'Active' ? x.online : false } : x
              ),
            },
            id,
            'Normal',
            `Status changed to ${status} by organization`
          );
        }),
      assignExam: (candidateId, examId) =>
        setState((s) => {
          const c = s.candidates.find((x) => x.id === candidateId);
          if (!c || c.assignedExams.includes(examId)) return s;
          const exam = s.exams.find((e) => e.id === examId);
          return log(
            {
              ...s,
              candidates: s.candidates.map((x) =>
                x.id === candidateId ? { ...x, assignedExams: [...x.assignedExams, examId] } : x
              ),
              exams: s.exams.map((e) =>
                e.id === examId ? { ...e, candidates: [...e.candidates, candidateId] } : e
              ),
            },
            candidateId,
            'Normal',
            `Assigned exam "${exam?.title}"`,
            examId
          );
        }),

      // Question banks
      addQuestionBank: (bank) =>
        setState((s) => ({
          ...s,
          questionBanks: [
            { id: nextId('QB'), createdAt: new Date().toISOString(), questions: [], ...bank },
            ...s.questionBanks,
          ],
        })),
      deleteQuestionBank: (id) =>
        setState((s) => ({ ...s, questionBanks: s.questionBanks.filter((b) => b.id !== id) })),
      addQuestion: (bankId, question) =>
        setState((s) => ({
          ...s,
          questionBanks: s.questionBanks.map((b) =>
            b.id === bankId ? { ...b, questions: [...b.questions, { id: nextId('Q'), ...question }] } : b
          ),
        })),
      deleteQuestion: (bankId, qid) =>
        setState((s) => ({
          ...s,
          questionBanks: s.questionBanks.map((b) =>
            b.id === bankId ? { ...b, questions: b.questions.filter((x) => x.id !== qid) } : b
          ),
        })),

      // Exams
      addExam: (exam) =>
        setState((s) => ({
          ...s,
          exams: [{ id: nextId('EX'), status: 'Scheduled', candidates: [], ...exam }, ...s.exams],
        })),
      setExamStatus: (id, status) =>
        setState((s) => ({ ...s, exams: s.exams.map((e) => (e.id === id ? { ...e, status } : e)) })),
      deleteExam: (id) =>
        setState((s) => ({
          ...s,
          exams: s.exams.filter((e) => e.id !== id),
          candidates: s.candidates.map((c) => ({ ...c, assignedExams: c.assignedExams.filter((x) => x !== id) })),
        })),

      // Feedback
      sendFeedback: (fb) =>
        setState((s) =>
          log(
            {
              ...s,
              feedback: [{ id: nextId('FB'), sentAt: new Date().toISOString(), ...fb }, ...s.feedback],
            },
            fb.candidateId,
            'Normal',
            'Feedback sent by organization',
            fb.examId
          )
        ),
      deleteFeedback: (id) => setState((s) => ({ ...s, feedback: s.feedback.filter((f) => f.id !== id) })),

      // Audit
      addAuditEvent: (candidateId, type, event, examId) => setState((s) => log(s, candidateId, type, event, examId)),

      // Settings
      updateSettings: (section, values) =>
        setState((s) => ({ ...s, settings: { ...s.settings, [section]: { ...s.settings[section], ...values } } })),

      resetDemoData: () => setState(initialState()),
    };
  }, []);

  const value = useMemo(() => ({ ...state, ...actions }), [state, actions]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

// Lookup helpers
export const byId = (list, id) => list.find((x) => x.id === id);
export const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
export const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });
export function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return 'just now';
  if (diff < 60) return `${Math.round(diff)} min ago`;
  if (diff < 1440) return `${Math.round(diff / 60)} hr ago`;
  return `${Math.round(diff / 1440)} days ago`;
}
