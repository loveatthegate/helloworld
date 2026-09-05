import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CircleHelp } from "lucide-react";
import { createLiveSession, listCameras, listLiveSessions, listSops, type Camera, type Sop } from "../lib/api";

function FieldLabel({ text, tip }: { text: string; tip: string }) {
  return (
    <span className="group relative inline-flex items-center gap-1.5 text-ink">
      {text}
      <CircleHelp size={14} className="cursor-help text-slate-400 group-hover:text-teal" aria-hidden />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-20 mt-1.5 w-72 rounded-lg bg-ink px-3 py-2 text-xs leading-5 text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
      >
        {tip}
      </span>
    </span>
  );
}

const MODES = [
  { id: "sequential", title: "单次有序作业", hint: "一拨人按步骤做完" },
  { id: "batch", title: "批次轮转作业", hint: "同一点位人一波接一波" },
  { id: "patrol", title: "值守巡视", hint: "盯全程、离岗与禁则" },
];

export function LiveStartPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [sops, setSops] = useState<Sop[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [sopId, setSopId] = useState(0);
  const [cameraId, setCameraId] = useState(0);
  const [detailCameraId, setDetailCameraId] = useState(0);
  const [mode, setMode] = useState("sequential");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listSops().then((list) => {
      const ready = list.filter((s) => s.status === "ready");
      setSops(ready);
      const fromQuery = Number(params.get("sopId") || 0);
      setSopId(ready.find((s) => s.id === fromQuery)?.id || ready[0]?.id || 0);
    });
    listCameras().then((list) => {
      setCameras(list);
      const last = Number(localStorage.getItem("lvzhi-last-camera") || 0);
      setCameraId(list.find((c) => c.id === last)?.id || list[0]?.id || 0);
      const detail = list.find((c) => c.role === "detail");
      if (detail) setDetailCameraId(detail.id);
    });
  }, []);

  const start = async () => {
    if (!sopId || !cameraId) {
      setError("请选择手册和点位");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem("lvzhi-last-camera", String(cameraId));
      const session = await createLiveSession({
        sopId,
        cameraId,
        detailCameraId: detailCameraId || undefined,
        mode,
      });
      navigate(`/live/${session.id}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "开场失败";
      setError(message);
      if (message.includes("进行中")) {
        const list = await listLiveSessions().catch(() => []);
        const live = list.find((s) => s.status === "live" || s.status === "watching");
        if (live) navigate(`/live/${live.id}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">实时核验</h1>
        <p className="mt-1 text-sm text-slate-500">选点位、选手册、选一种作业模式，然后开始本场。</p>
      </div>
      {error && <p className="text-rose-600">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="rounded-2xl bg-white p-5 text-sm ring-1 ring-slate-200">
          <FieldLabel text="点位" tip="本场主画面。一般选固定全局机，看人在不在、区域和全程状态。演示实时流是系统内置循环画面。" />
          <select className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2" value={cameraId} onChange={(e) => setCameraId(Number(e.target.value))}>
            {cameras.map((cam) => (
              <option key={cam.id} value={cam.id}>
                {cam.name}（{cam.role === "detail" ? "细节" : "全局"}）
              </option>
            ))}
          </select>
        </label>
        <label className="rounded-2xl bg-white p-5 text-sm ring-1 ring-slate-200">
          <FieldLabel text="细节机（可选）" tip="第二路近景机，用来看验电、挂牌等细动作。不绑定也能开场，只看主点位。拍不到的细节项记为无有效画面，不当成违规。" />
          <select className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2" value={detailCameraId} onChange={(e) => setDetailCameraId(Number(e.target.value))}>
            <option value={0}>不绑定</option>
            {cameras.filter((c) => c.id !== cameraId).map((cam) => (
              <option key={cam.id} value={cam.id}>
                {cam.name}
              </option>
            ))}
          </select>
        </label>
        <label className="rounded-2xl bg-white p-5 text-sm ring-1 ring-slate-200 md:col-span-2">
          <FieldLabel text="SOP手册" tip="本场对照的作业指导书。解析后的检查项会同时包含全程约束和分步要求，值班员开场不用再改规则。" />
          <select className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2" value={sopId} onChange={(e) => setSopId(Number(e.target.value))}>
            {sops.map((sop) => (
              <option key={sop.id} value={sop.id}>
                {sop.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setMode(item.id)}
            className={`rounded-2xl p-5 text-left ring-1 ${mode === item.id ? "bg-teal/5 ring-teal" : "bg-white ring-slate-200"}`}
          >
            <div className="font-medium text-ink">{item.title}</div>
            <div className="mt-1 text-sm text-slate-500">{item.hint}</div>
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void start()}
        className="rounded-lg bg-teal px-5 py-2.5 text-sm text-white hover:bg-teal-2 disabled:opacity-60"
      >
        {busy ? "正在开场…" : "开始本场"}
      </button>
    </div>
  );
}
