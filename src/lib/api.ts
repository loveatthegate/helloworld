export type AuthUser = {
  id: number;
  username: string;
  displayName: string;
  role: "super_admin" | "user";
};

export type VlmStatus = {
  ready: boolean;
  model?: string;
};

export type VlmModel = {
  id: string;
  label: string;
  hint: string;
};

export type Branding = {
  systemName: string;
  tagline: string;
  companyName: string;
  copyright: string;
  themeColor: string;
  logoUrl: string | null;
  loginImageUrl: string | null;
};

export type Settings = {
  defaultModel: string;
  modelName: string;
  frameIntervalSec: number;
  maxFrames: number;
  availableModels: VlmModel[];
  intervals: number[];
  vlm: VlmStatus;
  appearance: Branding;
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
  deletedAt?: string | null;
  analysisCount?: number;
  analyzingCount?: number;
};

export type ItemResult = {
  id: number;
  verdict: string;
  confidence: number | null;
  reasoning: string | null;
  evidenceFrameIds: number[] | null;
  observedAtSec: number | null;
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
  scope?: "throughout" | "step" | "after_event" | string;
  judgeType?: string;
  missingEvidence?: string;
  evidenceFrom?: string;
  segmentSource?: string;
  result?: ItemResult | null;
  phase?: "pending" | "current" | "done" | "throughout" | "waiting";
};

export type Camera = {
  id: number;
  name: string;
  rtspUrl?: string | null;
  previewUrl?: string | null;
  locked?: boolean;
  role: "global" | "detail" | string;
  mount: "fixed" | "mobile" | string;
};

export type WorkSession = {
  id: number;
  sopId: number;
  cameraId: number;
  detailCameraId?: number | null;
  analysisId?: number | null;
  mode: string;
  status: string;
  waveIndex: number;
  groupKey: string;
  currentStepOrder: number;
  suggestedStepOrder?: number | null;
  title: string;
  workerToken: string;
  workerPath?: string;
  startedAt?: string;
  endedAt?: string | null;
  cameraName?: string;
  sop?: Sop;
  camera?: Camera | null;
  detailCamera?: Camera | null;
  items?: CheckItem[];
  frames?: Frame[];
  alerts?: Array<{ id: number; message?: string | null; createdAt?: string }>;
  events?: Array<{ id: number; kind: string; stepOrder?: number | null; message?: string | null; actor?: string }>;
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
  progressStep?: number | null;
  progressTotal?: number | null;
  progressMessage?: string | null;
  progressUpdatedAt?: string | null;
  stalled?: boolean;
  sessionId?: number | null;
  waveIndex?: number | null;
  cameraId?: number | null;
  workMode?: string | null;
};

