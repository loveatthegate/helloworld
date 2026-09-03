import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileDrop } from "../components/FileDrop";
import { ModelSelect } from "../components/ModelSelect";
import { api, getSettings, listSops, type Settings, type Sop } from "../lib/api";
import { extractFrames } from "../lib/extractFrames";

export function AnalysisNewPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sops, setSops] = useState<Sop[]>([]);
  const [sopId, setSopId] = useState(Number(params.get("sopId") || 0));
  const [file, setFile] = useState<File | null>(null);
  const [intervalSec, setIntervalSec] = useState(2);
  const [maxFrames, setMaxFrames] = useState(30);
  const [model, setModel] = useState("gemini-2.5-flash");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([getSettings(), listSops()]).then(([s, list]) => {
      setSettings(s);
      setSops(list.filter((item) => item.status === "ready"));
      setModel(s.defaultModel);
      setIntervalSec(s.frameIntervalSec);
      setMaxFrames(s.maxFrames);
      if (!sopId && list.find((i) => i.status === "ready")) {
        setSopId(list.find((i) => i.status === "ready")!.id);
      }
    });
  }, []);

  const readySops = useMemo(() => sops.filter((s) => s.status === "ready"), [sops]);

  const submit = async () => {
    if (!sopId) {
      setError("请选择已解析完成的 SOP");
      return;
    }
    if (!file) {
      setError("请上传作业视频");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setProgress("正在按设定间隔抽帧…");
      const { frames, duration } = await extractFrames(file, intervalSec, maxFrames, (done, total) => {
        setProgress(`抽帧 ${done}/${total}`);
      });
      if (!frames.length) throw new Error("没有抽出任何帧");

      setProgress("创建分析任务…");
      const created = await api<{ id: number }>("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sopId,
          videoFilename: file.name,
          videoDurationSec: duration,
          frameIntervalSec: intervalSec,
          maxFrames,
          model,
        }),
      });

      if (file.size <= 5.5 * 1024 * 1024) {
        setProgress("保存原始视频（小于 5.5MB）…");
        const form = new FormData();
        form.set("file", file);
        await api(`/api/analyses/${created.id}/video`, { method: "POST", body: form });
      }

      const batchSize = 4;
      for (let i = 0; i < frames.length; i += batchSize) {
        const batch = frames.slice(i, i + batchSize);
        setProgress(`上传抽帧 ${Math.min(i + batch.length, frames.length)}/${frames.length}`);
        await api(`/api/analyses/${created.id}/frames`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            frames: batch.map((f) => ({
              index: f.index,
              timestampSec: f.timestampSec,
              mimeType: f.mimeType,
              dataBase64: f.dataBase64,
            })),
          }),
        });
      }

      setProgress("启动视觉模型分析…");
      await api(`/api/analyses/${created.id}/analyze`, { method: "POST" });
      navigate(`/analyses/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "分析失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">上传作业视频</h1>
        <p className="mt-1 text-sm text-slate-500">
          浏览器按抽帧间隔截取画面后发给视觉模型。演示默认最多 {settings?.maxFrames ?? 30} 帧，用于验证 VLM 可行性。
        </p>
      </div>
      <FileDrop accept="video/mp4,video/webm,video/quicktime" label="拖入或选择作业视频" hint="推荐 MP4 / WebM" file={file} onFile={setFile} />
      <div className="grid gap-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">对照 SOP</span>
          <select
            value={sopId || ""}
            onChange={(e) => setSopId(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-2"
          >
            <option value="">请选择已解析手册</option>
            {readySops.map((sop) => (
              <option key={sop.id} value={sop.id}>
                {sop.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">抽帧间隔（秒）</span>
          <select
            value={intervalSec}
            onChange={(e) => setIntervalSec(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-2"
          >
            {[0.5, 1, 2, 3, 5].map((n) => (
              <option key={n} value={n}>
                每 {n} 秒一帧
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">最大帧数</span>
          <input
            type="number"
            min={4}
            max={60}
            value={maxFrames}
            onChange={(e) => setMaxFrames(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">视觉模型</span>
          <ModelSelect models={settings?.availableModels ?? []} value={model} onChange={setModel} />
        </label>
      </div>
      {progress && <p className="text-sm text-teal">{progress}</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="rounded-lg bg-teal px-5 py-2.5 text-sm text-white hover:bg-teal-2 disabled:opacity-60"
      >
        {busy ? "处理中…" : "开始抽帧分析"}
      </button>
    </div>
  );
}
