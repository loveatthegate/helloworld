import { getEnv, isNetlifyRuntime } from "../../../db/env";

function siteOrigin(): string {
  return getEnv("URL") || getEnv("DEPLOY_PRIME_URL") || "http://localhost:8888";
}

async function invokeBackground(name: string, body: unknown) {
  const res = await fetch(`${siteOrigin()}/.netlify/functions/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 202) {
    const text = await res.text().catch(() => "");
    throw new Error(`后台任务未能启动（${res.status}${text ? `: ${text.slice(0, 120)}` : ""}）`);
  }
}

export async function enqueueParse(sopId: number, parseFn: (id: number) => Promise<void>) {
  if (isNetlifyRuntime()) {
    await invokeBackground("parse-sop-background", { sopId });
    return;
  }
  setTimeout(() => {
    void parseFn(sopId).catch((err) => console.error("parse sop failed", err));
  }, 0);
}

export async function enqueueAnalyze(analysisId: number, analyzeFn: (id: number) => Promise<void>) {
  if (isNetlifyRuntime()) {
    await invokeBackground("analyze-video-background", { analysisId });
    return;
  }
  setTimeout(() => {
    void analyzeFn(analysisId).catch((err) => console.error("analyze video failed", err));
  }, 0);
}
