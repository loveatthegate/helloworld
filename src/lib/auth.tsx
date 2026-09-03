import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getMe, login as loginApi, logout as logoutApi, type AuthUser } from "./api";

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  isAdmin: boolean;
  defaults: { frameIntervalSec: number; maxFrames: number; intervals: number[] };
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const fallbackDefaults = { frameIntervalSec: 5, maxFrames: 30, intervals: [3, 5, 10] };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [defaults, setDefaults] = useState(fallbackDefaults);

  const refresh = async () => {
    try {
      const me = await getMe();
      setUser(me.user);
      setDefaults(me.defaults);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const login = async (username: string, password: string) => {
    const result = await loginApi(username, password);
    setUser(result.user);
    await refresh();
  };

  const logout = async () => {
    await logoutApi().catch(() => undefined);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin: user?.role === "super_admin",
        defaults,
        login,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return ctx;
}
