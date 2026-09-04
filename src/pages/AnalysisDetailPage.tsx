import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, getAnalysis, skipAnalysisItem } from "../lib/api";
import { formatDate, formatTime, verdictLabel } from "../lib/format";
import { ResultText, StatusBadge, VerdictBadge } from "../components/Badges";
import { Lightbox } from "../components/Lightbox";
import { Breadcrumb } from "../components/Breadcrumb";
import { PageSkeleton } from "../components/Skeleton";
import { useAuth } from "../lib/auth";

export function AnalysisDetailPage() {
  const { id } = useParams();
  const analysisId = Number(id);
  const { isAdmin } = useAuth();
  const [data, setData] = useState<Awaited<ReturnType<typeof getAnalysis>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [skipping, setSkipping] = useState<number | null>(null);

  const refresh = () =>
    getAnalysis(analysisId)
      .then(setData)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void refresh();
  }, [analysisId]);

  useEffect(() => {
    if (!data) return;
    if (data.status === "completed" || data.status === "failed") return;
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [data?.status, analysisId]);

  const counts = useMemo(() => {
    const init = { pass: 0, fail: 0, uncertain: 0, not_observed: 0, skipped: 0 };
    for (const item of data?.items ?? []) {
      const v = item.result?.verdict as keyof typeof init | undefined;
      if (v && v in init) init[v] += 1;
    }
    return init;
  }, [data]);

  if (error) return <p className="text-rose-600">{error}</p>;
  if (!data) return <PageSkeleton variant="detail" />;

  const total = data.items.length || 1;
  const finished = data.items.filter((item) => item.result).length;
  const passRate = Math.round((counts.pass / total) * 100);
  const analyzing = data.status === "analyzing" || data.status === "uploading";
  const currentItem = data.items.find((item) => !item.result);
  const percent = Math.round((finished / total) * 100);
  const waitedSec = data.progressUpdatedAt
    ? Math.max(0, Math.round((Date.now() - new Date(data.progressUpdatedAt).getTime()) / 1000))
    : 0;

  return (
    <div className="space-y-6">
      {preview && <Lightbox src={preview} onClose={() => setPreview(null)} />}
      <Breadcrumb
        items={[
          { label: "工作台", to: "/" },
          { label: "履职分析", to: "/analyses" },
          { label: data.title },
        ]}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-ink">{data.title}</h1>
            <StatusBadge status={data.status} />
          </div>
          <p className="mt-2 text-sm text-slate-600">{data.overallSummary}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
            <span>
              手册：
              {data.sopDeleted ? (
                <span>
                  {data.sop?.title || "已删除的手册"}
                  <span className="ml-1 text-amber-700">（手册已删除，报告仍保留）</span>
                </span>
              ) : (
                <Link className="text-teal" to={`/sops/${data.sopId}`}>
                  {data.sop?.title}
                </Link>
              )}
            </span>
            <span>{data.sourceType === "images" ? "现场照片" : "作业视频"}</span>
            {isAdmin && data.modelUsed && <span>模型 {data.modelUsed}</span>}
            {data.sourceType !== "images" && <span>抽帧每 {data.frameIntervalSec}s</span>}
            <span>{data.frames.length} 张画面</span>
            <span>{formatDate(data.createdAt)}</span>
          </div>
        </div>
        <div className="rounded-2xl bg-white px-5 py-4 text-right ring-1 ring-slate-200">
          <div className="text-xs text-slate-500">总体结论</div>
          <div className="mt-1 text-lg">
            <ResultText result={data.overallResult} />
          </div>
          <div className="text-sm text-slate-500">满足率 {data.status === "completed" ? `${passRate}%` : "—"}</div>
          {(data.status === "completed" || data.status === "failed") && !data.sopDeleted && (
            <button
              type="button"
              className="mt-3 text-xs text-teal"
              onClick={() => void api(`/api/analyses/${data.id}/analyze`, { method: "POST" }).then(() => refresh())}
            >
              重新分析
            </button>
          )}
        </div>
      </div>

      {analyzing && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-medium text-amber-950">
                {data.status === "uploading" ? "画面已上传，正在启动分析" : "正在逐项分析"}
              </div>
              <p className="mt-1 text-sm text-amber-900">
                {data.progressMessage ||
                  (data.frames.length
                    ? `抽帧已完成（${data.frames.length} 张），模型正在对照 SOP 步骤。`
                    : "正在准备画面…")}
              </p>
              {currentItem && <p className="mt-1 text-xs text-amber-800">当前步骤：{currentItem.title}</p>}
              <p className="mt-1 text-xs text-amber-800">
                {data.stalled
                  ? "后台已超过 90 秒没有心跳，任务可能已中断，不是抽帧失败。"
                  : waitedSec > 0
                    ? `距上次进度更新 ${waitedSec} 秒。快速分析通常几十秒出第一步结论。`
                    : "已提交模型，等待返回。"}
              </p>
            </div>
            <div className="text-sm text-amber-900">
              {finished}/{total} 步
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-amber-200">
            <div className="h-full bg-teal transition-all" style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {currentItem && (
              <button
                type="button"
                disabled={skipping === currentItem.id}
                className="rounded-lg bg-white px-3 py-1.5 text-sm text-amber-950 ring-1 ring-amber-300 hover:bg-amber-100"
                onClick={() => {
                  setSkipping(currentItem.id);
                  void skipAnalysisItem(data.id, currentItem.id)
                    .then(() => refresh())
                    .finally(() => setSkipping(null));
                }}
              >
                {skipping === currentItem.id ? "跳过中…" : `跳过「${currentItem.title}」`}
              </button>
            )}
            {data.stalled && !data.sopDeleted && (
              <button
                type="button"
                className="rounded-lg bg-teal px-3 py-1.5 text-sm text-white"
                onClick={() => void api(`/api/analyses/${data.id}/analyze`, { method: "POST" }).then(() => refresh())}
              >
                继续分析剩余步骤
              </button>
            )}
          </div>
        </section>
      )}

      {data.videoUrl && data.sourceType !== "images" && (
        <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <h2 className="mb-3 font-medium">视频回放</h2>
          <video src={data.videoUrl} controls preload="none" className="max-h-[420px] w-full rounded-lg bg-black" />
        </section>
      )}

      {data.status === "failed" && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{data.errorMessage}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-5">
        {(
          [
            ["pass", counts.pass],
            ["fail", counts.fail],
            ["uncertain", counts.uncertain],
            ["not_observed", counts.not_observed],
            ["skipped", counts.skipped],
          ] as const
        ).map(([key, n]) => (
          <div key={key} className="rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200">
            <div className="text-xs text-slate-500">{verdictLabel[key]}</div>
            <div className="text-2xl font-semibold text-ink">{n}</div>
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-3 font-medium">{data.sourceType === "images" ? "现场照片" : "抽帧时间轴"}</h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {data.frames.map((frame) => (
            <figure key={frame.id} className="w-36 shrink-0">
              <button type="button" onClick={() => setPreview(frame.url)}>
                <img src={frame.url} alt="" loading="lazy" className="h-24 w-36 rounded-lg object-cover ring-1 ring-slate-200" />
              </button>
              <figcaption className="mt-1 text-center text-xs text-slate-500">
                {data.sourceType === "images" ? `照片 ${frame.frameIndex + 1}` : formatTime(frame.timestampSec)}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-medium">逐项结论</h2>
        {data.items.map((item) => {
          const pending = !item.result && analyzing;
          return (
            <article key={item.id} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-teal">
                    步骤 {item.stepOrder} {item.category ? `· ${item.category}` : ""}
                  </div>
                  <h3 className="mt-1 font-medium text-ink">{item.title}</h3>
                </div>
                <VerdictBadge verdict={item.result?.verdict} />
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {item.result?.reasoning || (pending ? "等待模型返回该步骤结论…" : item.description)}
              </p>
              {pending && (
                <button
                  type="button"
                  disabled={skipping === item.id}
                  className="mt-3 text-sm text-teal"
                  onClick={() => {
                    setSkipping(item.id);
                    void skipAnalysisItem(data.id, item.id)
                      .then(() => refresh())
                      .finally(() => setSkipping(null));
                  }}
                >
                  {skipping === item.id ? "跳过中…" : "跳过此步骤"}
                </button>
              )}
              {item.evidence.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.evidence.map((frame) => (
                    <button type="button" key={frame.id} onClick={() => setPreview(frame.url)}>
                      <img src={frame.url} alt="证据" className="h-20 w-28 rounded-md object-cover ring-1 ring-slate-200" />
                    </button>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
