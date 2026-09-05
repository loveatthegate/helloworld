import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileVideo, LayoutGrid, List, Radio } from "lucide-react";
import { deleteAnalysis, listAnalyses, type Analysis } from "../lib/api";
import { formatDate } from "../lib/format";
import { ResultText, StatusBadge } from "../components/Badges";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/Skeleton";
import { useAuth } from "../lib/auth";

export function AnalysisListPage() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Analysis[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"list" | "card">("card");
  const [kind, setKind] = useState<"all" | "video" | "live">("all");
  const [pending, setPending] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => listAnalyses().then(setRows).catch((e: Error) => setError(e.message));

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return null;
    if (kind === "live") return rows.filter((row) => row.sourceType === "rtsp");
    if (kind === "video") return rows.filter((row) => row.sourceType !== "rtsp");
    return rows;
  }, [rows, kind]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">核验报告</h1>
          <p className="mt-1 text-sm text-slate-500">支持作业视频抽帧或现场照片，逐项对照 SOP 并生成可回溯报告。</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-1">
            {(
              [
                { id: "all", label: "全部" },
                { id: "video", label: "视频" },
                { id: "live", label: "实时" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setKind(item.id)}
                className={`rounded-md px-2.5 py-1 text-sm ${kind === item.id ? "bg-ink text-white" : "text-slate-500 hover:text-ink"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setMode("card")}
              className={`rounded-md px-2 py-1 ${mode === "card" ? "bg-slate-100 text-ink" : "text-slate-500"}`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              onClick={() => setMode("list")}
              className={`rounded-md px-2 py-1 ${mode === "list" ? "bg-slate-100 text-ink" : "text-slate-500"}`}
            >
              <List size={16} />
            </button>
          </div>
          <Link to="/analyses/new" className="inline-flex items-center gap-1.5 rounded-lg bg-teal px-4 py-2 text-sm text-white hover:bg-teal-2">
            <FileVideo size={16} /> 回放核验
          </Link>
          <Link to="/live/new" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">
            <Radio size={16} /> 实时核验
          </Link>
        </div>
      </div>
      {error && <p className="text-rose-600">{error}</p>}
      {!rows && !error && <PageSkeleton variant="cards" />}
      {filtered && filtered.length === 0 && (
        <EmptyState
          title={kind === "all" ? "暂无报告" : "当前筛选下暂无报告"}
          description={
            kind === "live"
              ? "还没有实时核验报告。开一场实时核验后会在这里出现。"
              : "回放作业视频或现场照片，对照 SOP 生成可回溯核验报告。"
          }
          action={
            <Link
              to={kind === "live" ? "/live/new" : "/analyses/new"}
              className="rounded-lg bg-teal px-4 py-2 text-sm text-white hover:bg-teal-2"
            >
              {kind === "live" ? "去实时核验" : "去回放核验"}
            </Link>
          }
        />
      )}
      {mode === "card" && filtered && filtered.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((row) => (
            <div key={row.id} className="relative overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 hover:ring-teal-2">
            <Link to={`/analyses/${row.id}`} className="block">
              <div className="relative h-40 bg-slate-100">
                {row.coverUrl ? (
                  <img src={row.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">暂无封面</div>
                )}
                <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-white/90 px-2 py-0.5 text-xs">
                    {row.sourceType === "images" ? "图片" : row.sourceType === "rtsp" ? `实时·第${row.waveIndex || 1}波` : "视频"}
                  </span>
                  <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs text-white">合格 {row.passCount ?? 0}</span>
                  <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs text-white">不合格 {row.failCount ?? 0}</span>
                </div>
              </div>
              <div className="space-y-2 p-4">
                <div className="font-medium text-ink">{row.title}</div>
                <div className="text-xs text-slate-500">{row.sopTitle}</div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <StatusBadge status={row.status} />
                  <ResultText result={row.overallResult} />
                  <span className="text-slate-400">{formatDate(row.createdAt)}</span>
                </div>
                <div className="text-xs text-slate-500">
                  不合格 {row.failCount ?? 0} 项 · 合格 {row.passCount ?? 0} 项
                  {isAdmin && row.ownerName ? ` · ${row.ownerName}` : ""}
                </div>
              </div>
            </Link>
            {isAdmin && (
              <button
                type="button"
                className="absolute bottom-3 right-3 rounded-md bg-white/95 px-2.5 py-1 text-xs text-rose-700 shadow hover:bg-rose-50"
                onClick={() => setPending(row)}
              >
                删除
              </button>
            )}
            </div>
          ))}
        </div>
      ) : filtered && filtered.length > 0 ? (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">任务</th>
                <th className="px-4 py-3 font-medium">手册</th>
                <th className="px-4 py-3 font-medium">来源</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">合格</th>
                <th className="px-4 py-3 font-medium">不合格</th>
                <th className="px-4 py-3 font-medium">时间</th>
                {isAdmin && <th className="px-4 py-3 font-medium">操作</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link to={`/analyses/${row.id}`} className="font-medium text-ink hover:text-teal">
                      {row.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.sopTitle}</td>
                  <td className="px-4 py-3">{row.sourceType === "images" ? "图片" : row.sourceType === "rtsp" ? "实时" : "视频"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-emerald-700">{row.passCount ?? 0}</td>
                  <td className="px-4 py-3 text-rose-700">{row.failCount ?? 0}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(row.createdAt)}</td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <button type="button" className="text-rose-600" onClick={() => setPending(row)}>
                        删除
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <ConfirmDialog
        open={Boolean(pending)}
        title="删除分析"
        message={`确认删除「${pending?.title}」？抽帧、视频和结论都会删除，此操作不可恢复。`}
        confirmText="删除分析"
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return;
          setBusy(true);
          void deleteAnalysis(pending.id)
            .then(() => {
              setPending(null);
              return refresh();
            })
            .catch((e: Error) => {
              setError(e.message);
              setPending(null);
            })
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}
