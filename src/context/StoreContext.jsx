// Organization data, loaded from the server. Actions call the API and then
// reload what changed. Other staff members' changes arrive through the live
// connection (see LiveContext), which calls `refresh`.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';

const COLLECTIONS = ['candidates', 'questionBanks', 'exams', 'results', 'feedback', 'auditLogs', 'settings'];

const EMPTY = {
  candidates: [],
  questionBanks: [],
  exams: [],
  results: [],
  feedback: [],
  auditLogs: [],
  settings: {
    organization: { name: '', companyUrl: '', logoUrl: '', supportEmail: '', timezone: 'Asia/Kolkata' },
    exam: { defaultDuration: 60, passMark: 60, maxAttempts: 1, shuffleQuestions: true, shuffleOptions: true, showResultsToCandidate: false, negativeMarking: false },
    security: { webcamRequired: true, microphoneRequired: true, screenRecording: true, browserLockdown: true, idVerification: true, maxWarningsBeforeFlag: 3, autoSubmitOnFlag: false },
    notifications: { emailOnExamScheduled: true, emailOnResultPublished: true, alertOnCheatingFlag: true, dailySummary: false, reminderHoursBefore: 24 },
  },
};

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [state, setState] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const pending = useRef(new Set());
  const timer = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const refresh = useCallback(async (collections) => {
    const only = (collections || COLLECTIONS).filter((c) => COLLECTIONS.includes(c));
    if (!only.length) return;
    try {
      const data = await api(`/data?only=${only.join(',')}`);
      setState((s) => ({ ...s, ...data }));
      setLoaded(true);
    } catch (err) {
      if (err.status !== 401) setError(err.message);
    }
  }, []);

  // Coalesce bursts of change notifications into one request.
  const refreshSoon = useCallback(
    (collections) => {
      collections.forEach((c) => pending.current.add(c));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const list = [...pending.current];
        pending.current.clear();
        refresh(list);
      }, 250);
    },
    [refresh]
  );

  useEffect(() => {
    refresh();
    // Safety net in case a live update is missed (e.g. while offline).
    const t = setInterval(() => refresh(['candidates', 'exams', 'results', 'auditLogs']), 60000);
    return () => clearInterval(t);
  }, [refresh]);

  const actions = useMemo(() => {
    // Runs an API call, reloads the given collections, and reports errors to the user.
    const run = (collections, fn) => async (...args) => {
      try {
        const out = await fn(...args);
        await refresh(collections);
        return out;
      } catch (err) {
        setError(err.message);
        throw err;
      }
    };
    return {
      // Candidates
      addCandidate: run(['candidates', 'auditLogs'], (data) => api('/candidates', { method: 'POST', body: data })),
      toggleCandidateStatus: run(['candidates', 'auditLogs'], (id) => {
        const c = stateRef.current.candidates.find((x) => x.id === id);
        return api(`/candidates/${id}`, { method: 'PATCH', body: { status: c?.status === 'Active' ? 'Inactive' : 'Active' } });
      }),
      assignExam: run(['candidates', 'exams', 'auditLogs'], (candidateId, examId) => api(`/candidates/${candidateId}/assign`, { method: 'POST', body: { examId } })),
      flagCandidate: run(['candidates', 'auditLogs'], (candidateId, reason, examId) => api(`/candidates/${candidateId}/flag`, { method: 'POST', body: { reason, examId } })),

      // Question banks
      addQuestionBank: run(['questionBanks'], (bank) => api('/banks', { method: 'POST', body: bank })),
      deleteQuestionBank: run(['questionBanks', 'exams'], (id) => api(`/banks/${id}`, { method: 'DELETE' })),
      addQuestion: run(['questionBanks'], (bankId, q) => api(`/banks/${bankId}/questions`, { method: 'POST', body: q })),
      deleteQuestion: run(['questionBanks'], (bankId, qid) => api(`/banks/${bankId}/questions/${qid}`, { method: 'DELETE' })),

      // Exams
      addExam: run(['exams'], (exam) => api('/exams', { method: 'POST', body: exam })),
      setExamStatus: run(['exams', 'results', 'auditLogs'], (id, status) => api(`/exams/${id}`, { method: 'PATCH', body: { status } })),
      deleteExam: run(['exams', 'candidates', 'results'], (id) => api(`/exams/${id}`, { method: 'DELETE' })),

      // Feedback
      sendFeedback: run(['feedback', 'auditLogs'], (fb) => api('/feedback', { method: 'POST', body: fb })),
      deleteFeedback: run(['feedback'], (id) => api(`/feedback/${id}`, { method: 'DELETE' })),

      // Settings
      updateSettings: run(['settings', 'auditLogs'], (section, values) => api(`/settings/${section}`, { method: 'PUT', body: values })),

      refresh,
      refreshSoon,
      clearError: () => setError(null),
      reportError: setError,
    };
  }, [refresh, refreshSoon]);

  const value = useMemo(() => ({ ...state, loaded, error, ...actions }), [state, loaded, error, actions]);
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
