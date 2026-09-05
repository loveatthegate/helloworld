import { useEffect, useState } from "react";
import { Play, Radio } from "lucide-react";
import { createCamera, deleteCamera, listCameras, type Camera } from "../lib/api";
import { useDemoStream } from "../lib/demo-stream";
import { EmptyState } from "../components/EmptyState";
import { useAuth } from "../lib/auth";

export function CamerasPage({ embedded = false }: { embedded?: boolean }) {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Camera[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Camera | null>(null);
  const [name, setName] = useState("");
  const [rtspUrl, setRtspUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [role, setRole] = useState("global");
  const [mount, setMount] = useState("fixed");

  useDemoStream(Boolean(preview && (preview.locked || preview.rtspUrl?.includes("/demo"))));

  const refresh = () => listCameras().then(setRows).catch((e: Error) => setError(e.message));

  useEffect(() => {
    void refresh();
  }, []);

  const submit = async () => {
    setError(null);
    try {
      await createCamera({ name, rtspUrl, previewUrl, role, mount });
      setName("");
      setRtspUrl("");
      setPreviewUrl("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    }
  };

  return (
    <div className="space-y-5">
      {!embedded && (
      <div>
        <h1 className="text-2xl font-semibold text-ink">点位管理</h1>
        <p className="mt-1 text-sm text-slate-500">点击卡片预览画面。系统演示实时流不可删除，开场时可直接选用。</p>
      </div>
      )}
      {error && <p className="text-rose-600">{error}</p>}

      {rows.length === 0 && (
        <EmptyState title="暂无点位" description="添加现场摄像头后，实时核验开场时可直接选用。" />
      )}
      <ul className="grid gap-3 md:grid-cols-2">
        {rows.map((cam) => (
          <li key={cam.id}>
            <button
              type="button"
              onClick={() => setPreview(cam)}
              className="w-full rounded-2xl bg-white p-4 text-left ring-1 ring-slate-200 transition hover:ring-teal"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal/10 text-teal">
                    <Radio size={18} />
                  </div>
                  <div>
                    <div className="font-medium text-ink">{cam.name}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {cam.locked ? "系统内置 · 循环 RTSP" : cam.role === "detail" ? "看细节" : "看全局"}
                      {cam.mount === "mobile" ? " · 移动" : " · 固定"}
                    </div>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-teal/10 px-2 py-1 text-xs text-teal">
                  <Play size={12} /> 预览
                </span>
              </div>
            </button>
            {isAdmin && !cam.locked && (
              <button
                type="button"
                className="mt-1 text-xs text-rose-600"
                onClick={() => void deleteCamera(cam.id).then(refresh)}
              >
                删除
              </button>
            )}
          </li>
        ))}
      </ul>

      <form
        className="grid gap-3 rounded-2xl bg-white p-5 ring-1 ring-slate-200 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="text-sm font-medium text-ink md:col-span-2">添加现场点位</div>
        <label className="text-sm">
          名称
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="text-sm">
          RTSP 地址
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={rtspUrl} onChange={(e) => setRtspUrl(e.target.value)} placeholder="rtsp://..." />
        </label>
        <label className="text-sm md:col-span-2">
          预览地址
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} />
        </label>
        <label className="text-sm">
          看什么
          <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="global">看全局</option>
            <option value="detail">看细节</option>
          </select>
        </label>
        <label className="text-sm">
          安装
          <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={mount} onChange={(e) => setMount(e.target.value)}>
            <option value="fixed">固定</option>
            <option value="mobile">移动</option>
          </select>
        </label>
        <div className="md:col-span-2">
          <button type="submit" className="rounded-lg bg-teal px-4 py-2 text-sm text-white hover:bg-teal-2">
            添加点位
          </button>
        </div>
      </form>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPreview(null)}>
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-ink shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 text-white">
              <div>
                <div className="font-medium">{preview.name}</div>
                <div className="text-xs text-slate-400">{preview.locked ? "系统演示实时流 · 循环播放" : preview.rtspUrl || "预览"}</div>
              </div>
              <button type="button" className="text-sm text-slate-300 hover:text-white" onClick={() => setPreview(null)}>
                关闭
              </button>
            </div>
            <video
              key={preview.id}
              src={preview.previewUrl || "/samples/demo.mp4"}
              className="aspect-video w-full bg-black"
              controls
              autoPlay
              muted
              loop
              playsInline
            />
          </div>
        </div>
      )}
    </div>
  );
}
