import { useEffect, useState } from "react";
import { getSettings, saveSettings, testSettings, type Settings } from "../lib/api";

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings(s);
        setApiKey("");
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const persist = async () => {
    if (!settings) return;
    setError(null);
    try {
      const next = await saveSettings({
        provider: settings.provider,
        modelName: settings.modelName,
        apiKey: apiKey || settings.apiKeyMasked,
        baseUrl: settings.baseUrl,
        frameIntervalSec: settings.frameIntervalSec,
        maxFrames: settings.maxFrames,
      });
      setSettings(next);
      setApiKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    }
  };

  const test = async () => {
    setTesting(true);
    setTestMsg(null);
    setError(null);
    try {
      await persist();
      const result = await testSettings();
      setTestMsg(`连接成功：${result.provider} / ${result.model}，回复「${result.sample}」`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "测试失败");
    } finally {
      setTesting(false);
    }
  };

  if (!settings && !error) return <p className="text-slate-500">加载设置…</p>;
  if (!settings) return <p className="text-rose-600">{error}</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">系统设置</h1>
        <p className="mt-1 text-sm text-slate-500">配置全站视觉模型。普通用户分析时不会看到模型名称。</p>
      </div>
      <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div className="text-sm text-slate-500">当前通道</div>
        <div className="mt-1 font-medium text-ink">
          {settings.vlm.ready ? `${settings.vlm.mode} · ${settings.vlm.provider || ""} ${settings.vlm.model || ""}` : "未就绪"}
        </div>
      </div>
      <div className="grid gap-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">供应商</span>
          <select
            value={settings.provider}
            onChange={(e) => setSettings({ ...settings, provider: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-2"
          >
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">模型名称</span>
          <input
            value={settings.modelName}
            onChange={(e) => setSettings({ ...settings, modelName: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-2"
            placeholder="例如 gemini-2.5-flash"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">API Key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-2"
            placeholder={settings.hasApiKey ? `已保存 ${settings.apiKeyMasked}` : "填写供应商密钥；也可依赖 Netlify AI Gateway"}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">接口地址（可选）</span>
          <input
            value={settings.baseUrl}
            onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-2"
            placeholder="留空则使用默认或网关"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">默认抽帧间隔（秒）</span>
          <select
            value={settings.frameIntervalSec}
            onChange={(e) => setSettings({ ...settings, frameIntervalSec: Number(e.target.value) })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-2"
          >
            {[3, 5, 10].map((n) => (
              <option key={n} value={n}>
                每 {n} 秒一帧
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">默认最大帧数</span>
          <input
            type="number"
            min={4}
            max={60}
            value={settings.maxFrames}
            onChange={(e) => setSettings({ ...settings, maxFrames: Number(e.target.value) })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-2"
          />
        </label>
      </div>
      {testMsg && <p className="text-sm text-emerald-700">{testMsg}</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => void persist()} className="rounded-lg bg-teal px-5 py-2.5 text-sm text-white hover:bg-teal-2">
          {saved ? "已保存" : "保存设置"}
        </button>
        <button
          type="button"
          disabled={testing}
          onClick={() => void test()}
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm hover:bg-slate-50"
        >
          {testing ? "测试中…" : "测试模型连接"}
        </button>
      </div>
    </div>
  );
}
