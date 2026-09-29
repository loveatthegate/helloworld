import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
  compact = false,
  flush = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  flush?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        flush ? "" : "rounded-2xl bg-white ring-1 ring-slate-200"
      } ${compact ? "px-4 py-8" : "px-6 py-14"}`}
    >
      <EmptyIllustration compact={compact} />
      <p className={`mt-4 font-medium text-ink ${compact ? "text-sm" : "text-sm"}`}>{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">{description}</p>}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function EmptyIllustration({ compact }: { compact?: boolean }) {
  const w = compact ? 120 : 168;
  const h = compact ? 88 : 124;
  return (
    <svg width={w} height={h} viewBox="0 0 168 124" fill="none" aria-hidden>
      <ellipse cx="84" cy="108" rx="52" ry="8" fill="#e2e8f0" />
      <rect x="38" y="28" width="92" height="72" rx="12" fill="#f8fafc" stroke="#cbd5e1" />
      <rect x="50" y="18" width="68" height="20" rx="6" fill="#ecfdf5" stroke="#99f6e4" />
      <rect x="56" y="56" width="56" height="6" rx="3" fill="#e2e8f0" />
      <rect x="56" y="70" width="40" height="6" rx="3" fill="#e2e8f0" />
      <circle cx="118" cy="86" r="18" fill="#0f766e" />
      <path d="M110 86h16M118 78v16" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M62 40c8-10 36-10 44 0"
        stroke="#99f6e4"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
