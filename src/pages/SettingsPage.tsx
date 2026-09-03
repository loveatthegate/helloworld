import { useEffect, useState } from "react";
import { getSettings, saveSettings, type Settings } from "../lib/api";
import { ModelSelect } from "../components/ModelSelect";

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then(setSettings).catch((e: Error) => setError(e.message));
  }, []);

  const persist = async () => {
    if (!settings) return;
    setError(null);
    try {
      const next = await saveSettings({
        defaultModel: settings.defaultModel,
        frameIntervalSec: settings.frameIntervalSec,
        maxFrames: settings.maxFrames,
      });
      setSettings(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    }
  };

  if (!settings && !error) return <p className="text-slate-500">加载设置…</p>;
  if (!settings) return <p className="text-rose-600">{error}</p>;

  const modeLabel =
    settings.vlm.mode === "gateway" ? "Netlify AI Gateway" : settings.vlm.mode === "byok" ? "本地供应商密钥" : "未配置";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">系统设置</h1>
        <p className="mt-1 text-sm text-slate-500">验证阶段可切换不同视觉模型。后续独立 CV 小模型将走同一分析接口。</p>
      </div>
      <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div className="text-sm text-slate-500">当前 VLM 通道</div>
        <div className="mt-1 font-medium text-ink">{modeLabel}</div>
        <div className="mt-2 text-xs text-slate-500">
          Gemini {settings.vlm.providers.gemini ? "可用" : "未就绪"} · OpenAI{" "}
          {settings.vlm.providers.openai ? "可用" : "未就绪"} · Anthropic {settings.vlm.providers.anthropic ? "可用" : "未就绪"}
        </div>
      </div>
      <div className="grid gap-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">默认视觉模型</span>
          <ModelSelect
            models={settings.availableModels}
            value={settings.defaultModel}
            onChange={(id) => setSettings({ ...settings, defaultModel: id })}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">默认抽帧间隔（秒）</span>
          <select
            value={settings.frameIntervalSec}
            onChange={(e) => setSettings({ ...settings, frameIntervalSec: Number(e.target.value) })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-2"
          >
            {[0.5, 1, 2, 3, 5].map((n) => (
              <option key={n} value={n}>
                {n}
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
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        type="button"
        onClick={() => void persist()}
        className="rounded-lg bg-teal px-5 py-2.5 text-sm text-white hover:bg-teal-2"
      >
        {saved ? "已保存" : "保存设置"}
      </button>
    </div>
  );
}