export type Frame = {
  id: number;
  analysisId: number;
  frameIndex: number;
  timestampSec: number;
  blobKey: string;
  url: string;
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: init?.body instanceof FormData ? init.headers : { ...(init?.headers || {}) },
  });
  if (
    res.status === 401 &&
    !path.startsWith("/api/login") &&
    !path.startsWith("/api/me") &&
    !path.startsWith("/api/work")
  ) {
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
  api<{
    user: AuthUser;
    defaults?: { frameIntervalSec: number; maxFrames: number; intervals: number[] };
    branding?: Branding;
  }>("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

export const logout = () => api<{ ok: boolean }>("/api/logout", { method: "POST" });
export const getMe = () =>
  api<{
    user: AuthUser;
    defaults: { frameIntervalSec: number; maxFrames: number; intervals: number[] };
    branding?: Branding;
  }>("/api/me");

export const getBranding = () => api<Branding>("/api/branding");
export const saveAppearance = (body: Record<string, unknown>) =>
  api<Branding>("/api/settings/appearance", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const resetAppearance = () => api<Branding>("/api/settings/appearance/reset", { method: "POST" });
export const uploadAppearanceImage = (kind: "logo" | "login-image", file: File) => {
  const form = new FormData();
  form.set("file", file);
  return api<Branding>(`/api/settings/appearance/${kind}`, { method: "POST", body: form });
};

export const getSettings = () => api<Settings>("/api/settings");
export const saveSettings = (body: Record<string, unknown>) =>
  api<Settings>("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const testSettings = () =>
  api<{ ok: boolean; sample?: string; model?: string; error?: string }>("/api/settings/test", {
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
    liveSessions?: WorkSession[];
    vlm: VlmStatus;
  }>("/api/dashboard");

export const touchDemoStream = () => api<{ ok: boolean }>("/api/demo-stream/touch", { method: "POST" });

export const listCameras = () => api<Camera[]>("/api/cameras");
export const createCamera = (body: Partial<Camera> & { name: string }) =>
  api<Camera>("/api/cameras", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const patchCamera = (id: number, body: Partial<Camera>) =>
  api<Camera>(`/api/cameras/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const deleteCamera = (id: number) => api<{ ok: boolean }>(`/api/cameras/${id}`, { method: "DELETE" });

export const listLiveSessions = () => api<WorkSession[]>("/api/live/sessions");
export const createLiveSession = (body: { sopId: number; cameraId: number; detailCameraId?: number; mode: string }) =>
  api<WorkSession>("/api/live/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const getLiveSession = (id: number) => api<WorkSession>(`/api/live/sessions/${id}`);
export const confirmLiveStep = (id: number, stepOrder?: number) =>
  api<WorkSession>(`/api/live/sessions/${id}/confirm-step`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stepOrder }),
  });
export const dismissLiveSuggest = (id: number) =>
  api<WorkSession>(`/api/live/sessions/${id}/dismiss-suggest`, { method: "POST" });
export const endLiveSession = (id: number) =>
  api<{ session: WorkSession; analysis: Analysis | null; watch: WorkSession | null }>(`/api/live/sessions/${id}/end`, {
    method: "POST",
  });
export const nextLiveSession = (id: number) =>
  api<WorkSession>(`/api/live/sessions/${id}/next`, { method: "POST" });
export const uploadLiveFrame = (id: number, body: { dataBase64: string; timestampSec?: number; cameraRole?: string }) =>
  api<{ ok: boolean }>(`/api/live/sessions/${id}/frames`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const suggestLiveStep = (id: number, stepOrder: number) =>
  api<WorkSession>(`/api/live/sessions/${id}/suggest-step`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stepOrder }),
  });

export const getWorkSession = (token: string) => api<WorkSession>(`/api/work/${token}`);
export const workConfirmStep = (token: string, stepOrder?: number) =>
  api<WorkSession>(`/api/work/${token}/confirm-step`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stepOrder }),
  });
export const workEndSession = (token: string) => api<WorkSession>(`/api/work/${token}/end`, { method: "POST" });

export const patchCheckItem = (sopId: number, itemId: number, body: Partial<CheckItem>) =>
  api<CheckItem>(`/api/sops/${sopId}/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const listSops = () => api<Sop[]>("/api/sops");
export const getSop = (id: number) => api<Sop & { items: CheckItem[] }>(`/api/sops/${id}`);
export const reparseSop = (id: number, model?: string) =>
  api<Sop>(`/api/sops/${id}/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });

export const deleteSop = (id: number) => api<{ ok: boolean }>(`/api/sops/${id}`, { method: "DELETE" });
export const deleteAnalysis = (id: number) => api<{ ok: boolean }>(`/api/analyses/${id}`, { method: "DELETE" });
export const skipAnalysisItem = (analysisId: number, itemId: number) =>
  api<{ ok: boolean }>(`/api/analyses/${analysisId}/items/${itemId}/skip`, { method: "POST" });

export const listAnalyses = () => api<Analysis[]>("/api/analyses");
export const getAnalysis = (id: number) =>
  api<
    Analysis & {
      sop: Sop;
      sopDeleted?: boolean;
      frames: Frame[];
      items: Array<CheckItem & { result: ItemResult | null; evidence: Frame[] }>;
    }
  >(`/api/analyses/${id}`);
