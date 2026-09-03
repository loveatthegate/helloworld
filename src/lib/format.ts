export function formatTime(sec?: number | null) {
  if (sec == null || Number.isNaN(sec)) return "—";
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = (s - m * 60).toFixed(1);
  return `${m}:${r.padStart(4, "0")}`;
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("zh-CN", { hour12: false });
}

export const verdictLabel: Record<string, string> = {
  pass: "满足",
  fail: "不满足",
  uncertain: "存疑",
  not_observed: "未观察到",
};

export const statusLabel: Record<string, string> = {
  uploaded: "已上传",
  parsing: "解析中",
  ready: "已就绪",
  failed: "失败",
  uploading: "抽帧上传中",
  analyzing: "分析中",
  completed: "已完成",
};

export const resultLabel: Record<string, string> = {
  pass: "总体满足",
  fail: "存在不合规",
  partial: "部分满足",
};
