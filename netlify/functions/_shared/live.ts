import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Hono } from "hono";
import { getDb, schema } from "../../../db/index";
import { getBlob, putBlob } from "./blobs";
import { parseSingleStepJson } from "./json";
import { FAST_ANALYZE_MODEL } from "./models";
import { generateVlmText, getVlmStatus } from "./vlm";
import { captureStreamFrame } from "./rtsp-snapshot";
import { isDemoRtsp, touchDemoPublisher } from "./rtsp-publisher";
import { canSee, isAdmin, type AuthUser } from "./auth";
import { getSettingsRow, normalizeInterval } from "./settings";
import { getEnv } from "../../../db/env";

type App = Hono<{ Variables: { user: AuthUser } }>;

const alertThrottle = new Map<number, number>();

function workerToken() {
  return randomBytes(16).toString("hex");
}

function groupKey(cameraId: number, sopId: number) {
  const day = new Date().toISOString().slice(0, 10);
  return `${cameraId}-${sopId}-${day}`;
}

function overallFromVerdicts(verdicts: string[]): "pass" | "fail" | "partial" {
  const meaningful = verdicts.filter((v) => v !== "skipped" && v !== "not_applicable");
  if (meaningful.some((v) => v === "fail")) return "fail";
  if (meaningful.length > 0 && meaningful.every((v) => v === "pass")) return "pass";
  return "partial";
}

async function requireCamera(user: AuthUser, id: number) {
  const db = await getDb();
  const [row] = await db.select().from(schema.cameras).where(eq(schema.cameras.id, id)).limit(1);
  if (!row) return null;
  if (row.locked) return row;
  if (!canSee(user, row.userId)) return null;
  return row;
}

async function requireSession(user: AuthUser, id: number) {
  const db = await getDb();
  const [row] = await db.select().from(schema.workSessions).where(eq(schema.workSessions.id, id)).limit(1);
  if (!row || !canSee(user, row.userId)) return null;
  return row;
}

async function sessionByToken(token: string) {
  const db = await getDb();
  const [row] = await db.select().from(schema.workSessions).where(eq(schema.workSessions.workerToken, token)).limit(1);
  return row ?? null;
}

async function retireWatching(sessionId: number) {
  const db = await getDb();
  await db
    .update(schema.workSessions)
    .set({ status: "completed", endedAt: new Date() })
    .where(eq(schema.workSessions.id, sessionId));
}

function demoCameraUrls() {
  return {
    rtspUrl: getEnv("DEMO_RTSP_URL") || "rtsp://mediamtx:8554/demo",
    previewUrl: "/samples/demo.mp4",
  };
}

async function ensureDemoCamera(user: AuthUser) {
  const db = await getDb();
  const urls = demoCameraUrls();
  const all = await db.select().from(schema.cameras);
  let demo = all.find((row) => row.locked) || all.find((row) => row.name.startsWith("演示"));
  if (!demo) {
    const [created] = await db
      .insert(schema.cameras)
      .values({
        userId: user.id,
        name: "演示实时流",
        rtspUrl: urls.rtspUrl,
        previewUrl: urls.previewUrl,
        role: "global",
        mount: "fixed",
        locked: true,
      })
      .returning();
    demo = created;
  } else if (!demo.locked || demo.rtspUrl !== urls.rtspUrl || demo.previewUrl !== urls.previewUrl || demo.name !== "演示实时流") {
    const [updated] = await db
      .update(schema.cameras)
      .set({
        name: "演示实时流",
        rtspUrl: urls.rtspUrl,
        previewUrl: urls.previewUrl,
        locked: true,
        role: "global",
        mount: "fixed",
      })
      .where(eq(schema.cameras.id, demo.id))
      .returning();
    demo = updated;
  }
  const others = isAdmin(user) ? all.filter((row) => row.id !== demo.id) : all.filter((row) => row.id !== demo.id && row.userId === user.id);
  return [demo, ...others];
}

async function loadItems(sopId: number) {
  const db = await getDb();
  return db
    .select()
    .from(schema.sopCheckItems)
    .where(eq(schema.sopCheckItems.sopId, sopId))
    .orderBy(asc(schema.sopCheckItems.stepOrder));
}

