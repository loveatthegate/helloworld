import { NavLink, Navigate, Outlet } from "react-router-dom";
import { BookOpen, ClipboardCheck, LayoutDashboard, LogOut, Settings, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useBranding } from "../lib/branding";
import { AppShellSkeleton } from "./Skeleton";

export function Layout() {
  const { user, loading, isAdmin, logout } = useAuth();
  const { branding } = useBranding();

  if (loading) return <AppShellSkeleton />;
  if (!user) return <Navigate to="/login" replace />;

  const nav = [
    { to: "/", label: "工作台", icon: LayoutDashboard, end: true, adminOnly: false },
    { to: "/sops", label: "SOP 手册", icon: BookOpen, adminOnly: false },
    { to: "/analyses", label: "履职分析", icon: ClipboardCheck, adminOnly: false },
    { to: "/users", label: "用户管理", icon: Users, adminOnly: true },
    { to: "/settings", label: "系统设置", icon: Settings, adminOnly: true },
  ].filter((item) => !item.adminOnly || isAdmin);

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
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  isActive ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`
              }
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
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="px-4 py-3 text-sm text-slate-500 lg:px-8">{branding.tagline}</div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <main className="px-4 py-6 lg:px-8 lg:py-8">
            <Outlet />
          </main>
          <footer className="px-4 pb-6 text-center text-xs text-slate-400 lg:px-8">{branding.copyright}</footer>
        </div>
      </div>
    </div>
  );
}
