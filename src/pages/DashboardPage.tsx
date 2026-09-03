import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ClipboardCheck, Plus } from "lucide-react";
import { getDashboard, type Analysis, type VlmStatus } from "../lib/api";
import { formatDate } from "../lib/format";
import { ResultText, StatusBadge } from "../components/Badges";

function VlmBanner({ vlm }: { vlm: VlmStatus }) {
  if (vlm.mode === "none") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        尚未检测到视觉模型密钥。SOP 文本手册会先用本地规则抽出检查项；视频比对需要配置
        GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY，或部署到 Netlify 启用 AI Gateway。
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      视觉模型已就绪（{vlm.mode === "gateway" ? "Netlify AI Gateway" : "本地供应商密钥"}）。可在设置中切换 Gemini / GPT / Claude。
    </div>
  );
}

export function DashboardPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getDashboard>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboard().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="text-rose-600">{error}</p>;
  if (!data) return <p className="text-slate-500">加载工作台…</p>;

  const cards = [
    { label: "SOP 手册", value: data.sops, extra: `${data.sopsReady} 份已解析` },
    { label: "分析任务", value: data.analyses, extra: `${data.analysesCompleted} 份已出报告` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">工作台</h1>
          <p className="mt-1 text-sm text-slate-500">上传手册与作业视频，用视觉模型核验是否按 SOP 履职。</p>
        </div>
        <div className="flex gap-2">
          <Link to="/sops/new" className="inline-flex items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm text-white hover:bg-teal-2">
            <Plus size={16} /> 上传 SOP
          </Link>
          <Link to="/analyses/new" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">
            分析视频
          </Link>
        </div>
      </div>

      <VlmBanner vlm={data.vlm} />

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="text-sm text-slate-500">{card.label}</div>
            <div className="mt-2 text-3xl font-semibold text-ink">{card.value}</div>
            <div className="mt-1 text-sm text-slate-500">{card.extra}</div>
          </div>
        ))}
      </div>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-medium">最近报告</h2>
          <Link to="/analyses" className="text-sm text-teal">
            查看全部
          </Link>
        </div>
        {data.recent.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-slate-500">
            <ClipboardCheck />
            <p>还没有分析任务。先上传一份 SOP，再提交作业视频。</p>
            <Link to="/sops" className="text-teal text-sm inline-flex items-center gap-1">
              <BookOpen size={14} /> 前往手册库
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.recent.map((row: Analysis) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <Link to={`/analyses/${row.id}`} className="font-medium text-ink hover:text-teal">
                    {row.title}
                  </Link>
                  <div className="text-xs text-slate-500">{formatDate(row.createdAt)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={row.status} />
                  <ResultText result={row.overallResult} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
