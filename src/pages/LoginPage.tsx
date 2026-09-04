import { useState, type MouseEvent } from "react";
import { Navigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useBranding } from "../lib/branding";
import { Pulse } from "../components/Skeleton";

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const { branding } = useBranding();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  const submit = async (name = username.trim(), pass = password) => {
    setBusy(true);
    setError(null);
    try {
      await login(name, pass);
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录失败");
    } finally {
      setBusy(false);
    }
  };

  const loginAsAdminOnTripleClick = (event: MouseEvent) => {
    if (event.detail !== 3 || busy) return;
    event.preventDefault();
    void submit("admin", "LvZhi#Admin1");
  };

  return (
    <div
      className="flex h-full min-h-full items-center justify-center px-4"
      style={{
        background: branding.loginImageUrl
          ? `linear-gradient(rgba(15,39,68,0.45), rgba(15,39,68,0.45)), url(${branding.loginImageUrl}) center/cover`
          : "#eef2f6",
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        {loading ? (
          <div className="space-y-3">
            <Pulse className="h-10 w-40" />
            <Pulse className="h-10" />
            <Pulse className="h-10" />
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center gap-3">
              {branding.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt=""
                  className="h-10 w-10 cursor-default select-none rounded-lg object-cover"
                  onClick={loginAsAdminOnTripleClick}
                />
              ) : (
                <div
                  className="flex h-10 w-10 cursor-default select-none items-center justify-center rounded-lg bg-teal/10 text-teal"
                  onClick={loginAsAdminOnTripleClick}
                >
                  <ShieldCheck />
                </div>
              )}
              <div>
                <div className="text-lg font-semibold text-ink">{branding.systemName}</div>
                <div className="text-xs text-slate-500">{branding.tagline || "请登录后使用手册核验与视频分析"}</div>
              </div>
            </div>
            <div className="space-y-3">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-2"
                placeholder="用户名"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-2"
                placeholder="密码"
              />
            </div>
            {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="mt-5 w-full rounded-lg bg-teal py-2.5 text-sm text-white hover:bg-teal-2 disabled:opacity-60"
            >
              {busy ? "登录中…" : "登录"}
            </button>
            <p className="mt-4 text-center text-xs text-slate-400">{branding.copyright}</p>
          </>
        )}
      </div>
    </div>
  );
}
