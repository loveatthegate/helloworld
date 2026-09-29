import { useEffect, useState } from "react";
import { Play, Radio } from "lucide-react";
import { createCamera, deleteCamera, listCameras, type Camera } from "../lib/api";
import { CameraPreviewModal } from "../components/CameraPreviewModal";
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
  const [lng, setLng] = useState("");
  const [lat, setLat] = useState("");
  const [deviceKind, setDeviceKind] = useState("camera");
  const [streamProtocol, setStreamProtocol] = useState("rtsp");

  const refresh = () => listCameras().then(setRows).catch((e: Error) => setError(e.message));

  useEffect(() => {
    void refresh();
  }, []);

  const submit = async () => {
    setError(null);
    try {
      await createCamera({
        name,
        rtspUrl,
        previewUrl,
        role,
        mount: deviceKind === "drone" ? "mobile" : mount,
        lng: lng.trim() === "" ? null : Number(lng),
        lat: lat.trim() === "" ? null : Number(lat),
        deviceKind,
        streamProtocol,
      });
      setName("");
      setRtspUrl("");
      setPreviewUrl("");
      setLng("");
      setLat("");
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
                      {cam.deviceKind === "drone" ? " · 无人机" : cam.mount === "mobile" ? " · 移动" : " · 固定"}
                      {cam.streamProtocol === "gb28181" ? " · 国标（未接入）" : ""}
                      {Number.isFinite(cam.lng) && Number.isFinite(cam.lat)
                        ? ` · ${cam.lng?.toFixed(4)}, ${cam.lat?.toFixed(4)}`
                        : " · 无坐标（不上图）"}
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
        <label className="text-sm">
          设备
          <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={deviceKind} onChange={(e) => setDeviceKind(e.target.value)}>
            <option value="camera">摄像头</option>
            <option value="drone">无人机</option>
          </select>
        </label>
        <label className="text-sm">
          协议
          <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={streamProtocol} onChange={(e) => setStreamProtocol(e.target.value)}>
            <option value="rtsp">RTSP</option>
            <option value="gb28181">国标（未接入）</option>
          </select>
        </label>
        <label className="text-sm">
          经度（WGS84）
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="121.49" inputMode="decimal" />
        </label>
        <label className="text-sm">
          纬度（WGS84）
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="31.24" inputMode="decimal" />
        </label>
        <div className="md:col-span-2">
          <button type="submit" className="rounded-lg bg-teal px-4 py-2 text-sm text-white hover:bg-teal-2">
            添加点位
          </button>
        </div>
      </form>

      {preview && <CameraPreviewModal camera={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
