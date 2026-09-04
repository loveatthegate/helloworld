import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getBranding, getMe, login as loginApi, logout as logoutApi, type AuthUser, type Branding } from "./api";
import { useBranding } from "./branding";

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
  const { apply, refresh: refreshBranding } = useBranding();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [defaults, setDefaults] = useState(fallbackDefaults);

  const applySession = (payload: {
    user: AuthUser;
    defaults?: { frameIntervalSec: number; maxFrames: number; intervals: number[] };
    branding?: Branding;
  }) => {
    setUser(payload.user);
    if (payload.defaults) setDefaults(payload.defaults);
    if (payload.branding) apply(payload.branding);
  };

  const refresh = async () => {
    try {
      const me = await getMe();
      applySession(me);
    } catch {
      setUser(null);
      await refreshBranding();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const login = async (username: string, password: string) => {
    const result = await loginApi(username, password);
    applySession(result);
    setLoading(false);
  };

  const logout = async () => {
    await logoutApi().catch(() => undefined);
    setUser(null);
    try {
      apply(await getBranding());
    } catch {
      // keep last branding
    }
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
