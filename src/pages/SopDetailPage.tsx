import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getSop, getSettings, reparseSop, type CheckItem, type Sop } from "../lib/api";
import { formatDate } from "../lib/format";
import { StatusBadge } from "../components/Badges";
import { ModelSelect } from "../components/ModelSelect";
import { useAuth } from "../lib/auth";

function CheckCard({ item }: { item: CheckItem }) {
  const [open, setOpen] = useState(item.stepOrder <= 2);
  const actions = Array.isArray(item.keyActions) ? item.keyActions : [];
  return (
    <article className="relative rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="absolute -left-[42px] top-6 flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
        {item.stepOrder}
      </div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start justify-between gap-3 text-left">
        <div>
          {item.category && (
            <div className="mb-1 text-xs uppercase tracking-wide text-teal">{item.category}</div>
          )}
          <h3 className="font-medium text-ink">{item.title}</h3>
        </div>
        <span className="text-xs text-slate-400">{open ? "收起" : "展开"}</span>
      </button>
      <p className="mt-2 text-sm text-slate-600">{item.description}</p>
      {open && (
        <div className="mt-4 space-y-3">
          {actions.length > 0 && (
            <div>
              <div className="text-xs text-slate-400">关键动作</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {actions.map((action) => (
                  <span key={action} className="rounded-full bg-paper px-3 py-1 text-xs text-ink">
                    {action}
                  </span>
                ))}
              </div>
            </div>
          )}
          {item.passCriteria && (
            <div>
              <div className="text-xs text-slate-400">通过标准</div>
              <p className="mt-1 text-sm">{item.passCriteria}</p>
            </div>
          )}
          {item.riskHint && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">风险提示：{item.riskHint}</div>
          )}
        </div>
      )}
    </article>
  );
}

export function SopDetailPage() {
  const { isAdmin } = useAuth();
  const { id } = useParams();
  const sopId = Number(id);
  const [data, setData] = useState<(Sop & { items: CheckItem[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState("gpt-5.6-terra");
  const [models, setModels] = useState<{ id: string; label: string; hint: string }[]>([]);

  const refresh = () =>
    getSop(sopId)
      .then(setData)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void refresh();
    if (isAdmin) {
      getSettings()
        .then((s) => {
          setModels(s.availableModels);
          setModel(s.modelName || s.defaultModel);
        })
        .catch(() => undefined);
    }
  }, [sopId]);

  useEffect(() => {
    if (!data || (data.status !== "parsing" && data.status !== "uploaded")) return;
    const t = setInterval(() => void refresh(), 1500);
    return () => clearInterval(t);
  }, [data?.status, sopId]);

  if (error) return <p className="text-rose-600">{error}</p>;
  if (!data) return <p className="text-slate-500">加载手册…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-ink">{data.title}</h1>
            <StatusBadge status={data.status} />
          </div>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">{data.summary}</p>
          <div className="mt-2 text-xs text-slate-400">
            {data.originalFilename}
            {isAdmin && data.modelUsed ? ` · 模型 ${data.modelUsed}` : ""} · {formatDate(data.updatedAt)}
          </div>
        </div>
        <Link
          to={`/analyses/new?sopId=${data.id}`}
          className="rounded-lg bg-teal px-4 py-2 text-sm text-white hover:bg-teal-2"
        >
          用此手册分析
        </Link>
      </div>

      {data.status === "failed" && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          解析失败：{data.parseError}
        </div>
      )}
      {(data.status === "parsing" || data.status === "uploaded") && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          正在解析手册，请稍候…
        </div>
      )}

      <div className="rail space-y-4 pl-10">
        {data.items.map((item) => (
          <CheckCard key={item.id} item={item} />
        ))}
        {data.status === "ready" && data.items.length === 0 && (
          <p className="text-slate-500">没有检查项，请尝试更换模型重新解析。</p>
        )}
      </div>

      {isAdmin && (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="font-medium">重新解析</h2>
          <p className="mt-1 text-sm text-slate-500">可换一个视觉/语言模型再抽一次检查项。</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="min-w-64 flex-1">
              <ModelSelect models={models} value={model} onChange={setModel} />
            </div>
            <button
              type="button"
              onClick={() => void reparseSop(sopId, model).then(() => refresh())}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            >
              重新解析
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
