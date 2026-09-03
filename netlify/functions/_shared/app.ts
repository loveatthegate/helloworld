import { Hono } from "hono";
import { cors } from "hono/cors";
import { eq, desc, asc, count } from "drizzle-orm";
import { getDb, schema } from "../../../db/index";
import { getBlob, putBlob } from "./blobs";
import { parseSopJob } from "./parse-sop";
import { analyzeVideoJob } from "./analyze-video";
import { enqueueAnalyze, enqueueParse } from "./jobs";
import { VLM_MODELS, getModel } from "./models";
import { getVlmStatus } from "./vlm";

const app = new Hono().basePath("/api");
app.use("*", cors());

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err instanceof Error ? err.message : "服务器错误" }, 500);
});

function filenameFrom(file: File, fallback: string) {
  return file.name || fallback;
}

async function getSettingsRow() {
  const db = await getDb();
  const [row] = await db.select().from(schema.appSettings).limit(1);
  if (row) return row;
  const [created] = await db
    .insert(schema.appSettings)
    .values({
      defaultModel: "gemini-2.5-flash",
      frameIntervalSec: 2,
      maxFrames: 30,
    })
    .returning();
  return created;
}

app.get("/health", async (c) => {
  return c.json({ ok: true, vlm: getVlmStatus() });
});

app.get("/settings", async (c) => {
  const settings = await getSettingsRow();
  return c.json({
    defaultModel: settings.defaultModel,
    frameIntervalSec: settings.frameIntervalSec,
    maxFrames: settings.maxFrames,
    availableModels: VLM_MODELS,
    vlm: getVlmStatus(),
  });
});

app.put("/settings", async (c) => {
  const body = await c.req.json<{
    defaultModel?: string;
    frameIntervalSec?: number;
    maxFrames?: number;
  }>();
  const db = await getDb();
  const current = await getSettingsRow();
  const defaultModel = body.defaultModel ? getModel(body.defaultModel).id : current.defaultModel;
  const frameIntervalSec = Number(body.frameIntervalSec ?? current.frameIntervalSec);
  const maxFrames = Math.min(60, Math.max(4, Number(body.maxFrames ?? current.maxFrames)));
  const [updated] = await db
    .update(schema.appSettings)
    .set({
      defaultModel,
      frameIntervalSec,
      maxFrames,
      updatedAt: new Date(),
    })
    .where(eq(schema.appSettings.id, current.id))
    .returning();
  return c.json({
    defaultModel: updated.defaultModel,
    frameIntervalSec: updated.frameIntervalSec,
    maxFrames: updated.maxFrames,
    availableModels: VLM_MODELS,
    vlm: getVlmStatus(),
  });
});

app.get("/sops", async (c) => {
  const db = await getDb();
  const rows = await db.select().from(schema.sops).orderBy(desc(schema.sops.createdAt));
  const itemCounts = await db
    .select({
      sopId: schema.sopCheckItems.sopId,
      total: count(),
    })
    .from(schema.sopCheckItems)
    .groupBy(schema.sopCheckItems.sopId);
  const countMap = new Map(itemCounts.map((r) => [r.sopId, Number(r.total)]));
  return c.json(
    rows.map((row) => ({
      ...row,
      checkItemCount: countMap.get(row.id) ?? 0,
    })),
  );
});

app.post("/sops", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "请上传 SOP 文件" }, 400);
  const title = String(form.get("title") || file.name.replace(/\.[^.]+$/, ""));
  const model = getModel(String(form.get("model") || (await getSettingsRow()).defaultModel)).id;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > 5.5 * 1024 * 1024) {
    return c.json({ error: "演示阶段单份 SOP 请小于 5.5MB" }, 413);
  }
  const db = await getDb();
  const blobKey = `sops/${Date.now()}-${filenameFrom(file, "sop.bin")}`;
  await putBlob(blobKey, bytes, file.type || "application/octet-stream");
  const [created] = await db
    .insert(schema.sops)
    .values({
      title,
      originalFilename: file.name,
      contentType: file.type || "application/octet-stream",
      blobKey,
      status: "parsing",
      modelUsed: model,
    })
    .returning();
  enqueueParse(created.id, parseSopJob);
  return c.json(created, 201);
});

