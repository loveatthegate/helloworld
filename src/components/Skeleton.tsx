export function Pulse({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200 ${className}`} />;
}

export function PageSkeleton({
  variant = "list",
}: {
  variant?: "dashboard" | "list" | "cards" | "books" | "detail" | "form" | "table";
}) {
  if (variant === "dashboard") {
    return (
      <div className="space-y-6">
        <div className="flex justify-between">
          <div className="space-y-2">
            <Pulse className="h-8 w-40" />
            <Pulse className="h-4 w-72" />
          </div>
          <div className="flex gap-2">
            <Pulse className="h-10 w-28" />
            <Pulse className="h-10 w-28" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Pulse className="h-32" />
          <Pulse className="h-32" />
        </div>
        <Pulse className="h-64" />
      </div>
    );
  }
  if (variant === "books") {
    return (
      <div className="space-y-5">
        <div className="flex justify-between">
          <Pulse className="h-8 w-40" />
          <Pulse className="h-10 w-24" />
        </div>
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Pulse key={i} className="h-56" />
          ))}
        </div>
      </div>
    );
  }
  if (variant === "cards") {
    return (
      <div className="space-y-5">
        <div className="flex justify-between">
          <Pulse className="h-8 w-40" />
          <Pulse className="h-10 w-24" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Pulse key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }
  if (variant === "detail") {
    return (
      <div className="space-y-6">
        <Pulse className="h-4 w-48" />
        <Pulse className="h-10 w-80" />
        <div className="grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Pulse key={i} className="h-20" />
          ))}
        </div>
        <Pulse className="h-28" />
        <Pulse className="h-40" />
        <Pulse className="h-40" />
      </div>
    );
  }
  if (variant === "form") {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Pulse className="h-8 w-48" />
        <Pulse className="h-40" />
        <Pulse className="h-56" />
      </div>
    );
  }
  if (variant === "table") {
    return (
      <div className="space-y-5">
        <Pulse className="h-8 w-40" />
        <Pulse className="h-72" />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <Pulse className="h-8 w-40" />
      <Pulse className="h-48" />
    </div>
  );
}

export function AppShellSkeleton() {
  return (
    <div className="flex h-full overflow-hidden">
      <aside className="flex h-full w-60 shrink-0 flex-col bg-ink">
        <div className="space-y-4 p-5">
          <Pulse className="h-10 w-36 bg-white/10" />
          <Pulse className="h-9 bg-white/10" />
          <Pulse className="h-9 bg-white/10" />
          <Pulse className="h-9 bg-white/10" />
        </div>
      </aside>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-8 py-8">
        <PageSkeleton variant="dashboard" />
      </div>
    </div>
  );
}
