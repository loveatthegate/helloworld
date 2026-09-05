import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  confirmLiveStep,
  dismissLiveSuggest,
  endLiveSession,
  getLiveSession,
  nextLiveSession,
  suggestLiveStep,
  uploadLiveFrame,
  type WorkSession,
} from "../lib/api";
import { useDemoStream } from "../lib/demo-stream";
import { VerdictBadge } from "../components/Badges";
import { usePageCrumbs } from "../components/Breadcrumb";
import { EmptyState } from "../components/EmptyState";

const MODE_LABEL: Record<string, string> = {
  sequential: "单次有序",
  batch: "批次轮转",
  patrol: "值守巡视",
};

function captureVideoFrame(video: HTMLVideoElement) {
  const w = Math.min(512, video.videoWidth || 480);
  const h = video.videoHeight ? Math.round((video.videoHeight / video.videoWidth) * w) : 288;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.62).split(",")[1] || null;
}

export function LiveWallPage() {
  const { id } = useParams();
  const sessionId = Number(id);
  const navigate = useNavigate();
  const [data, setData] = useState<WorkSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const startedAt = useRef(Date.now());

  useDemoStream(Boolean(data && (data.status === "live" || data.status === "watching") && (data.camera?.locked || data.camera?.rtspUrl?.includes("/demo"))));

  usePageCrumbs(
    data
      ? [
          { label: "工作台", to: "/" },
          { label: "实时核验", to: "/live/new" },
          { label: data.title || "监督墙" },
        ]
      : null,
  );

  const refresh = () =>
    getLiveSession(sessionId)
      .then(setData)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 2500);
    return () => clearInterval(t);
  }, [sessionId]);

  useEffect(() => {
    if (!data || (data.status !== "live" && data.status !== "watching")) return;
    const t = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      const b64 = captureVideoFrame(video);
      if (!b64) return;
      void uploadLiveFrame(sessionId, {
        dataBase64: b64,
        timestampSec: (Date.now() - startedAt.current) / 1000,
        cameraRole: data.camera?.role === "detail" ? "detail" : "global",
      });
    }, Math.max(3000, (data as WorkSession & { frames?: unknown[] }).frames ? 5000 : 5000));
    return () => clearInterval(t);
  }, [sessionId, data?.status, data?.camera?.role]);

  if (error) return <p className="p-6 text-rose-600">{error}</p>;
  if (!data) return <p className="p-6 text-slate-500">正在打开监督墙…</p>;

  const throughout = (data.items ?? []).filter((i) => i.phase === "throughout");
  const steps = (data.items ?? []).filter((i) => i.phase !== "throughout");
  const alerts = data.alerts ?? [];
  const workerUrl = `${window.location.origin}${data.workerPath}`;
  const preview = data.camera?.previewUrl;
  const live = data.status === "live" || data.status === "watching";
  const frames = data.frames ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#e8edf3]">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 bg-ink px-4 py-2.5 text-white lg:px-6">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold">
            第 {data.waveIndex} 波 · {data.status === "watching" ? "场间值守" : data.status === "live" ? "进行中" : "已结束"}
            <span className="ml-2 text-xs font-normal text-slate-400">{MODE_LABEL[data.mode] || data.mode}</span>
          </div>
          <div className="truncate text-xs text-slate-400">{data.title}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {live && data.mode !== "patrol" && (
            <button
              type="button"
              className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20"
              onClick={() => void confirmLiveStep(sessionId).then(setData)}
            >
              当前步确认
            </button>
          )}
          {live && (
            <button
              type="button"
              className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20"
              onClick={() =>
                void endLiveSession(sessionId).then((res) => {
                  if (res.watch) navigate(`/live/${res.watch.id}`);
                  else if (res.analysis) navigate(`/analyses/${res.analysis.id}`);
                  else void refresh();
                })
              }
            >
              结束本场
            </button>
          )}
          {(data.status === "completed" || data.status === "watching") && (
            <button
              type="button"
              className="rounded-lg bg-teal px-3 py-2 text-sm"
              onClick={() => void nextLiveSession(sessionId).then((s) => navigate(`/live/${s.id}`))}
            >
              下一场
            </button>
          )}
          {data.analysisId && (
            <Link to={`/analyses/${data.analysisId}`} className="rounded-lg bg-white/10 px-3 py-2 text-sm">
              查看报告
            </Link>
          )}
          {!data.suggestedStepOrder && (
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-xs text-slate-500 hover:text-white"
              onClick={() => void suggestLiveStep(sessionId, (data.currentStepOrder || 0) + 1)}
            >
              演示切段
            </button>
          )}
        </div>
      </div>

      {data.suggestedStepOrder ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 lg:px-6">
          <span>疑似进入第 {data.suggestedStepOrder} 步，确认后才锁定窗口。</span>
          <div className="flex gap-2">
            <button type="button" className="rounded-md bg-amber-900 px-3 py-1 text-white" onClick={() => void confirmLiveStep(sessionId, data.suggestedStepOrder!).then(setData)}>
              确认
            </button>
            <button type="button" className="rounded-md border border-amber-300 px-3 py-1" onClick={() => void dismissLiveSuggest(sessionId).then(setData)}>
              忽略
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section className="flex min-h-[46vh] min-w-0 flex-col bg-black lg:min-h-0">
          <div className="relative min-h-0 flex-1">
            {preview ? (
              <video ref={videoRef} src={preview} className="absolute inset-0 h-full w-full object-contain" autoPlay muted loop playsInline />
            ) : (
              <>
                <img
                  src={`/api/live/sessions/${sessionId}/snapshot`}
                  alt=""
                  className="absolute inset-0 h-full w-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                  {data.camera?.rtspUrl ? "正在从 RTSP 取流…" : "未配置预览地址，可在点位里填写 HTTP 视频或 RTSP"}
                </div>
              </>
            )}
            <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white">
              {data.camera?.name} · {data.camera?.mount === "mobile" ? "移动" : "固定"}
            </div>
            <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white">
              当前步 {data.currentStepOrder || "未开始"}
            </div>
          </div>
          {frames.length > 0 && (
            <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-white/10 bg-ink px-3 py-2">
              {frames.map((frame) => (
                <img key={frame.id} src={frame.url} alt="" className="h-14 w-20 shrink-0 rounded object-cover ring-1 ring-white/15" />
              ))}
            </div>
          )}
        </section>

        <aside className="flex min-h-0 flex-col gap-3 overflow-hidden border-t border-slate-200 bg-[#e8edf3] p-3 max-lg:min-h-[28rem] lg:border-l lg:border-t-0">
          {alerts.length > 0 && (
            <div className="shrink-0 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <div className="font-medium">禁则告警</div>
              {alerts.map((a) => (
                <div key={a.id}>{a.message}</div>
              ))}
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
            <div className="shrink-0 border-b border-slate-100 px-3 py-2 text-xs text-slate-400">全程 / 禁则</div>
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {throughout.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className={item.result?.verdict === "fail" ? "text-rose-700" : "text-ink"}>{item.title}</span>
                  <VerdictBadge verdict={item.result?.verdict} />
                </li>
              ))}
              {throughout.length === 0 && (
                <li>
                  <EmptyState compact flush title="暂无全程项" description="本手册没有全程 / 禁则检查项。" />
                </li>
              )}
            </ul>
          </div>
          <div className="flex min-h-[40%] flex-[1.4] flex-col overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
            <div className="shrink-0 border-b border-slate-100 px-3 py-2 text-xs text-slate-400">步骤</div>
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {steps.length === 0 && (
                <li>
                  <EmptyState compact flush title="暂无步骤" description="本手册没有分步检查项。" />
                </li>
              )}
              {steps.map((item) => (
                <li
                  key={item.id}
                  className={`rounded-lg px-3 py-2 text-sm ${item.phase === "current" ? "bg-teal/10 ring-1 ring-teal" : item.phase === "pending" ? "text-slate-400" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      {item.stepOrder}. {item.title}
                    </span>
                    <VerdictBadge verdict={item.result?.verdict} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="shrink-0 rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200">
            <div className="text-xs text-slate-400">作业端短链</div>
            <div className="mt-1 break-all text-xs text-teal">{workerUrl}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
