export type AuthUser = {
  id: number;
  username: string;
  displayName: string;
  role: "super_admin" | "user";
};

export type VlmStatus = {
  ready: boolean;
  mode: "gateway" | "byok" | "settings" | "none" | "hidden" | string;
  provider?: string;
  model?: string;
  providers?: { gemini: boolean; openai: boolean; anthropic: boolean };
};

export type VlmModel = {
  id: string;
  provider: "gemini" | "openai" | "anthropic";
  label: string;
  hint: string;
};

export type Settings = {
  defaultModel: string;
  provider: string;
  modelName: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
  baseUrl: string;
  frameIntervalSec: number;
  maxFrames: number;
  availableModels: VlmModel[];
  intervals: number[];
  vlm: VlmStatus;
};

export type Sop = {
  id: number;
  title: string;
  originalFilename: string;
  contentType: string;
  blobKey: string;
  status: string;
  summary: string | null;
  modelUsed?: string | null;
  parseError: string | null;
  createdAt: string;
  updatedAt: string;
  checkItemCount?: number;
  ownerName?: string;
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
  sourceType?: "video" | "images" | string;
  videoFilename: string;
  videoBlobKey: string | null;
  videoDurationSec: number | null;
  frameIntervalSec: number;
  maxFrames: number;
  modelUsed?: string;
  status: string;
  overallResult: string | null;
  overallSummary: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  sopTitle?: string;
  ownerName?: string;
  failCount?: number;
  passCount?: number;
  coverUrl?: string | null;
  videoUrl?: string | null;
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
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: init?.body instanceof FormData ? init.headers : { ...(init?.headers || {}) },
  });
  if (res.status === 401 && !path.startsWith("/api/login") && !path.startsWith("/api/me")) {
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
    throw new Error(err.error || `请求失败 (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const login = (username: string, password: string) =>
  api<{ user: AuthUser }>("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

export const logout = () => api<{ ok: boolean }>("/api/logout", { method: "POST" });
export const getMe = () =>
  api<{ user: AuthUser; defaults: { frameIntervalSec: number; maxFrames: number; intervals: number[] } }>("/api/me");

export const getSettings = () => api<Settings>("/api/settings");
export const saveSettings = (body: Record<string, unknown>) =>
  api<Settings>("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const testSettings = () =>
  api<{ ok: boolean; sample?: string; model?: string; provider?: string; error?: string }>("/api/settings/test", {
    method: "POST",
  });

export const listUsers = () =>
  api<Array<{ id: number; username: string; displayName: string; role: string; isActive: boolean; createdAt: string }>>(
    "/api/users",
  );
export const createUser = (body: { username: string; displayName: string; password: string }) =>
  api("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const patchUser = (id: number, body: { displayName?: string; isActive?: boolean; password?: string }) =>
  api(`/api/users/${id}`, {
    method: "PATCH",
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
