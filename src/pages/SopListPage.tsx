import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listSops, type Sop } from "../lib/api";
import { formatDate } from "../lib/format";
import { StatusBadge } from "../components/Badges";

export function SopListPage() {
  const [rows, setRows] = useState<Sop[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSops().then(setRows).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">SOP 手册</h1>
          <p className="mt-1 text-sm text-slate-500">上传作业指导书，解析为可视化检查项后再做视频比对。</p>
        </div>
        <Link to="/sops/new" className="rounded-lg bg-teal px-4 py-2 text-sm text-white hover:bg-teal-2">
          上传手册
        </Link>
      </div>
      {error && <p className="text-rose-600">{error}</p>}
      {!rows && !error && <p className="text-slate-500">加载中…</p>}
      {rows && rows.length === 0 && (
        <div className="rounded-2xl bg-white p-10 text-center text-slate-500 ring-1 ring-slate-200">
          还没有手册。可以上传 PDF、Word、图片或 Markdown。
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {rows?.map((sop) => (
          <Link
            key={sop.id}
            to={`/sops/${sop.id}`}
            className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:ring-teal-2"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-medium text-ink">{sop.title}</h2>
              <StatusBadge status={sop.status} />
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-slate-500">{sop.summary || sop.originalFilename}</p>
            <div className="mt-4 flex justify-between text-xs text-slate-400">
              <span>{sop.checkItemCount ?? 0} 个检查项</span>
              <span>{formatDate(sop.createdAt)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