async function upsertResult(
  analysisId: number,
  checkItemId: number,
  payload: {
    verdict: string;
    confidence?: number;
    reasoning: string;
    evidenceFrameIds?: number[];
    observedAtSec?: number | null;
  },
) {
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(schema.analysisItemResults)
    .where(
      and(eq(schema.analysisItemResults.analysisId, analysisId), eq(schema.analysisItemResults.checkItemId, checkItemId)),
    )
    .limit(1);
  if (existing) {
    await db
      .update(schema.analysisItemResults)
      .set({
        verdict: payload.verdict,
        confidence: payload.confidence ?? existing.confidence,
        reasoning: payload.reasoning,
        evidenceFrameIds: payload.evidenceFrameIds ?? existing.evidenceFrameIds,
        observedAtSec: payload.observedAtSec ?? existing.observedAtSec,
      })
      .where(eq(schema.analysisItemResults.id, existing.id));
    return;
  }
  await db.insert(schema.analysisItemResults).values({
    analysisId,
    checkItemId,
    verdict: payload.verdict,
    confidence: payload.confidence ?? 0.4,
    reasoning: payload.reasoning,
    evidenceFrameIds: payload.evidenceFrameIds ?? [],
    observedAtSec: payload.observedAtSec ?? null,
  });
}

async function analyzeItemsOnFrames(
  analysisId: number,
  items: Array<typeof schema.sopCheckItems.$inferSelect>,
  frames: Array<typeof schema.analysisFrames.$inferSelect>,
) {
  if (!items.length || !frames.length) return;
  const vlm = await getVlmStatus();
  if (!vlm.ready) return;
  const picked = frames.slice(-4);
  const loaded = await Promise.all(
    picked.map(async (frame) => {
      const blob = await getBlob(frame.blobKey);
      if (!blob) return null;
      return {
        frame,
        image: { mimeType: blob.contentType || "image/jpeg", base64: Buffer.from(blob.data).toString("base64") },
      };
    }),
  );
  const ready = loaded.filter((row): row is NonNullable<typeof row> => Boolean(row));
  if (!ready.length) return;
  for (const item of items) {
    const matching = ready.filter((row) => {
      if (item.evidenceFrom === "any" || !row.frame.cameraRole || row.frame.cameraRole === "any") return true;
      return row.frame.cameraRole === item.evidenceFrom;
    });
    const use = matching.length ? matching : item.missingEvidence === "not_applicable" ? [] : ready;
    if (!use.length) {
      await upsertResult(analysisId, item.id, {
        verdict: item.missingEvidence === "not_applicable" ? "skipped" : "not_observed",
        reasoning:
          item.missingEvidence === "not_applicable"
            ? "该机位拍不到此项，已标为不适用，不计入违规。"
            : "没有匹配该检查项的有效画面。",
        evidenceFrameIds: [],
      });
      continue;
    }
    try {
      const actions = Array.isArray(item.keyActions) ? item.keyActions.join("；") : "";
      const raw = await generateVlmText(
        FAST_ANALYZE_MODEL,
        {
          text: `你是现场履职审查员。只判断这一项。只返回 JSON：{"verdict":"pass","confidence":0.0,"reasoning":"看到了什么"}
verdict 只能是 pass / fail / uncertain / not_observed。作用域=${item.scope} 判定=${item.judgeType}。
${item.title}
${item.description || ""}
关键动作：${actions}
通过标准：${item.passCriteria || ""}`,
          images: use.map((row) => row.image),
        },
        undefined,
        500,
      );
      const found = parseSingleStepJson(raw);
      await upsertResult(analysisId, item.id, {
        verdict: found.verdict,
        confidence: found.confidence,
        reasoning: found.reasoning || "模型未给出说明",
        evidenceFrameIds: use.map((row) => row.frame.id),
        observedAtSec: use[0]?.frame.timestampSec ?? null,
      });
    } catch (error) {
      await upsertResult(analysisId, item.id, {
        verdict: "uncertain",
        reasoning: error instanceof Error ? error.message : "分析未完成",
        evidenceFrameIds: use.map((row) => row.frame.id),
      });
    }
  }
}

