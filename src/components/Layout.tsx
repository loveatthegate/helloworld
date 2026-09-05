import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { BookOpen, ClipboardCheck, FileVideo, LayoutDashboard, LogOut, Radio, Settings, ShieldCheck } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useBranding } from "../lib/branding";
import { BreadcrumbProvider, HeaderBreadcrumb } from "./Breadcrumb";
import { AppShellSkeleton } from "./Skeleton";

export function Layout() {
  const { user, loading, isAdmin, logout } = useAuth();
  const { branding } = useBranding();

  if (loading) return <AppShellSkeleton />;
  if (!user) return <Navigate to="/login" replace />;

  const location = useLocation();
  const nav = [
    { to: "/", label: "工作台", icon: LayoutDashboard, active: location.pathname === "/" },
    {
      to: "/analyses",
      label: "核验报告",
      icon: ClipboardCheck,
      active: location.pathname === "/analyses" || /^\/analyses\/\d+/.test(location.pathname),
    },
    { to: "/analyses/new", label: "回放核验", icon: FileVideo, active: location.pathname === "/analyses/new" },
    { to: "/live/new", label: "实时核验", icon: Radio, active: location.pathname.startsWith("/live") },
    { to: "/sops", label: "SOP手册", icon: BookOpen, active: location.pathname.startsWith("/sops") },
    {
      to: "/settings",
      label: "系统设置",
      icon: Settings,
      active: location.pathname.startsWith("/settings") || location.pathname === "/cameras" || location.pathname === "/users",
    },
  ];

  return (
    <div className="flex h-full overflow-hidden">
      <aside className="flex h-full w-60 shrink-0 flex-col bg-ink text-slate-100">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-6">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-2/20 text-teal-2">
              <ShieldCheck size={22} />
            </div>
          )}
          <div>
            <div className="font-semibold tracking-wide">{branding.systemName}</div>
            <div className="text-xs text-slate-400">{branding.tagline}</div>
          </div>
        </div>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/" || item.to === "/analyses"}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                item.active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="shrink-0 border-t border-white/10 px-4 py-4">
          <div className="text-sm text-white">{user.displayName}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">{isAdmin ? "超级管理员" : "普通用户"}</div>
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
            onClick={() => void logout()}
          >
            <LogOut size={14} /> 退出
          </button>
          {branding.companyName && <div className="mt-3 text-[11px] text-slate-500">{branding.companyName}</div>}
          <div className="mt-3 text-[11px] text-slate-500">{branding.copyright}</div>
        </div>
      </aside>
      <BreadcrumbProvider>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="px-4 py-3 lg:px-8">
            <HeaderBreadcrumb />
          </div>
        </header>
        <main
          className={
            /^\/live\/\d+/.test(location.pathname)
              ? "flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden"
              : "min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-8 lg:py-8"
          }
        >
          <Outlet />
        </main>
      </div>
      </BreadcrumbProvider>
    </div>
  );
}
