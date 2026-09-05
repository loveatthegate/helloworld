import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

export type Crumb = { label: string; to?: string };

const TAB_LABEL: Record<string, string> = {
  cameras: "点位管理",
  users: "用户管理",
  model: "模型设置",
  appearance: "外观设置",
};

const BreadcrumbContext = createContext<{
  crumbs: Crumb[];
  setCrumbs: (items: Crumb[] | null) => void;
}>({ crumbs: [], setCrumbs: () => undefined });

export function crumbsFromLocation(pathname: string, search = "") {
  const home: Crumb = { label: "工作台", to: "/" };
  if (pathname === "/") return [{ label: "工作台" }];
  if (pathname === "/analyses") return [home, { label: "核验报告" }];
  if (pathname === "/analyses/new") return [home, { label: "核验报告", to: "/analyses" }, { label: "回放核验" }];
  if (/^\/analyses\/\d+/.test(pathname)) return [home, { label: "核验报告", to: "/analyses" }, { label: "报告详情" }];
  if (pathname === "/live/new") return [home, { label: "实时核验" }];
  if (/^\/live\/\d+/.test(pathname)) return [home, { label: "实时核验", to: "/live/new" }, { label: "监督墙" }];
  if (pathname === "/sops") return [home, { label: "SOP手册" }];
  if (pathname === "/sops/new") return [home, { label: "SOP手册", to: "/sops" }, { label: "上传手册" }];
  if (/^\/sops\/\d+/.test(pathname)) return [home, { label: "SOP手册", to: "/sops" }, { label: "手册详情" }];
  if (pathname.startsWith("/settings") || pathname === "/cameras" || pathname === "/users") {
    const tab = new URLSearchParams(search).get("tab") || (pathname === "/users" ? "users" : "cameras");
    return [home, { label: "系统设置", to: "/settings" }, { label: TAB_LABEL[tab] || "点位管理" }];
  }
  return [home];
}

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [override, setOverride] = useState<Crumb[] | null>(null);

  useEffect(() => {
    setOverride(null);
  }, [location.pathname, location.search]);

  const crumbs = override ?? crumbsFromLocation(location.pathname, location.search);
  const value = useMemo(() => ({ crumbs, setCrumbs: setOverride }), [crumbs]);
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

export function usePageCrumbs(items: Crumb[] | null | undefined) {
  const { setCrumbs } = useContext(BreadcrumbContext);
  const key = items?.map((item) => `${item.label}:${item.to ?? ""}`).join("|") ?? "";
  useEffect(() => {
    setCrumbs(items ?? null);
    return () => setCrumbs(null);
  }, [key]);
}

export function HeaderBreadcrumb() {
  const { crumbs } = useContext(BreadcrumbContext);
  return <Breadcrumb items={crumbs} />;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-1">
          {index > 0 && <span>/</span>}
          {item.to ? (
            <Link to={item.to} className="hover:text-teal">
              {item.label}
            </Link>
          ) : (
            <span className="text-slate-600">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
