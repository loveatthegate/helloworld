import { getEnv, isNetlifyRuntime } from "../../../db/env";

function siteOrigin(): string {
  return getEnv("URL") || getEnv("DEPLOY_PRIME_URL") || "http://localhost:8888";
}

export function enqueueParse(sopId: number, parseFn: (id: number) => Promise<void>) {
  if (isNetlifyRuntime()) {
    void fetch(`${siteOrigin()}/.netlify/functions/parse-sop-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sopId }),
    });
    return;
  }
  setTimeout(() => {
    void parseFn(sopId).catch((err) => console.error("parse sop failed", err));
  }, 0);
}

export function enqueueAnalyze(analysisId: number, analyzeFn: (id: number) => Promise<void>) {
  if (isNetlifyRuntime()) {
    void fetch(`${siteOrigin()}/.netlify/functions/analyze-video-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysisId }),
    });
    return;
  }
  setTimeout(() => {
    void analyzeFn(analysisId).catch((err) => console.error("analyze video failed", err));
  }, 0);
}
