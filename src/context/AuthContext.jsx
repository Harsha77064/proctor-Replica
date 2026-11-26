import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, needsSetup: false, emailEnabled: false });

  const refresh = useCallback(async () => {
    try {
      const me = await api('/auth/me', { quiet401: true });
      setState({ loading: false, user: me.user, needsSetup: false, emailEnabled: me.emailEnabled });
    } catch {
      let needsSetup = false;
      try {
        needsSetup = (await api('/setup/status')).needsSetup;
      } catch {
        /* server unreachable: show the login page with its error */
      }
      setState({ loading: false, user: null, needsSetup, emailEnabled: false });
    }
  }, []);

  useEffect(() => {
    refresh();
    setUnauthorizedHandler(() => setState((s) => (s.user ? { ...s, user: null } : s)));
    return () => setUnauthorizedHandler(null);
  }, [refresh]);

  const value = useMemo(
    () => ({
      ...state,
      isAdmin: state.user?.role === 'admin',
      login: async (email, password) => {
        const r = await api('/auth/login', { method: 'POST', body: { email, password }, quiet401: true });
        setState((s) => ({ ...s, user: r.user, needsSetup: false }));
        refresh();
      },
      setup: async (form) => {
        const r = await api('/setup', { method: 'POST', body: form });
        setState((s) => ({ ...s, user: r.user, needsSetup: false }));
      },
      logout: async () => {
        try {
          await api('/auth/logout', { method: 'POST' });
        } finally {
          setState((s) => ({ ...s, user: null }));
        }
      },
      refresh,
    }),
    [state, refresh]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
