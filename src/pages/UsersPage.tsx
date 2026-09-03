import { useEffect, useState } from "react";
import { createUser, listUsers, patchUser } from "../lib/api";
import { formatDate } from "../lib/format";

export function UsersPage() {
  const [rows, setRows] = useState<Array<{
    id: number;
    username: string;
    displayName: string;
    role: string;
    isActive: boolean;
    createdAt: string;
  }> | null>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => listUsers().then(setRows).catch((e: Error) => setError(e.message));

  useEffect(() => {
    void refresh();
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await createUser({ username, displayName, password });
      setUsername("");
      setDisplayName("");
      setPassword("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">用户管理</h1>
        <p className="mt-1 text-sm text-slate-500">系统仅有一名超级管理员。普通用户只能看到自己上传的手册与分析。</p>
      </div>
      <div className="grid gap-3 rounded-2xl bg-white p-5 ring-1 ring-slate-200 md:grid-cols-4">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="用户名"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-2"
        />
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="显示名"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-2"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="初始密码"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-2"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void create()}
          className="rounded-lg bg-teal px-4 py-2 text-sm text-white hover:bg-teal-2"
        >
          新建普通用户
        </button>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">用户</th>
              <th className="px-4 py-3 font-medium">角色</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">创建时间</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-medium">{row.displayName}</div>
                  <div className="text-xs text-slate-400">{row.username}</div>
                </td>
                <td className="px-4 py-3">{row.role === "super_admin" ? "超级管理员" : "普通用户"}</td>
                <td className="px-4 py-3">{row.isActive ? "启用" : "停用"}</td>
                <td className="px-4 py-3 text-slate-500">{formatDate(row.createdAt)}</td>
                <td className="px-4 py-3">
                  {row.role !== "super_admin" && (
                    <button
                      type="button"
                      className="text-sm text-teal"
                      onClick={() => void patchUser(row.id, { isActive: !row.isActive }).then(() => refresh())}
                    >
                      {row.isActive ? "停用" : "启用"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
