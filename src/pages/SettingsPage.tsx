import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  getSettings,
  resetAppearance,
  saveAppearance,
  saveSettings,
  testSettings,
  uploadAppearanceImage,
  type Branding,
  type Settings,
} from "../lib/api";
import { ModelSelect } from "../components/ModelSelect";
import { PageSkeleton } from "../components/Skeleton";
import { useAuth } from "../lib/auth";
import { useBranding } from "../lib/branding";
import { CamerasPage } from "./CamerasPage";
import { UsersPage } from "./UsersPage";

const TABS = [
  { id: "cameras", label: "点位管理", adminOnly: false },
  { id: "users", label: "用户管理", adminOnly: true },
  { id: "model", label: "模型设置", adminOnly: true },
  { id: "appearance", label: "外观设置", adminOnly: true },
] as const;

function ImageField({
  label,
  preview,
  onFile,
}: {
  label: string;
  preview?: string | null;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="text-sm">
      <span className="mb-1 block text-slate-600">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onFile(file);
          }}
        />
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50"
          onClick={() => inputRef.current?.click()}
        >
          {preview ? "更换图片" : "上传图片"}
        </button>
        {preview && <span className="text-xs text-slate-400">已设置</span>}
      </div>
      {preview && <img src={`${preview}?t=${Date.now()}`} alt="" className={label.includes("登录") ? "mt-2 h-24 w-full rounded object-cover" : "mt-2 h-12 w-12 rounded object-cover"} />}
    </div>
  );
}

export function SettingsPage() {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabs = TABS.filter((item) => !item.adminOnly || isAdmin);
  const requested = params.get("tab") || (isAdmin ? "cameras" : "cameras");
  const tab = tabs.some((item) => item.id === requested) ? requested : "cameras";
  const { refresh } = useBranding();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [appearance, setAppearance] = useState<Branding | null>(null);
  const [saved, setSaved] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    getSettings()
      .then((s) => {
        setSettings(s);
        setAppearance(s.appearance);
      })
      .catch((e: Error) => setError(e.message));
  }, [isAdmin]);

  const persistModel = async () => {
    if (!settings) return null;
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

  const persistAppearance = async () => {
    if (!appearance) return;
    setError(null);
    try {
      const next = await saveAppearance(appearance);
      setAppearance(next);
      await refresh();
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
      const next = await persistModel();
      if (!next) return;
      const result = await testSettings();
      setTestMsg(`连接成功：${result.model}，回复「${result.sample}」`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "测试失败");
    } finally {
      setTesting(false);
    }
  };

  if (isAdmin && (tab === "model" || tab === "appearance") && !settings && !error) return <PageSkeleton variant="form" />;
  if (isAdmin && (tab === "model" || tab === "appearance") && error && (!settings || !appearance)) {
    return <p className="text-rose-600">{error}</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">系统设置</h1>
        <p className="mt-1 text-sm text-slate-500">点位、用户、模型与外观集中管理。模型密钥由系统预置。</p>
      </div>
      <div className="flex flex-wrap gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setParams({ tab: item.id })}
            className={`rounded-lg px-4 py-2 text-sm ${tab === item.id ? "bg-ink text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "cameras" && <CamerasPage embedded />}
      {tab === "users" && isAdmin && <UsersPage embedded />}
      {tab === "model" && isAdmin && settings && (
        <>
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
            <button type="button" onClick={() => void persistModel()} className="rounded-lg bg-teal px-5 py-2.5 text-sm text-white hover:bg-teal-2">
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
        </>
      )}
      {tab === "appearance" && isAdmin && appearance && (
        <>
          <div className="grid gap-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">系统名称</span>
              <input
                value={appearance.systemName}
                onChange={(e) => setAppearance({ ...appearance, systemName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">副标题</span>
              <input
                value={appearance.tagline}
                onChange={(e) => setAppearance({ ...appearance, tagline: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">公司名</span>
              <input
                value={appearance.companyName}
                onChange={(e) => setAppearance({ ...appearance, companyName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">版权信息</span>
              <input
                value={appearance.copyright}
                onChange={(e) => setAppearance({ ...appearance, copyright: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">主题色</span>
              <input
                type="color"
                value={appearance.themeColor}
                onChange={(e) => setAppearance({ ...appearance, themeColor: e.target.value })}
                className="h-10 w-20 rounded-lg border border-slate-300"
              />
            </label>
            <ImageField
              label="系统 Logo"
              preview={appearance.logoUrl}
              onFile={(file) => {
                void uploadAppearanceImage("logo", file)
                  .then((next) => {
                    setAppearance(next);
                    return refresh();
                  })
                  .catch((err: Error) => setError(err.message));
              }}
            />
            <ImageField
              label="登录页图片"
              preview={appearance.loginImageUrl}
              onFile={(file) => {
                void uploadAppearanceImage("login-image", file)
                  .then((next) => {
                    setAppearance(next);
                    return refresh();
                  })
                  .catch((err: Error) => setError(err.message));
              }}
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void persistAppearance()} className="rounded-lg bg-teal px-5 py-2.5 text-sm text-white hover:bg-teal-2">
              {saved ? "已保存" : "保存外观"}
            </button>
            <button
              type="button"
              onClick={() => {
                void resetAppearance()
                  .then((next) => {
                    setAppearance(next);
                    return refresh();
                  })
                  .catch((err: Error) => setError(err.message));
              }}
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm hover:bg-slate-50"
            >
              重置外观
            </button>
          </div>
        </>
      )}
    </div>
  );
}
