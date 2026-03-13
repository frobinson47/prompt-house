import { useState, useEffect, useCallback } from "react";
import { authApi, type AuthUser } from "../api";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null });

  const checkAuth = useCallback(async () => {
    try {
      const { user } = await authApi.getMe();
      setState({ user, loading: false, error: null });
    } catch {
      setState({ user: null, loading: false, error: null });
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = useCallback((returnTo?: string) => {
    const url = `/api/auth/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
    window.location.href = url;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setState({ user: null, loading: false, error: null });
  }, []);

  return { ...state, login, logout, refresh: checkAuth };
}
