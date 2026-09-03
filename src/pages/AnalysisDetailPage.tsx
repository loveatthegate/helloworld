import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getAnalysis, api } from "../lib/api";
import { formatDate, formatTime, verdictLabel } from "../lib/format";
import { ResultText, StatusBadge, VerdictBadge } from "../components/Badges";
import { Lightbox } from "../components/Lightbox";
import { useAuth } from "../lib/auth";

export function AnalysisDetailPage() {
  const { id } = useParams();
  const analysisId = Number(id);
  const { isAdmin } = useAuth();
  const [data, setData] = useState<Awaited<ReturnType<typeof getAnalysis>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

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
    const init = { pass: 0, fail: 0, uncertain: 0, not_observed: 0 };
    for (const item of data?.items ?? []) {
      const v = item.result?.verdict as keyof typeof init | undefined;
      if (v && v in init) init[v] += 1;
    }
    return init;
  }, [data]);

  if (error) return <p className="text-rose-600">{error}</p>;
  if (!data) return <p className="text-slate-500">加载报告…</p>;

  const total = data.items.length || 1;
  const passRate = Math.round((counts.pass / total) * 100);

  return (
    <div className="space-y-6">
      {preview && <Lightbox src={preview} onClose={() => setPreview(null)} />}
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
              <Link className="text-teal" to={`/sops/${data.sopId}`}>
                {data.sop?.title}
              </Link>
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
          {(data.status === "completed" || data.status === "failed") && (
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

      {data.videoUrl && data.sourceType !== "images" && (
        <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <h2 className="mb-3 font-medium">视频回放</h2>
          <video src={data.videoUrl} controls className="max-h-[420px] w-full rounded-lg bg-black" />
        </section>
      )}

      {data.status === "failed" && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{data.errorMessage}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        {(
          [
            ["pass", counts.pass],
            ["fail", counts.fail],
            ["uncertain", counts.uncertain],
            ["not_observed", counts.not_observed],
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
                <img src={frame.url} alt="" className="h-24 w-36 rounded-lg object-cover ring-1 ring-slate-200" />
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
        {data.items.map((item) => (
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
            <p className="mt-2 text-sm text-slate-600">{item.result?.reasoning || item.description}</p>
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
        ))}
      </section>
    </div>
  );
}
