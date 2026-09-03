import { resultLabel, statusLabel, verdictLabel } from "../lib/format";

const statusClass: Record<string, string> = {
  ready: "bg-emerald-50 text-emerald-800",
  completed: "bg-emerald-50 text-emerald-800",
  parsing: "bg-amber-50 text-amber-800",
  analyzing: "bg-amber-50 text-amber-800",
  uploading: "bg-sky-50 text-sky-800",
  uploaded: "bg-slate-100 text-slate-700",
  failed: "bg-rose-50 text-rose-800",
};

const verdictClass: Record<string, string> = {
  pass: "bg-emerald-600 text-white",
  fail: "bg-rose-600 text-white",
  uncertain: "bg-amber-500 text-white",
  not_observed: "bg-slate-500 text-white",
};

const resultClass: Record<string, string> = {
  pass: "text-emerald-700",
  fail: "text-rose-700",
  partial: "text-amber-700",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass[status] || "bg-slate-100 text-slate-700"}`}>
      {statusLabel[status] || status}
    </span>
  );
}

export function VerdictBadge({ verdict }: { verdict?: string | null }) {
  if (!verdict) return <span className="text-xs text-slate-400">待分析</span>;
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${verdictClass[verdict] || "bg-slate-400 text-white"}`}>
      {verdictLabel[verdict] || verdict}
    </span>
  );
}

export function ResultText({ result }: { result?: string | null }) {
  if (!result) return <span className="text-slate-400">—</span>;
  return <span className={`font-medium ${resultClass[result] || ""}`}>{resultLabel[result] || result}</span>;
}
