import { useEffect, useState } from "react";
import { getSettings, saveSettings, testSettings, type Settings } from "../lib/api";
import { ModelSelect } from "../components/ModelSelect";

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch((e: Error) => setError(e.message));
  }, []);

  const persist = async () => {
    if (!settings) return;
    setError(null);
    try {
      const next = await saveSettings({
        modelName: settings.modelName,
        frameIntervalSec: settings.frameIntervalSec,
        maxFrames: settings.maxFrames,
      });
      setSettings(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
      return null;
    }
  };

  const test = async () => {
    setTesting(true);
    setTestMsg(null);
    setError(null);
    try {
      const next = await persist();
      if (!next) return;
      const result = await testSettings();
      setTestMsg(`连接成功：${result.model}，回复「${result.sample}」`);
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
        <p className="mt-1 text-sm text-slate-500">选择用于手册解析和画面核验的模型。密钥由系统预置，不会显示在页面上。</p>
      </div>
      <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div className="text-sm text-slate-500">当前模型</div>
        <div className="mt-1 font-medium text-ink">{settings.vlm.ready ? settings.modelName : "未就绪"}</div>
      </div>
      <div className="grid gap-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">视觉模型</span>
          <ModelSelect
            models={settings.availableModels}
            value={settings.modelName}
            onChange={(modelName) => setSettings({ ...settings, modelName })}
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
