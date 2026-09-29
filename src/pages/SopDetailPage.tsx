import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getSop, getSettings, patchCheckItem, reparseSop, type CheckItem, type Sop } from "../lib/api";
import { formatDate } from "../lib/format";
import { usePageCrumbs } from "../components/Breadcrumb";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/Skeleton";
import { StatusBadge } from "../components/Badges";
import { ModelSelect } from "../components/ModelSelect";
import { useAuth } from "../lib/auth";

const SCOPE_HINT: Record<string, string> = {
  throughout: "整场都盯这项，不跟某一步绑定。",
  step: "只在对应步骤的时间窗里判定。",
  after_event: "只有发生指定事件后才检查。",
};

const JUDGE_HINT: Record<string, string> = {
  presence: "看某个状态在不在，例如戴帽、有人监护。",
  action: "看有没有做出这个动作。",
  order: "看先后顺序对不对。",
  duration: "看是否持续够规定时间。",
  count: "看次数够不够。",
  coverage: "看该去的点位是否都走到、拍到。",
  prohibition: "盯不该出现的行为，出现即告警。",
};

const MISSING_HINT: Record<string, string> = {
  not_observed: "没拍到就记未观察到，不记成做错。",
  not_applicable: "这路机本来拍不到，跳过且不判失败。",
};

const EVIDENCE_HINT: Record<string, string> = {
  any: "全局机或细节机，有一路能看清即可。",
  global: "只认主点位/全局画面里的证据。",
  detail: "只认细节机近景，全局机不算。",
};

function CheckCard({ item, sopId, canEdit, onSaved }: { item: CheckItem; sopId: number; canEdit: boolean; onSaved: () => void }) {
  const [open, setOpen] = useState(item.stepOrder <= 2);
  const [scope, setScope] = useState(item.scope || "step");
  const [judgeType, setJudgeType] = useState(item.judgeType || "action");
  const [missingEvidence, setMissingEvidence] = useState(item.missingEvidence || "not_observed");
  const [evidenceFrom, setEvidenceFrom] = useState(item.evidenceFrom || "any");
  const actions = Array.isArray(item.keyActions) ? item.keyActions : [];
  return (
    <article className="relative rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="absolute -left-[42px] top-6 flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
        {item.stepOrder}
      </div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start justify-between gap-3 text-left">
        <div>
          <div className="mb-1 flex flex-wrap gap-2 text-xs text-teal">
            {item.category && <span>{item.category}</span>}
            <span>{item.scope === "throughout" ? "全程" : item.scope === "after_event" ? "事件后" : "分步"}</span>
          </div>
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
          {canEdit && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-400">
                作用域
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-ink"
                  value={scope}
                  onChange={(e) => {
                    setScope(e.target.value);
                    void patchCheckItem(sopId, item.id, { scope: e.target.value }).then(onSaved);
                  }}
                >
                  <option value="throughout">全程</option>
                  <option value="step">分步</option>
                  <option value="after_event">事件后</option>
                </select>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">{SCOPE_HINT[scope]}</p>
              </label>
              <label className="text-xs text-slate-400">
                判定
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-ink"
                  value={judgeType}
                  onChange={(e) => {
                    setJudgeType(e.target.value);
                    void patchCheckItem(sopId, item.id, { judgeType: e.target.value }).then(onSaved);
                  }}
                >
                  <option value="presence">状态有无</option>
                  <option value="action">动作发生</option>
                  <option value="order">顺序</option>
                  <option value="duration">持续时长</option>
                  <option value="count">次数</option>
                  <option value="coverage">点位覆盖</option>
                  <option value="prohibition">负向禁则</option>
                </select>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">{JUDGE_HINT[judgeType]}</p>
              </label>
              <label className="text-xs text-slate-400">
                缺画面
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-ink"
                  value={missingEvidence}
                  onChange={(e) => {
                    setMissingEvidence(e.target.value);
                    void patchCheckItem(sopId, item.id, { missingEvidence: e.target.value }).then(onSaved);
                  }}
                >
                  <option value="not_observed">未观察到</option>
                  <option value="not_applicable">不适用（不判失败）</option>
                </select>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">{MISSING_HINT[missingEvidence]}</p>
              </label>
              <label className="text-xs text-slate-400">
                证据来自
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-ink"
                  value={evidenceFrom}
                  onChange={(e) => {
                    setEvidenceFrom(e.target.value);
                    void patchCheckItem(sopId, item.id, { evidenceFrom: e.target.value }).then(onSaved);
                  }}
                >
                  <option value="any">任一</option>
                  <option value="global">全局机</option>
                  <option value="detail">细节机</option>
                </select>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">{EVIDENCE_HINT[evidenceFrom]}</p>
              </label>
            </div>
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

  usePageCrumbs(
    data
      ? [
          { label: "工作台", to: "/" },
          { label: "SOP手册", to: "/sops" },
          { label: data.title },
        ]
      : null,
  );

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
  if (!data) return <PageSkeleton variant="detail" />;

  return (
    <div className="space-y-6">
      {data.deletedAt && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          此手册已从列表删除。已有分析报告仍可查看，但不能再新建分析或重新解析。
        </div>
      )}
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
        {!data.deletedAt && (
        <div className="flex gap-2">
          <Link
            to={`/live/new?sopId=${data.id}`}
            className="rounded-lg bg-teal px-4 py-2 text-sm text-white hover:bg-teal-2"
          >
            实时核验
          </Link>
          <Link
            to={`/analyses/new?sopId=${data.id}`}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            回放核验
          </Link>
        </div>
        )}
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
          <CheckCard key={item.id} item={item} sopId={data.id} canEdit={isAdmin} onSaved={() => void refresh()} />
        ))}
        {data.status === "ready" && data.items.length === 0 && (
          <EmptyState title="暂无检查项" description="没有解析出检查项，可更换模型后重新解析。" />
        )}
      </div>

      {isAdmin && !data.deletedAt && (
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
