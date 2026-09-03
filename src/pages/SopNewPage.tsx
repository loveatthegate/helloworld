import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileDrop } from "../components/FileDrop";
import { ModelSelect } from "../components/ModelSelect";
import { api, getSettings, type Settings } from "../lib/api";

export function SopNewPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setModel(s.defaultModel);
    });
  }, []);

  const submit = async () => {
    if (!file) {
      setError("请选择 SOP 文件");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      if (title.trim()) form.set("title", title.trim());
      form.set("model", model);
      const created = await api<{ id: number }>("/api/sops", { method: "POST", body: form });
      navigate(`/sops/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setBusy(false);
    }
  };

  const loadSample = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/samples/ppe-sop.md");
      const text = await res.text();
      const sample = new File([text], "个人防护装备穿戴作业指导书.md", { type: "text/markdown" });
      setFile(sample);
      setTitle("个人防护装备穿戴作业指导书");
    } catch {
      setError("无法加载示例手册");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">上传 SOP 手册</h1>
        <p className="mt-1 text-sm text-slate-500">支持 PDF、DOCX、PNG/JPG、TXT、Markdown。解析后会生成可交互检查项。</p>
      </div>
      <FileDrop
        accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,.txt,.md"
        label="拖入或选择手册文件"
        hint="演示阶段请小于 5.5MB"
        file={file}
        onFile={setFile}
      />
      <div className="grid gap-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">手册标题（可选）</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-2"
            placeholder="默认使用文件名"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">解析模型</span>
          <ModelSelect models={settings?.availableModels ?? []} value={model} onChange={setModel} />
        </label>
        {settings?.vlm.mode === "none" && (
          <p className="text-xs text-amber-700">未配置 VLM 时，文本手册会先用本地规则抽取检查项，便于验证界面。</p>
        )}
      </div>
      {error && <p className="text-rose-600 text-sm">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="rounded-lg bg-teal px-5 py-2.5 text-sm text-white hover:bg-teal-2 disabled:opacity-60"
        >
          {busy ? "提交中…" : "上传并解析"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadSample()}
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm hover:bg-slate-50"
        >
          填入示例手册
        </button>
      </div>
    </div>
  );
}
