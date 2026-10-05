import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Api, getToken, setToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const data = await Api.me();
        if (!cancelled) setUser(data.user);
      } catch {
        setToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await Api.login(username, password);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await Api.logout();
    } catch {
      // 忽略退出接口错误，本地登录态照常清除
    }
    setToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const data = await Api.me();
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, refresh, setUser }), [user, loading, login, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
