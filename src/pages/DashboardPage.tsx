import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ClipboardCheck, FileVideo, Plus, Radio, ShieldCheck } from "lucide-react";
import { getDashboard, type Analysis, type VlmStatus, type WorkSession } from "../lib/api";
import { formatDate } from "../lib/format";
import { ResultText, StatusBadge } from "../components/Badges";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/Skeleton";
import { useAuth } from "../lib/auth";

function VlmBanner({ vlm }: { vlm: VlmStatus }) {
  if (!vlm.ready) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        视觉模型未就绪。请在系统设置中选择模型并测试连接。
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      视觉模型已就绪{vlm.model ? ` · ${vlm.model}` : ""}。
    </div>
  );
}

export function DashboardPage() {
  const { isAdmin } = useAuth();
  const [data, setData] = useState<Awaited<ReturnType<typeof getDashboard>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboard().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="text-rose-600">{error}</p>;
  if (!data) return <PageSkeleton variant="dashboard" />;

  const cards = [
    { label: "SOP手册", value: data.sops, extra: `${data.sopsReady} 份已解析`, icon: BookOpen, to: "/sops" },
    { label: "核验报告", value: data.analyses, extra: `${data.analysesCompleted} 份已出报告`, icon: ClipboardCheck, to: "/analyses" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal/10 text-teal">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-ink">工作台</h1>
            <p className="mt-1 text-sm text-slate-500">回放视频对照手册，或实时核验 RTSP 作业。</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/analyses/new" className="inline-flex items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm text-white hover:bg-teal-2">
            <FileVideo size={16} /> 回放核验
          </Link>
          <Link to="/live/new" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">
            <Radio size={16} /> 实时核验
          </Link>
          <Link to="/sops/new" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">
            <Plus size={16} /> 上传手册
          </Link>
        </div>
      </div>

      {isAdmin && <VlmBanner vlm={data.vlm} />}

      {(data.liveSessions?.length ?? 0) > 0 && (
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-3 inline-flex items-center gap-2 font-medium">
            <Radio size={18} className="text-teal" /> 进行中的场次
          </h2>
          <ul className="divide-y divide-slate-100">
            {data.liveSessions!.map((row: WorkSession) => (
              <li key={row.id} className="flex items-center justify-between py-2">
                <div>
                  <Link to={`/live/${row.id}`} className="font-medium text-ink hover:text-teal">
                    {row.title}
                  </Link>
                  <div className="text-xs text-slate-500">
                    第 {row.waveIndex} 波 · {row.status === "watching" ? "场间值守" : "进行中"}
                  </div>
                </div>
                <Link to={`/live/${row.id}`} className="text-sm text-teal">
                  进入监督墙
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link key={card.label} to={card.to} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 hover:ring-teal-2">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-500">{card.label}</div>
              <card.icon className="text-teal" size={20} />
            </div>
            <div className="mt-2 text-3xl font-semibold text-ink">{card.value}</div>
            <div className="mt-1 text-sm text-slate-500">{card.extra}</div>
          </Link>
        ))}
      </div>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 font-medium">
            <ClipboardCheck size={18} className="text-teal" /> 最近报告
          </h2>
          <Link to="/analyses" className="text-sm text-teal">
            查看全部
          </Link>
        </div>
        {data.recent.length === 0 ? (
          <EmptyState
            compact
            flush
            title="暂无报告"
            description="先上传一份 SOP 手册，再回放视频或开实时核验。"
            action={
              <Link to="/sops" className="inline-flex items-center gap-1 text-sm text-teal">
                <BookOpen size={14} /> 前往手册库
              </Link>
            }
          />
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
