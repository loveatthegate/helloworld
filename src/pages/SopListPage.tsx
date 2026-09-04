import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { deleteSop, listSops, type Sop } from "../lib/api";
import { formatDate } from "../lib/format";
import { StatusBadge } from "../components/Badges";
import { Breadcrumb } from "../components/Breadcrumb";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageSkeleton } from "../components/Skeleton";
import { useAuth } from "../lib/auth";

export function SopListPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Sop[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Sop | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => listSops().then(setRows).catch((e: Error) => setError(e.message));

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="space-y-5">
      <Breadcrumb items={[{ label: "工作台", to: "/" }, { label: "SOP 手册" }]} />
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
      {!rows && !error && <PageSkeleton variant="books" />}
      {rows && rows.length === 0 && (
        <div className="rounded-2xl bg-white p-10 text-center text-slate-500 ring-1 ring-slate-200">
          还没有手册。可以上传 PDF、Word、图片或 Markdown。
        </div>
      )}
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {rows?.map((sop) => (
          <div key={sop.id} className="relative">
            <button
              type="button"
              onClick={() => navigate(`/sops/${sop.id}`)}
              className="book-card w-full p-6 text-left"
            >
              <div className="relative z-10 pl-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-white/70">作业指导书</div>
                <h2 className="mt-3 line-clamp-2 text-lg font-semibold leading-snug">{sop.title}</h2>
                <p className="mt-3 line-clamp-2 text-sm text-white/75">{sop.summary || sop.originalFilename}</p>
                <div className="mt-8 flex items-center justify-between text-xs text-white/70">
                  <span>{sop.checkItemCount ?? 0} 个检查项</span>
                  <span>{formatDate(sop.createdAt)}</span>
                </div>
              </div>
            </button>
            <div className="absolute right-3 top-3 z-10">
              <StatusBadge status={sop.status} />
            </div>
            {isAdmin && (
              <button
                type="button"
                className="absolute bottom-3 right-3 z-10 rounded-md bg-white/95 px-2.5 py-1 text-xs text-rose-700 shadow hover:bg-white"
                onClick={(e) => {
                  e.stopPropagation();
                  setPending(sop);
                }}
              >
                删除
              </button>
            )}
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={Boolean(pending)}
        title="删除手册"
        message={
          pending
            ? `手册会从列表中移除，已有的 ${pending.analysisCount ?? 0} 份分析报告会保留，但不能再对照此手册新建或重新分析。${
                pending.analyzingCount
                  ? ` 当前有 ${pending.analyzingCount} 个任务正在分析，删除后它们会继续跑完并生成报告。`
                  : ""
              }`
            : ""
        }
        confirmText="删除手册"
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return;
          setBusy(true);
          void deleteSop(pending.id)
            .then(() => {
              setPending(null);
              return refresh();
            })
            .catch((e: Error) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}
