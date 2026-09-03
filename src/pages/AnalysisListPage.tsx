import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listAnalyses, type Analysis } from "../lib/api";
import { formatDate } from "../lib/format";
import { ResultText, StatusBadge } from "../components/Badges";

export function AnalysisListPage() {
  const [rows, setRows] = useState<Analysis[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAnalyses().then(setRows).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">视频分析</h1>
          <p className="mt-1 text-sm text-slate-500">每次上传都会生成可回溯报告：逐项满足 / 不满足 / 未观察到。</p>
        </div>
        <Link to="/analyses/new" className="rounded-lg bg-teal px-4 py-2 text-sm text-white hover:bg-teal-2">
          新建分析
        </Link>
      </div>
      {error && <p className="text-rose-600">{error}</p>}
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">任务</th>
              <th className="px-4 py-3 font-medium">手册</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">结论</th>
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
                  <div className="text-xs text-slate-400">{row.videoFilename}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">{row.sopTitle}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-4 py-3">
                  <ResultText result={row.overallResult} />
                </td>
                <td className="px-4 py-3 text-slate-500">{formatDate(row.createdAt)}</td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  暂无报告
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