async function maybeAlertProhibitions(session: typeof schema.workSessions.$inferSelect) {
  if (!session.analysisId) return;
  const now = Date.now();
  if ((alertThrottle.get(session.id) ?? 0) + 15_000 > now) return;
  alertThrottle.set(session.id, now);
  const items = await loadItems(session.sopId);
  const prohibitions = items.filter((item) => item.judgeType === "prohibition" || item.scope === "throughout");
  if (!prohibitions.length) return;
  const db = await getDb();
  const frames = await db
    .select()
    .from(schema.analysisFrames)
    .where(eq(schema.analysisFrames.analysisId, session.analysisId))
    .orderBy(desc(schema.analysisFrames.frameIndex))
    .limit(6);
  await analyzeItemsOnFrames(session.analysisId, prohibitions.filter((i) => i.judgeType === "prohibition"), frames);
  const results = await db
    .select()
    .from(schema.analysisItemResults)
    .where(eq(schema.analysisItemResults.analysisId, session.analysisId));
  const fails = results.filter((r) => r.verdict === "fail");
  for (const fail of fails) {
    const item = items.find((i) => i.id === fail.checkItemId);
    if (!item || item.judgeType !== "prohibition") continue;
    await db.insert(schema.sessionEvents).values({
      sessionId: session.id,
      kind: "alert",
      actor: "system",
      message: `禁则触发：${item.title}`,
    });
  }
}

async function finalizeAnalysis(session: typeof schema.workSessions.$inferSelect) {
  if (!session.analysisId) return null;
  const db = await getDb();
  const items = await loadItems(session.sopId);
  const frames = await db
    .select()
    .from(schema.analysisFrames)
    .where(eq(schema.analysisFrames.analysisId, session.analysisId))
    .orderBy(asc(schema.analysisFrames.frameIndex));
  const confirmed = new Set(
    (
      await db
        .select()
        .from(schema.sessionEvents)
        .where(and(eq(schema.sessionEvents.sessionId, session.id), eq(schema.sessionEvents.kind, "confirm_step")))
    ).map((e) => e.stepOrder),
  );
  const toAnalyze = items.filter((item) => {
    if (item.scope === "throughout") return true;
    if (item.scope === "after_event") return confirmed.has(item.stepOrder);
    return confirmed.has(item.stepOrder) || item.stepOrder <= session.currentStepOrder;
  });
  await analyzeItemsOnFrames(session.analysisId, toAnalyze, frames);
  for (const item of items) {
    const [existing] = await db
      .select()
      .from(schema.analysisItemResults)
      .where(
        and(
          eq(schema.analysisItemResults.analysisId, session.analysisId),
          eq(schema.analysisItemResults.checkItemId, item.id),
        ),
      )
      .limit(1);
    if (existing) continue;
    if (item.scope === "after_event") {
      await upsertResult(session.analysisId, item.id, {
        verdict: "skipped",
        reasoning: "未发生对应事件，本项不适用。",
      });
      continue;
    }
    if (item.scope === "step" && !confirmed.has(item.stepOrder) && item.stepOrder > session.currentStepOrder) {
      await upsertResult(session.analysisId, item.id, {
        verdict: "not_observed",
        reasoning: "未切到该步，记为未观察到，不记为不满足。",
      });
      continue;
    }
    await upsertResult(session.analysisId, item.id, {
      verdict: frames.length ? "not_observed" : item.missingEvidence === "not_applicable" ? "skipped" : "not_observed",
      reasoning: frames.length ? "窗口内未见有效证据。" : "本场没有可用画面。",
    });
  }
  const results = await db
    .select()
    .from(schema.analysisItemResults)
    .where(eq(schema.analysisItemResults.analysisId, session.analysisId));
  const overall = overallFromVerdicts(results.map((r) => r.verdict));
  await db
    .update(schema.analyses)
    .set({
      status: "completed",
      overallResult: overall,
      overallSummary: `第 ${session.waveIndex} 波场次报告。未切段步骤记为未观察到，不与其他波次合并满足率。`,
      completedAt: new Date(),
      progressMessage: "场次已结束",
      progressUpdatedAt: new Date(),
    })
    .where(eq(schema.analyses.id, session.analysisId));
  const [analysis] = await db.select().from(schema.analyses).where(eq(schema.analyses.id, session.analysisId)).limit(1);
  return analysis;
}

