import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getWorkSession, workConfirmStep, workEndSession, type WorkSession } from "../lib/api";
import { useBranding } from "../lib/branding";

export function WorkerPage() {
  const { branding } = useBranding();
  const { token } = useParams();
  const [data, setData] = useState<WorkSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    if (!token) return;
    getWorkSession(token).then(setData).catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, [token]);

  if (error) return <div className="p-6 text-rose-600">{error}</div>;
  if (!data) return <div className="p-6 text-slate-500">正在连接本场…</div>;

  const steps = (data.items ?? []).filter((i) => i.scope === "step" || i.phase === "current" || i.phase === "pending" || i.phase === "done");
  const next = (data.currentStepOrder || 0) + 1;
  const current = steps.find((i) => i.stepOrder === data.currentStepOrder);
  const upcoming = steps.find((i) => i.stepOrder === next);

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-between bg-white px-5 pb-14 pt-8">
      <div>
        <div className="text-sm text-slate-500">第 {data.waveIndex} 波</div>
        <h1 className="mt-1 text-2xl font-semibold text-ink">{data.sop?.title || data.title}</h1>
        <p className="mt-2 text-slate-600">{current ? `当前：${current.title}` : "等待进入第一步"}</p>
      </div>
      <div className="space-y-3">
        {data.status !== "live" && <p className="text-center text-slate-500">本场已结束</p>}
        {data.status === "live" && upcoming && (
          <button
            type="button"
            disabled={busy}
            className="w-full rounded-2xl bg-teal py-5 text-xl text-white"
            onClick={() => {
              setBusy(true);
              void workConfirmStep(token!, upcoming.stepOrder).then(setData).finally(() => setBusy(false));
            }}
          >
            第 {upcoming.stepOrder} 步开始
          </button>
        )}
        {data.status === "live" && current && upcoming && (
          <button
            type="button"
            disabled={busy}
            className="w-full rounded-2xl bg-ink py-5 text-xl text-white"
            onClick={() => {
              setBusy(true);
              void workConfirmStep(token!, upcoming.stepOrder).then(setData).finally(() => setBusy(false));
            }}
          >
            本步完成
          </button>
        )}
        {data.status === "live" && (
          <button
            type="button"
            disabled={busy}
            className="w-full rounded-2xl border border-slate-300 py-4 text-lg"
            onClick={() => {
              setBusy(true);
              void workEndSession(token!).then(setData).finally(() => setBusy(false));
            }}
          >
            本场结束
          </button>
        )}
      </div>
      <footer className="fixed bottom-0 left-0 px-5 py-3 text-xs text-slate-400">{branding.copyright}</footer>
    </div>
  );
}
