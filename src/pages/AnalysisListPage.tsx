import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LayoutGrid, List } from "lucide-react";
import { listAnalyses, type Analysis } from "../lib/api";
import { formatDate } from "../lib/format";
import { ResultText, StatusBadge } from "../components/Badges";
import { useAuth } from "../lib/auth";

export function AnalysisListPage() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Analysis[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"list" | "card">("card");

  useEffect(() => {
    listAnalyses().then(setRows).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">履职分析</h1>
          <p className="mt-1 text-sm text-slate-500">支持作业视频抽帧或现场照片，逐项对照 SOP 并生成可回溯报告。</p>
        </div>
        <div className="flex items-center gap-2">
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
          <Link to="/analyses/new" className="rounded-lg bg-teal px-4 py-2 text-sm text-white hover:bg-teal-2">
            新建分析
          </Link>
        </div>
      </div>
      {error && <p className="text-rose-600">{error}</p>}
      {mode === "card" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows?.map((row) => (
            <Link key={row.id} to={`/analyses/${row.id}`} className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 hover:ring-teal-2">
              <div className="relative h-40 bg-slate-100">
                {row.coverUrl ? (
                  <img src={row.coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">暂无封面</div>
                )}
                <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-white/90 px-2 py-0.5 text-xs">
                    {row.sourceType === "images" ? "图片" : "视频"}
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
          ))}
          {rows && rows.length === 0 && <p className="text-slate-500">暂无报告</p>}
        </div>
      ) : (
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
              </tr>
            </thead>
            <tbody>
              {rows?.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link to={`/analyses/${row.id}`} className="font-medium text-ink hover:text-teal">
                      {row.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.sopTitle}</td>
                  <td className="px-4 py-3">{row.sourceType === "images" ? "图片" : "视频"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-emerald-700">{row.passCount ?? 0}</td>
                  <td className="px-4 py-3 text-rose-700">{row.failCount ?? 0}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(row.createdAt)}</td>
                </tr>
              ))}
              {rows && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    暂无报告
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