async function assembleSession(session: typeof schema.workSessions.$inferSelect) {
  const db = await getDb();
  const [sop] = await db.select().from(schema.sops).where(eq(schema.sops.id, session.sopId)).limit(1);
  const [camera] = await db.select().from(schema.cameras).where(eq(schema.cameras.id, session.cameraId)).limit(1);
  const detail = session.detailCameraId
    ? (await db.select().from(schema.cameras).where(eq(schema.cameras.id, session.detailCameraId)).limit(1))[0]
    : null;
  const items = await loadItems(session.sopId);
  const events = await db
    .select()
    .from(schema.sessionEvents)
    .where(eq(schema.sessionEvents.sessionId, session.id))
    .orderBy(desc(schema.sessionEvents.createdAt))
    .limit(40);
  let results: Array<typeof schema.analysisItemResults.$inferSelect> = [];
  let frames: Array<typeof schema.analysisFrames.$inferSelect> = [];
  if (session.analysisId) {
    results = await db
      .select()
      .from(schema.analysisItemResults)
      .where(eq(schema.analysisItemResults.analysisId, session.analysisId));
    frames = await db
      .select()
      .from(schema.analysisFrames)
      .where(eq(schema.analysisFrames.analysisId, session.analysisId))
      .orderBy(asc(schema.analysisFrames.frameIndex));
  }
  const resultByItem = new Map(results.map((r) => [r.checkItemId, r]));
  const alerts = events.filter((e) => e.kind === "alert").slice(0, 8);
  return {
    ...session,
    sop,
    camera,
    detailCamera: detail ?? null,
    workerPath: `/work/${session.workerToken}`,
    alerts,
    events,
    frames: frames.slice(-24).map((f) => ({
      ...f,
      url: `/api/files?key=${encodeURIComponent(f.blobKey)}`,
    })),
    items: items.map((item) => {
      const result = resultByItem.get(item.id) ?? null;
      let phase: "pending" | "current" | "done" | "throughout" | "waiting" = "pending";
      if (item.scope === "throughout" || item.judgeType === "prohibition") phase = "throughout";
      else if (item.scope === "after_event") phase = "waiting";
      else if (item.stepOrder < session.currentStepOrder) phase = "done";
      else if (item.stepOrder === session.currentStepOrder) phase = "current";
      return { ...item, result, phase };
    }),
  };
}

async function createLiveSession(input: {
  user: AuthUser;
  sopId: number;
  cameraId: number;
  detailCameraId?: number | null;
  mode: string;
  waveIndex: number;
  key: string;
}) {
  const db = await getDb();
  const [sop] = await db.select().from(schema.sops).where(eq(schema.sops.id, input.sopId)).limit(1);
  if (!sop || sop.deletedAt || sop.status !== "ready") throw new Error("请选择已解析完成的手册");
  const camera = await requireCamera(input.user, input.cameraId);
  if (!camera) throw new Error("点位不存在");
  if (camera.locked || isDemoRtsp(camera.rtspUrl)) touchDemoPublisher();
  const settings = await getSettingsRow();
  const title = `${sop.title} · 第 ${input.waveIndex} 波`;
  const [session] = await db
    .insert(schema.workSessions)
    .values({
      userId: input.user.id,
      sopId: input.sopId,
      cameraId: input.cameraId,
      detailCameraId: input.detailCameraId || null,
      mode: input.mode,
      status: "live",
      waveIndex: input.waveIndex,
      groupKey: input.key,
      currentStepOrder: input.mode === "patrol" ? 0 : 0,
      title,
      workerToken: workerToken(),
    })
    .returning();
  const [analysis] = await db
    .insert(schema.analyses)
    .values({
      userId: input.user.id,
      sopId: input.sopId,
      title,
      sourceType: "rtsp",
      videoFilename: camera.name,
      frameIntervalSec: normalizeInterval(settings.frameIntervalSec),
      maxFrames: settings.maxFrames,
      modelUsed: FAST_ANALYZE_MODEL,
      status: "analyzing",
      sessionId: session.id,
      waveIndex: input.waveIndex,
      cameraId: input.cameraId,
      workMode: input.mode,
      progressMessage: "实时核验进行中",
      progressUpdatedAt: new Date(),
    })
    .returning();
  await db.update(schema.workSessions).set({ analysisId: analysis.id }).where(eq(schema.workSessions.id, session.id));
  await db.insert(schema.sessionEvents).values({
    sessionId: session.id,
    kind: "start_session",
    actor: "supervisor",
    message: `开始第 ${input.waveIndex} 波`,
  });
  return { ...session, analysisId: analysis.id };
}

async function keepDemoIfNeeded(session: { status: string; cameraId: number; detailCameraId?: number | null }) {
  if (session.status !== "live" && session.status !== "watching") return;
  const db = await getDb();
  const ids = [session.cameraId, session.detailCameraId].filter((id): id is number => Boolean(id));
  if (!ids.length) return;
  const cams = await db.select().from(schema.cameras).where(inArray(schema.cameras.id, ids));
  if (cams.some((cam) => cam.locked || isDemoRtsp(cam.rtspUrl))) touchDemoPublisher();
}

