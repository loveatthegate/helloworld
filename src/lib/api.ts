export type VlmStatus = {
  ready: boolean;
  mode: "gateway" | "byok" | "none";
  providers: { gemini: boolean; openai: boolean; anthropic: boolean };
};

export type VlmModel = {
  id: string;
  provider: "gemini" | "openai" | "anthropic";
  label: string;
  hint: string;
};

export type Settings = {
  defaultModel: string;
  frameIntervalSec: number;
  maxFrames: number;
  availableModels: VlmModel[];
  vlm: VlmStatus;
};

export type Sop = {
  id: number;
  title: string;
  originalFilename: string;
  contentType: string;
  blobKey: string;
  status: "uploaded" | "parsing" | "ready" | "failed" | string;
  summary: string | null;
  modelUsed: string | null;
  parseError: string | null;
  createdAt: string;
  updatedAt: string;
  checkItemCount?: number;
};

export type CheckItem = {
  id: number;
  sopId: number;
  stepOrder: number;
  title: string;
  description: string | null;
  keyActions: string[] | null;
  passCriteria: string | null;
  riskHint: string | null;
  category: string | null;
};

export type Analysis = {
  id: number;
  sopId: number;
  title: string;
  videoFilename: string;
  videoBlobKey: string | null;
  videoDurationSec: number | null;
  frameIntervalSec: number;
  maxFrames: number;
  modelUsed: string;
  status: string;
  overallResult: string | null;
  overallSummary: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  sopTitle?: string;
};

export type Frame = {
  id: number;
  analysisId: number;
  frameIndex: number;
  timestampSec: number;
  blobKey: string;
  url: string;
};

export type ItemResult = {
  id: number;
  verdict: string;
  confidence: number | null;
  reasoning: string | null;
  evidenceFrameIds: number[] | null;
  observedAtSec: number | null;
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
    throw new Error(err.error || `请求失败 (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const getSettings = () => api<Settings>("/api/settings");
export const saveSettings = (body: Partial<Settings>) =>
  api<Settings>("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const getDashboard = () =>
  api<{
    sops: number;
    sopsReady: number;
    analyses: number;
    analysesCompleted: number;
    recent: Analysis[];
    vlm: VlmStatus;
  }>("/api/dashboard");

export const listSops = () => api<Sop[]>("/api/sops");
export const getSop = (id: number) => api<Sop & { items: CheckItem[] }>(`/api/sops/${id}`);
export const reparseSop = (id: number, model?: string) =>
  api<Sop>(`/api/sops/${id}/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });

export const listAnalyses = () => api<Analysis[]>("/api/analyses");
export const getAnalysis = (id: number) =>
  api<
    Analysis & {
      sop: Sop;
      frames: Frame[];
      items: Array<CheckItem & { result: ItemResult | null; evidence: Frame[] }>;
    }
  >(`/api/analyses/${id}`);
