import { useDemoStream } from "../lib/demo-stream";
import type { Camera } from "../lib/api";

export function CameraPreviewModal({ camera, onClose }: { camera: Camera; onClose: () => void }) {
  const gb = camera.streamProtocol === "gb28181";
  useDemoStream(Boolean(!gb && (camera.locked || camera.rtspUrl?.includes("/demo"))));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-ink shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 text-white">
          <div>
            <div className="font-medium">{camera.name}</div>
            <div className="text-xs text-slate-400">
              {camera.deviceKind === "drone" ? "无人机" : camera.mount === "mobile" ? "移动点位" : "固定点位"}
              {camera.streamProtocol === "gb28181" ? " · 国标（未接入）" : camera.locked ? " · 系统演示实时流" : ""}
            </div>
          </div>
          <button type="button" className="text-sm text-slate-300 hover:text-white" onClick={onClose}>
            关闭
          </button>
        </div>
        {gb ? (
          <div className="flex aspect-video items-center justify-center bg-black px-8 text-center text-sm text-slate-300">
            国标 GB28181 本期未接入。请改用 RTSP 或演示视频预览。
          </div>
        ) : (
          <video
            key={camera.id}
            src={camera.previewUrl || "/samples/demo.mp4"}
            className="aspect-video w-full bg-black"
            controls
            autoPlay
            muted
            loop
            playsInline
          />
        )}
      </div>
    </div>
  );
}