export function registerLiveRoutes(app: App) {
  app.post("/demo-stream/touch", (c) => {
    touchDemoPublisher();
    return c.json({ ok: true });
  });

  app.get("/cameras", async (c) => {
    const user = c.get("user");
    const rows = await ensureDemoCamera(user);
    return c.json(rows.sort((a, b) => (b.id ?? 0) - (a.id ?? 0)));
  });

  app.post("/cameras", async (c) => {
    const user = c.get("user");
    const body = await c.req.json<{
      name: string;
      rtspUrl?: string;
      previewUrl?: string;
      role?: string;
      mount?: string;
    }>();
    if (!body.name?.trim()) return c.json({ error: "请填写点位名称" }, 400);
    const db = await getDb();
    const [created] = await db
      .insert(schema.cameras)
      .values({
        userId: user.id,
        name: body.name.trim().slice(0, 128),
        rtspUrl: body.rtspUrl?.trim() || "",
        previewUrl: body.previewUrl?.trim() || "",
        role: body.role === "detail" ? "detail" : "global",
        mount: body.mount === "mobile" ? "mobile" : "fixed",
      })
      .returning();
    return c.json(created, 201);
  });

  app.patch("/cameras/:id", async (c) => {
    const user = c.get("user");
    const camera = await requireCamera(user, Number(c.req.param("id")));
    if (!camera) return c.json({ error: "点位不存在" }, 404);
    if (camera.locked) return c.json({ error: "系统演示实时流不能修改或删除" }, 403);
    const body = await c.req.json<Partial<{ name: string; rtspUrl: string; previewUrl: string; role: string; mount: string }>>();
    const db = await getDb();
    const [updated] = await db
      .update(schema.cameras)
      .set({
        name: body.name?.trim() || camera.name,
        rtspUrl: body.rtspUrl !== undefined ? body.rtspUrl.trim() : camera.rtspUrl,
        previewUrl: body.previewUrl !== undefined ? body.previewUrl.trim() : camera.previewUrl,
        role: body.role === "detail" || body.role === "global" ? body.role : camera.role,
        mount: body.mount === "mobile" || body.mount === "fixed" ? body.mount : camera.mount,
      })
      .where(eq(schema.cameras.id, camera.id))
      .returning();
    return c.json(updated);
  });

  app.delete("/cameras/:id", async (c) => {
    const user = c.get("user");
    if (!isAdmin(user)) return c.json({ error: "仅管理员可删除点位" }, 403);
    const camera = await requireCamera(user, Number(c.req.param("id")));
    if (!camera) return c.json({ error: "点位不存在" }, 404);
    if (camera.locked) return c.json({ error: "系统演示实时流不能删除" }, 403);
    const db = await getDb();
    await db.delete(schema.cameras).where(eq(schema.cameras.id, camera.id));
    return c.json({ ok: true });
  });

  app.get("/live/sessions", async (c) => {
    const user = c.get("user");
    const db = await getDb();
    const rows = isAdmin(user)
      ? await db.select().from(schema.workSessions).orderBy(desc(schema.workSessions.startedAt)).limit(40)
      : await db
          .select()
          .from(schema.workSessions)
          .where(eq(schema.workSessions.userId, user.id))
          .orderBy(desc(schema.workSessions.startedAt))
          .limit(40);
    const cameras = rows.length
      ? await db.select().from(schema.cameras).where(inArray(schema.cameras.id, [...new Set(rows.map((r) => r.cameraId))]))
      : [];
    const camMap = new Map(cameras.map((cam) => [cam.id, cam]));
    return c.json(
      rows.map((row) => ({
        ...row,
        cameraName: camMap.get(row.cameraId)?.name,
      })),
    );
  });

  app.post("/live/sessions", async (c) => {
    const user = c.get("user");
    const body = await c.req.json<{
      sopId: number;
      cameraId: number;
      detailCameraId?: number;
      mode?: string;
    }>();
    const mode = body.mode === "batch" || body.mode === "patrol" ? body.mode : "sequential";
    const key = groupKey(body.cameraId, body.sopId);
    const db = await getDb();
    const peers = await db.select().from(schema.workSessions).where(eq(schema.workSessions.groupKey, key));
    const live = peers.find((p) => p.status === "live" || p.status === "watching");
    if (live?.status === "live") return c.json({ error: "该点位已有进行中的场次", sessionId: live.id }, 409);
    const waveIndex = peers.reduce((max, row) => Math.max(max, row.waveIndex || 0), 0) + 1;
    if (live?.status === "watching") {
      await retireWatching(live.id);
    }
    try {
      const session = await createLiveSession({
        user,
        sopId: body.sopId,
        cameraId: body.cameraId,
        detailCameraId: body.detailCameraId,
        mode,
        waveIndex,
        key,
      });
      return c.json(await assembleSession({ ...session, analysisId: session.analysisId }), 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "无法开场" }, 400);
    }
  });

  app.get("/live/sessions/:id", async (c) => {
    const user = c.get("user");
    const session = await requireSession(user, Number(c.req.param("id")));
    if (!session) return c.json({ error: "场次不存在" }, 404);
    await keepDemoIfNeeded(session);
    return c.json(await assembleSession(session));
  });

  app.post("/live/sessions/:id/confirm-step", async (c) => {
    const user = c.get("user");
    const session = await requireSession(user, Number(c.req.param("id")));
    if (!session || (session.status !== "live" && session.status !== "watching")) {
      return c.json({ error: "场次不可操作" }, 400);
    }
    const body = await c.req.json<{ stepOrder?: number; actor?: string }>().catch(() => ({} as { stepOrder?: number }));
    const items = await loadItems(session.sopId);
    const stepItems = items.filter((i) => i.scope === "step");
    const next = body.stepOrder ?? (session.suggestedStepOrder || session.currentStepOrder + 1 || stepItems[0]?.stepOrder || 1);
    const db = await getDb();
    await db
      .update(schema.workSessions)
      .set({ currentStepOrder: next, suggestedStepOrder: null })
      .where(eq(schema.workSessions.id, session.id));
    await db.insert(schema.sessionEvents).values({
      sessionId: session.id,
      kind: "confirm_step",
      stepOrder: next,
      actor: "supervisor",
      message: `确认进入第 ${next} 步`,
    });
    const updated = await requireSession(user, session.id);
    return c.json(await assembleSession(updated!));
  });

  app.post("/live/sessions/:id/suggest-step", async (c) => {
    const user = c.get("user");
    const session = await requireSession(user, Number(c.req.param("id")));
    if (!session || session.status !== "live") return c.json({ error: "场次不可操作" }, 400);
    const body = await c.req.json<{ stepOrder: number }>();
    const db = await getDb();
    await db
      .update(schema.workSessions)
      .set({ suggestedStepOrder: body.stepOrder })
      .where(eq(schema.workSessions.id, session.id));
    await db.insert(schema.sessionEvents).values({
      sessionId: session.id,
      kind: "suggest_step",
      stepOrder: body.stepOrder,
      actor: "system",
      message: `疑似进入第 ${body.stepOrder} 步`,
    });
    return c.json(await assembleSession((await requireSession(user, session.id))!));
  });

  app.post("/live/sessions/:id/dismiss-suggest", async (c) => {
    const user = c.get("user");
    const session = await requireSession(user, Number(c.req.param("id")));
    if (!session) return c.json({ error: "场次不存在" }, 404);
    const db = await getDb();
    await db.update(schema.workSessions).set({ suggestedStepOrder: null }).where(eq(schema.workSessions.id, session.id));
    return c.json(await assembleSession((await requireSession(user, session.id))!));
  });

  app.post("/live/sessions/:id/end", async (c) => {
    const user = c.get("user");
    const session = await requireSession(user, Number(c.req.param("id")));
    if (!session || session.status === "completed") return c.json({ error: "场次已结束" }, 400);
    const analysis = await finalizeAnalysis(session);
    const db = await getDb();
    await db
      .update(schema.workSessions)
      .set({ status: "completed", endedAt: new Date() })
      .where(eq(schema.workSessions.id, session.id));
    await db.insert(schema.sessionEvents).values({
      sessionId: session.id,
      kind: "end_session",
      actor: "supervisor",
      message: "结束本场",
    });
    let watch = null;
    if (session.mode === "batch") {
      const settings = await getSettingsRow();
      const [created] = await db
        .insert(schema.workSessions)
        .values({
          userId: session.userId,
          sopId: session.sopId,
          cameraId: session.cameraId,
          detailCameraId: session.detailCameraId,
          mode: session.mode,
          status: "watching",
          waveIndex: session.waveIndex,
          groupKey: session.groupKey,
          currentStepOrder: 0,
          title: `${session.title} · 场间值守`,
          workerToken: workerToken(),
        })
        .returning();
      const [watchAnalysis] = await db
        .insert(schema.analyses)
        .values({
          userId: session.userId,
          sopId: session.sopId,
          title: `${session.title} · 场间值守`,
          sourceType: "rtsp",
          videoFilename: "场间值守",
          frameIntervalSec: normalizeInterval(settings.frameIntervalSec),
          maxFrames: settings.maxFrames,
          modelUsed: FAST_ANALYZE_MODEL,
          status: "analyzing",
          sessionId: created.id,
          waveIndex: session.waveIndex,
          cameraId: session.cameraId,
          workMode: "watch",
          progressMessage: "场间只盯禁则与全程，不计入作业满足率",
          progressUpdatedAt: new Date(),
        })
        .returning();
      await db.update(schema.workSessions).set({ analysisId: watchAnalysis.id }).where(eq(schema.workSessions.id, created.id));
      watch = { ...created, analysisId: watchAnalysis.id };
    }
    return c.json({
      session: await assembleSession((await requireSession(user, session.id))!),
      analysis,
      watch,
    });
  });

  app.post("/live/sessions/:id/next", async (c) => {
    const user = c.get("user");
    const session = await requireSession(user, Number(c.req.param("id")));
    if (!session) return c.json({ error: "场次不存在" }, 404);
    const db = await getDb();
    if (session.status === "live") {
      await finalizeAnalysis(session);
      await db
        .update(schema.workSessions)
        .set({ status: "completed", endedAt: new Date() })
        .where(eq(schema.workSessions.id, session.id));
    }
    if (session.status === "watching") {
      await retireWatching(session.id);
    }
    const next = await createLiveSession({
      user,
      sopId: session.sopId,
      cameraId: session.cameraId,
      detailCameraId: session.detailCameraId,
      mode: session.mode === "sequential" ? "batch" : session.mode,
      waveIndex: session.waveIndex + 1,
      key: session.groupKey,
    });
    return c.json(await assembleSession({ ...next, analysisId: next.analysisId }));
  });

  app.post("/live/sessions/:id/frames", async (c) => {
    const user = c.get("user");
    const session = await requireSession(user, Number(c.req.param("id")));
    if (!session?.analysisId) return c.json({ error: "场次不可收帧" }, 400);
    const body = await c.req.json<{
      dataBase64: string;
      timestampSec?: number;
      cameraRole?: string;
    }>();
    if (!body.dataBase64) return c.json({ error: "没有画面" }, 400);
    const db = await getDb();
    const existing = await db
      .select()
      .from(schema.analysisFrames)
      .where(eq(schema.analysisFrames.analysisId, session.analysisId));
    const index = existing.length;
    const buf = Buffer.from(body.dataBase64, "base64");
    const key = `frames/${session.analysisId}/${String(index).padStart(4, "0")}.jpg`;
    await putBlob(key, buf, "image/jpeg");
    await db.insert(schema.analysisFrames).values({
      analysisId: session.analysisId,
      frameIndex: index,
      timestampSec: body.timestampSec ?? Date.now() / 1000,
      blobKey: key,
      cameraRole: body.cameraRole === "detail" ? "detail" : "global",
    });
    if (session.status === "live" || session.status === "watching") {
      void maybeAlertProhibitions(session);
    }
    return c.json({ ok: true, frameIndex: index });
  });

  app.get("/live/sessions/:id/snapshot", async (c) => {
    const user = c.get("user");
    const session = await requireSession(user, Number(c.req.param("id")));
    if (!session) return c.json({ error: "场次不存在" }, 404);
    const db = await getDb();
    const [camera] = await db.select().from(schema.cameras).where(eq(schema.cameras.id, session.cameraId)).limit(1);
    const source = camera?.rtspUrl || camera?.previewUrl;
    if (source) {
      try {
        const jpeg = await captureStreamFrame(source);
        return new Response(new Uint8Array(jpeg), {
          headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
        });
      } catch (error) {
        console.error("snapshot failed", error);
      }
    }
    if (session.analysisId) {
      const [frame] = await db
        .select()
        .from(schema.analysisFrames)
        .where(eq(schema.analysisFrames.analysisId, session.analysisId))
        .orderBy(desc(schema.analysisFrames.frameIndex))
        .limit(1);
      if (frame) {
        const blob = await getBlob(frame.blobKey);
        if (blob) {
          return new Response(blob.data, {
            headers: { "Content-Type": blob.contentType, "Cache-Control": "no-store" },
          });
        }
      }
    }
    return c.json({ error: "暂无画面，请配置 RTSP 或预览地址" }, 404);
  });

  app.post("/cameras/:id/snapshot", async (c) => {
    const user = c.get("user");
    const camera = await requireCamera(user, Number(c.req.param("id")));
    if (!camera) return c.json({ error: "点位不存在" }, 404);
    const source = camera.rtspUrl || camera.previewUrl;
    if (!source) return c.json({ error: "未配置取流地址" }, 400);
    try {
      const jpeg = await captureStreamFrame(source);
      return new Response(new Uint8Array(jpeg), {
        headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "取流失败" }, 502);
    }
  });

  app.patch("/sops/:id/items/:itemId", async (c) => {
    const user = c.get("user");
    const sopId = Number(c.req.param("id"));
    const itemId = Number(c.req.param("itemId"));
    const db = await getDb();
    const [sop] = await db.select().from(schema.sops).where(eq(schema.sops.id, sopId)).limit(1);
    if (!sop || !canSee(user, sop.userId)) return c.json({ error: "手册不存在" }, 404);
    const [item] = await db.select().from(schema.sopCheckItems).where(eq(schema.sopCheckItems.id, itemId)).limit(1);
    if (!item || item.sopId !== sopId) return c.json({ error: "检查项不存在" }, 404);
    const body = await c.req.json<Partial<typeof item>>();
    const [updated] = await db
      .update(schema.sopCheckItems)
      .set({
        scope: body.scope || item.scope,
        judgeType: body.judgeType || item.judgeType,
        missingEvidence: body.missingEvidence || item.missingEvidence,
        evidenceFrom: body.evidenceFrom || item.evidenceFrom,
        segmentSource: body.segmentSource || item.segmentSource,
      })
      .where(eq(schema.sopCheckItems.id, itemId))
      .returning();
    return c.json(updated);
  });

  app.get("/work/:token", async (c) => {
    const session = await sessionByToken(c.req.param("token"));
    if (!session) return c.json({ error: "作业链接无效" }, 404);
    return c.json(await assembleSession(session));
  });

  app.post("/work/:token/confirm-step", async (c) => {
    const session = await sessionByToken(c.req.param("token"));
    if (!session || session.status !== "live") return c.json({ error: "场次不可操作" }, 400);
    const items = await loadItems(session.sopId);
    const stepItems = items.filter((i) => i.scope === "step");
    const body = await c.req.json<{ stepOrder?: number }>().catch(() => ({} as { stepOrder?: number }));
    const next = body.stepOrder ?? (session.currentStepOrder + 1 || stepItems[0]?.stepOrder || 1);
    const db = await getDb();
    await db
      .update(schema.workSessions)
      .set({ currentStepOrder: next, suggestedStepOrder: null })
      .where(eq(schema.workSessions.id, session.id));
    await db.insert(schema.sessionEvents).values({
      sessionId: session.id,
      kind: "confirm_step",
      stepOrder: next,
      actor: "worker",
      message: `作业人进入第 ${next} 步`,
    });
    const [updated] = await db.select().from(schema.workSessions).where(eq(schema.workSessions.id, session.id)).limit(1);
    return c.json(await assembleSession(updated!));
  });

  app.post("/work/:token/end", async (c) => {
    const session = await sessionByToken(c.req.param("token"));
    if (!session || session.status !== "live") return c.json({ error: "场次已结束" }, 400);
    await finalizeAnalysis(session);
    const db = await getDb();
    await db
      .update(schema.workSessions)
      .set({ status: "completed", endedAt: new Date() })
      .where(eq(schema.workSessions.id, session.id));
    await db.insert(schema.sessionEvents).values({
      sessionId: session.id,
      kind: "end_session",
      actor: "worker",
      message: "作业人结束本场",
    });
    const [updated] = await db.select().from(schema.workSessions).where(eq(schema.workSessions.id, session.id)).limit(1);
    return c.json(await assembleSession(updated!));
  });
}
