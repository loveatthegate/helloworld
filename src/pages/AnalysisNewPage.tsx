import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileDrop } from "../components/FileDrop";
import { ModelSelect } from "../components/ModelSelect";
import { api, getSettings, listSops, type Settings, type Sop } from "../lib/api";
import { useAuth } from "../lib/auth";
import { extractFrames } from "../lib/extractFrames";
import { fileToJpegBase64, uploadVideoChunks } from "../lib/images";

export function AnalysisNewPage() {
  const navigate = useNavigate();
  const { isAdmin, defaults } = useAuth();
  const [params] = useSearchParams();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sops, setSops] = useState<Sop[]>([]);
  const [sopId, setSopId] = useState(Number(params.get("sopId") || 0));
  const [sourceType, setSourceType] = useState<"video" | "images">("video");
  const [file, setFile] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [intervalSec, setIntervalSec] = useState(defaults.frameIntervalSec || 5);
  const [maxFrames, setMaxFrames] = useState(defaults.maxFrames || 30);
  const [model, setModel] = useState("gemini-3.1-flash-image");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listSops().then((list) => {
      setSops(list.filter((item) => item.status === "ready"));
      if (!sopId && list.find((i) => i.status === "ready")) {
        setSopId(list.find((i) => i.status === "ready")!.id);
      }
    });
    if (isAdmin) {
      getSettings()
        .then((s) => {
          setSettings(s);
          setModel(s.availableModels.some((m) => m.id === "gemini-3.1-flash-image") ? "gemini-3.1-flash-image" : s.modelName || s.defaultModel);
          setIntervalSec(s.frameIntervalSec);
          setMaxFrames(s.maxFrames);
        })
        .catch(() => undefined);
    } else {
      setIntervalSec(defaults.frameIntervalSec);
      setMaxFrames(defaults.maxFrames);
    }
  }, [isAdmin, defaults.frameIntervalSec, defaults.maxFrames]);

  const readySops = useMemo(() => sops.filter((s) => s.status === "ready"), [sops]);

  const submit = async () => {
    if (!sopId) {
      setError("请选择已解析完成的 SOP");
      return;
    }
    if (sourceType === "video" && !file) {
      setError("请上传作业视频");
      return;
    }
    if (sourceType === "images" && images.length === 0) {
      setError("请上传至少一张现场照片");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let frames: Array<{ index: number; timestampSec: number; mimeType: string; dataBase64: string }> = [];
      let duration = 0;
      let filename = "";
      if (sourceType === "video" && file) {
        filename = file.name;
        setProgress("正在按设定间隔抽帧…");
        const extracted = await extractFrames(file, intervalSec, maxFrames, (done, total) => {
          setProgress(`抽帧 ${done}/${total}`);
        });
        frames = extracted.frames;
        duration = extracted.duration;
      } else {
        filename = `${images.length} 张现场照片`;
        setProgress("正在处理现场照片…");
        for (let i = 0; i < images.length; i++) {
          frames.push({
            index: i,
            timestampSec: i,
            mimeType: "image/jpeg",
            dataBase64: await fileToJpegBase64(images[i]!),
          });
          setProgress(`处理照片 ${i + 1}/${images.length}`);
        }
      }
      if (!frames.length) throw new Error("没有可用画面");

      setProgress("创建分析任务…");
      const created = await api<{ id: number }>("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sopId,
          sourceType,
          videoFilename: filename,
          videoDurationSec: duration || undefined,
          frameIntervalSec: intervalSec,
          maxFrames: sourceType === "images" ? Math.max(frames.length, 1) : maxFrames,
          model: isAdmin ? model : undefined,
        }),
      });

      const videoUpload =
        sourceType === "video" && file && file.size <= 12 * 1024 * 1024
          ? uploadVideoChunks(created.id, file, setProgress).catch(() => undefined)
          : Promise.resolve();

      setProgress(`上传画面 ${frames.length} 张…`);
      await api(`/api/analyses/${created.id}/frames`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames }),
      });

      setProgress("启动分析…");
      await api(`/api/analyses/${created.id}/analyze`, { method: "POST" });
      navigate(`/analyses/${created.id}`);
      void videoUpload;
    } catch (e) {
      setError(e instanceof Error ? e.message : "分析失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">回放核验</h1>
        <p className="mt-1 text-sm text-slate-500">可上传作业视频（按间隔抽帧）或一张/多张现场照片，全部对照 SOP 各步骤检测。</p>
      </div>
      <div className="flex rounded-xl bg-white p-1 ring-1 ring-slate-200">
        <button
          type="button"
          onClick={() => setSourceType("video")}
          className={`flex-1 rounded-lg py-2 text-sm ${sourceType === "video" ? "bg-ink text-white" : "text-slate-600"}`}
        >
          上传视频
        </button>
        <button
          type="button"
          onClick={() => setSourceType("images")}
          className={`flex-1 rounded-lg py-2 text-sm ${sourceType === "images" ? "bg-ink text-white" : "text-slate-600"}`}
        >
          上传图片
        </button>
      </div>
      {sourceType === "video" ? (
        <FileDrop
          accept="video/mp4,video/webm,video/quicktime"
          label="拖入或选择作业视频"
          hint="推荐 MP4 / WebM。大于 12MB 只保留抽帧，不上传原片，分析更快"
          file={file}
          onFile={(next) => setFile(next)}
        />
      ) : (
        <FileDrop
          accept="image/png,image/jpeg,image/webp"
          label="拖入或选择一张/多张现场照片"
          hint="所有照片都会对照每一个 SOP 步骤"
          multiple
          files={images}
          onFiles={setImages}
        />
      )}
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
        {sourceType === "video" && (
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">抽帧间隔</span>
            <select
              value={intervalSec}
              onChange={(e) => setIntervalSec(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-2"
            >
              {[3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  每 {n} 秒一帧
                </option>
              ))}
            </select>
          </label>
        )}
        {isAdmin && (
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">视觉模型</span>
            <ModelSelect models={settings?.availableModels ?? []} value={model} onChange={setModel} />
          </label>
        )}
      </div>
      {progress && <p className="text-sm text-teal">{progress}</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="rounded-lg bg-teal px-5 py-2.5 text-sm text-white hover:bg-teal-2 disabled:opacity-60"
      >
        {busy ? "处理中…" : "开始分析"}
      </button>
    </div>
  );
}
