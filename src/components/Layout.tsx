import { NavLink, Outlet } from "react-router-dom";
import { BookOpen, ClipboardCheck, LayoutDashboard, Settings, ShieldCheck } from "lucide-react";

const nav = [
  { to: "/", label: "工作台", icon: LayoutDashboard, end: true },
  { to: "/sops", label: "SOP 手册", icon: BookOpen },
  { to: "/analyses", label: "视频分析", icon: ClipboardCheck },
  { to: "/settings", label: "系统设置", icon: Settings },
];

export function Layout() {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="bg-ink text-slate-100">
        <div className="flex items-center gap-3 px-5 py-6 border-b border-white/10">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-2/20 text-teal-2">
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="font-semibold tracking-wide">履职系统</div>
            <div className="text-xs text-slate-400">SOP 视觉核验 DEMO</div>
          </div>
        </div>
        <nav className="p-3 space-y-1">
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
        <div className="px-5 py-4 text-xs text-slate-500 hidden lg:block">
          验证阶段使用视觉模型抽帧比对，后续可替换为独立 CV 模型。
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex items-center justify-between px-4 py-3 lg:px-8">
            <div className="text-sm text-slate-500">手册解析 · 视频抽帧 · 可回溯报告</div>
            <span className="rounded-full bg-paper px-3 py-1 text-xs text-ink">内部验证 · 无登录</span>
          </div>
        </header>
        <main className="px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
