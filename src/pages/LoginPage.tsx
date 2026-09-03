import { useState } from "react";
import { Navigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eef2f6] px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal/10 text-teal">
            <ShieldCheck />
          </div>
          <div>
            <div className="text-lg font-semibold text-ink">履职系统</div>
            <div className="text-xs text-slate-500">请登录后使用手册核验与视频分析</div>
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
      </div>
    </div>
  );
}