app.get("/sops/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const db = await getDb();
  const [sop] = await db.select().from(schema.sops).where(eq(schema.sops.id, id)).limit(1);
  if (!sop) return c.json({ error: "手册不存在" }, 404);
  const items = await db
    .select()
    .from(schema.sopCheckItems)
    .where(eq(schema.sopCheckItems.sopId, id))
    .orderBy(asc(schema.sopCheckItems.stepOrder));
  return c.json({ ...sop, items });
});

app.post("/sops/:id/parse", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ model?: string }>().catch(() => ({}) as { model?: string });
  const db = await getDb();
  const [sop] = await db.select().from(schema.sops).where(eq(schema.sops.id, id)).limit(1);
  if (!sop) return c.json({ error: "手册不存在" }, 404);
  if (body.model) {
    await db
      .update(schema.sops)
      .set({ modelUsed: getModel(body.model).id, status: "parsing", updatedAt: new Date() })
      .where(eq(schema.sops.id, id));
  } else {
    await db.update(schema.sops).set({ status: "parsing", updatedAt: new Date() }).where(eq(schema.sops.id, id));
  }
  enqueueParse(id, parseSopJob);
  const [updated] = await db.select().from(schema.sops).where(eq(schema.sops.id, id)).limit(1);
  return c.json(updated);
});

