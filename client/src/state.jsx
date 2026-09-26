import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, subscribe } from './api.js';

// ---- auth -------------------------------------------------------------------

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still loading

  useEffect(() => {
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setUser(null));
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, setUser, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// ---- live notifications & toasts --------------------------------------------

const LiveContext = createContext(null);

export function LiveProvider({ children }) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const [version, setVersion] = useState(0);
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message, opts = {}) => {
      const id = ++seq.current;
      setToasts((t) => [...t.slice(-1), { id, message, ...opts }]);
      setTimeout(() => dismiss(id), opts.duration ?? 5000);
    },
    [dismiss]
  );
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!user) return;
    api('/me/notifications?limit=1')
      .then((d) => setUnread(d.unread))
      .catch(() => {});
    return subscribe(user.id, (event) => {
      if (event.kind === 'notification') {
        setUnread((u) => u + 1);
        const n = event.notification;
        // The page that created the post already confirms it.
        if (n.type !== 'live')
          toast(n.title, { tone: n.type === 'urgent' ? 'urgent' : 'info', to: n.post_id ? `/posts/${n.post_id}` : '/alerts' });
      }
      setVersion((v) => v + 1);
    });
  }, [user, toast]);

  return (
    <LiveContext.Provider value={{ unread, setUnread, version, refresh, toasts, toast, dismiss }}>{children}</LiveContext.Provider>
  );
}

export const useLive = () => useContext(LiveContext);

// ---- theme (light / dark) ---------------------------------------------------

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('sharingplates_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sharingplates_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

// ---- data loading -----------------------------------------------------------

/**
 * Loads `path` and reloads it whenever `path` changes or a live event arrives.
 * Pass null to skip loading.
 */
export function useApi(path, { live = true } = {}) {
  const { version } = useLive();
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    api(path)
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((error) => !cancelled && setState((s) => ({ data: s.data, error, loading: false })));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, live ? version : 0]);

  const setData = useCallback((fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })), []);
  return { ...state, reload, setData };
}