app.get("/files", async (c) => {
  const key = c.req.query("key");
  if (!key) return c.json({ error: "缺少 key" }, 400);
  const blob = await getBlob(key);
  if (!blob) return c.json({ error: "文件不存在" }, 404);
  return new Response(blob.data, {
    headers: {
      "Content-Type": blob.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
});

app.get("/dashboard", async (c) => {
  const db = await getDb();
  const [sopCount] = await db.select({ total: count() }).from(schema.sops);
  const [readyCount] = await db
    .select({ total: count() })
    .from(schema.sops)
    .where(eq(schema.sops.status, "ready"));
  const [analysisCount] = await db.select({ total: count() }).from(schema.analyses);
  const [completedCount] = await db
    .select({ total: count() })
    .from(schema.analyses)
    .where(eq(schema.analyses.status, "completed"));
  const recent = await db
    .select()
    .from(schema.analyses)
    .orderBy(desc(schema.analyses.createdAt))
    .limit(6);
  return c.json({
    sops: Number(sopCount.total),
    sopsReady: Number(readyCount.total),
    analyses: Number(analysisCount.total),
    analysesCompleted: Number(completedCount.total),
    recent,
    vlm: getVlmStatus(),
  });
});

app.get("/analyses", async (c) => {
  const db = await getDb();
  const rows = await db.select().from(schema.analyses).orderBy(desc(schema.analyses.createdAt));
  const sops = await db.select().from(schema.sops);
  const sopMap = new Map(sops.map((s) => [s.id, s]));
  return c.json(
    rows.map((row) => ({
      ...row,
      sopTitle: sopMap.get(row.sopId)?.title ?? "",
    })),
  );
});

app.post("/analyses", async (c) => {
  const body = await c.req.json<{
    sopId: number;
    title?: string;
    videoFilename: string;
    videoDurationSec?: number;
    frameIntervalSec?: number;
    maxFrames?: number;
    model?: string;
  }>();
  if (!body.sopId || !body.videoFilename) {
    return c.json({ error: "请选择 SOP 并提供视频文件名" }, 400);
  }
  const db = await getDb();
  const [sop] = await db.select().from(schema.sops).where(eq(schema.sops.id, body.sopId)).limit(1);
  if (!sop) return c.json({ error: "手册不存在" }, 404);
  if (sop.status !== "ready") return c.json({ error: "请先等待手册解析完成" }, 400);
  const settings = await getSettingsRow();
  const [created] = await db
    .insert(schema.analyses)
    .values({
      sopId: body.sopId,
      title: body.title || `${sop.title} · ${body.videoFilename}`,
      videoFilename: body.videoFilename,
      videoDurationSec: body.videoDurationSec ?? null,
      frameIntervalSec: Number(body.frameIntervalSec ?? settings.frameIntervalSec),
      maxFrames: Math.min(60, Math.max(1, Number(body.maxFrames ?? settings.maxFrames))),
      modelUsed: getModel(body.model || settings.defaultModel).id,
      status: "uploading",
    })
    .returning();
  return c.json(created, 201);
});

app.post("/analyses/:id/video", async (c) => {
  const id = Number(c.req.param("id"));
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "请上传视频" }, 400);
  if (file.size > 5.5 * 1024 * 1024) {
    return c.json({ skipped: true, reason: "视频超过 5.5MB，演示阶段仅保存抽帧证据" });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = `videos/${id}/${file.name}`;
  await putBlob(key, bytes, file.type || "video/mp4");
  const db = await getDb();
  await db.update(schema.analyses).set({ videoBlobKey: key }).where(eq(schema.analyses.id, id));
  return c.json({ ok: true, videoBlobKey: key });
});

app.post("/analyses/:id/frames", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{
    frames: Array<{ index: number; timestampSec: number; mimeType?: string; dataBase64: string }>;
  }>();
  if (!body.frames?.length) return c.json({ error: "没有帧数据" }, 400);
  const db = await getDb();
  const [analysis] = await db.select().from(schema.analyses).where(eq(schema.analyses.id, id)).limit(1);
  if (!analysis) return c.json({ error: "任务不存在" }, 404);
  const inserted: { id: number; frameIndex: number }[] = [];
  for (const frame of body.frames) {
    const mime = frame.mimeType || "image/jpeg";
    const buf = Buffer.from(frame.dataBase64, "base64");
    const key = `frames/${id}/${String(frame.index).padStart(4, "0")}.jpg`;
    await putBlob(key, buf, mime);
    const [row] = await db
      .insert(schema.analysisFrames)
      .values({
        analysisId: id,
        frameIndex: frame.index,
        timestampSec: frame.timestampSec,
        blobKey: key,
      })
      .returning();
    inserted.push({ id: row.id, frameIndex: row.frameIndex });
  }
  return c.json({ inserted: inserted.length });
});

app.post("/analyses/:id/analyze", async (c) => {
  const id = Number(c.req.param("id"));
  const db = await getDb();
  const [analysis] = await db.select().from(schema.analyses).where(eq(schema.analyses.id, id)).limit(1);
  if (!analysis) return c.json({ error: "任务不存在" }, 404);
  await db.update(schema.analyses).set({ status: "analyzing", errorMessage: null }).where(eq(schema.analyses.id, id));
  enqueueAnalyze(id, analyzeVideoJob);
  const [updated] = await db.select().from(schema.analyses).where(eq(schema.analyses.id, id)).limit(1);
  return c.json(updated);
});

app.get("/analyses/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const db = await getDb();
  const [analysis] = await db.select().from(schema.analyses).where(eq(schema.analyses.id, id)).limit(1);
  if (!analysis) return c.json({ error: "任务不存在" }, 404);
  const [sop] = await db.select().from(schema.sops).where(eq(schema.sops.id, analysis.sopId)).limit(1);
  const items = await db
    .select()
    .from(schema.sopCheckItems)
    .where(eq(schema.sopCheckItems.sopId, analysis.sopId))
    .orderBy(asc(schema.sopCheckItems.stepOrder));
  const frames = await db
    .select()
    .from(schema.analysisFrames)
    .where(eq(schema.analysisFrames.analysisId, id))
    .orderBy(asc(schema.analysisFrames.frameIndex));
  const results = await db
    .select()
    .from(schema.analysisItemResults)
    .where(eq(schema.analysisItemResults.analysisId, id));
  const resultByItem = new Map(results.map((r) => [r.checkItemId, r]));
  const frameById = new Map(frames.map((f) => [f.id, f]));
  return c.json({
    ...analysis,
    sop,
    frames: frames.map((f) => ({
      ...f,
      url: `/api/files?key=${encodeURIComponent(f.blobKey)}`,
    })),
    items: items.map((item) => {
      const result = resultByItem.get(item.id);
      const evidence = (result?.evidenceFrameIds ?? [])
        .map((fid) => frameById.get(fid))
        .filter(Boolean)
        .map((f) => ({
          ...f,
          url: `/api/files?key=${encodeURIComponent(f!.blobKey)}`,
        }));
      return { ...item, result: result ?? null, evidence };
    }),
  });
});

export { app };
