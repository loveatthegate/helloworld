import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie } from "hono/cookie";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../../../db/index";
import { deleteBlob, getBlob, putBlob } from "./blobs";
import { parseSopJob } from "./parse-sop";
import { analyzeVideoJob } from "./analyze-video";
import { enqueueAnalyze, enqueueParse } from "./jobs";
import { FAST_ANALYZE_MODEL, VLM_MODELS, getModel } from "./models";
import { getVlmStatus, testVlmConnection } from "./vlm";
import {
  attachSession,
  canSee,
  clearSessionCookie,
  createSession,
  destroySession,
  ensureAdmin,
  isAdmin,
  publicUser,
  SESSION_COOKIE,
  toAuthUser,
  userFromRequest,
  type AuthUser,
} from "./auth";
import { hashPassword, verifyPassword } from "./password";
import { ALLOWED_INTERVALS, DEFAULT_BRANDING, getSettingsRow, normalizeInterval, publicBranding } from "./settings";

type Env = { Variables: { user: AuthUser } };
const app = new Hono<Env>().basePath("/api");

app.use(
  "*",
  cors({
    origin: (origin) => origin || "*",
    credentials: true,
  }),
);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err instanceof Error ? err.message : "服务器错误" }, 500);
});

function isPublicApiPath(path: string) {
  const normalized = path.replace(/\/+$/, "") || "/";
  return (
    normalized === "/login" ||
    normalized === "/health" ||
    normalized === "/branding" ||
    normalized === "/branding/logo" ||
    normalized === "/branding/login-image" ||
    normalized === "/api/login" ||
    normalized === "/api/health" ||
    normalized === "/api/branding" ||
    normalized === "/api/branding/logo" ||
    normalized === "/api/branding/login-image"
  );
}

app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS" || isPublicApiPath(c.req.path)) {
    await next();
    return;
  }
  const user = await userFromRequest(c);
  if (!user) return c.json({ error: "请先登录" }, 401);
  c.set("user", user);
  await next();
});

function filenameFrom(file: File, fallback: string) {
  return file.name || fallback;
}

function fileUrl(key: string) {
  return `/api/files?key=${encodeURIComponent(key)}`;
}

async function requireOwnedSop(user: AuthUser, id: number) {
  const db = await getDb();
  const [sop] = await db.select().from(schema.sops).where(eq(schema.sops.id, id)).limit(1);
  if (!sop || !canSee(user, sop.userId)) return null;
  return sop;
}

async function requireOwnedAnalysis(user: AuthUser, id: number) {
  const db = await getDb();
  const [row] = await db.select().from(schema.analyses).where(eq(schema.analyses.id, id)).limit(1);
  if (!row || !canSee(user, row.userId)) return null;
  return row;
}

function extrasFrom(
  row: typeof schema.analyses.$inferSelect,
  frames: Array<typeof schema.analysisFrames.$inferSelect>,
  results: Array<typeof schema.analysisItemResults.$inferSelect>,
) {
  const failCount = results.filter((r) => r.verdict === "fail").length;
  const passCount = results.filter((r) => r.verdict === "pass").length;
  const fail = results.find((r) => r.verdict === "fail");
  const evidenceId = fail?.evidenceFrameIds?.[0];
  const cover =
    (evidenceId ? frames.find((f) => f.id === evidenceId) : undefined) ??
    frames[0] ??
    null;
  return {
    failCount,
    passCount,
    coverUrl: cover ? fileUrl(cover.blobKey) : null,
    videoUrl: row.videoBlobKey ? `/api/analyses/${row.id}/media` : null,
  };
}

async function analysisExtras(row: typeof schema.analyses.$inferSelect) {
  const db = await getDb();
  const frames = await db
    .select()
    .from(schema.analysisFrames)
    .where(eq(schema.analysisFrames.analysisId, row.id))
    .orderBy(asc(schema.analysisFrames.frameIndex));
  const results = await db
    .select()
    .from(schema.analysisItemResults)
    .where(eq(schema.analysisItemResults.analysisId, row.id));
  return extrasFrom(row, frames, results);
}

async function analysisExtrasMany(rows: Array<typeof schema.analyses.$inferSelect>) {
  if (!rows.length) return [];
  const db = await getDb();
  const ids = rows.map((row) => row.id);
  const [frames, results] = await Promise.all([
    db.select().from(schema.analysisFrames).where(inArray(schema.analysisFrames.analysisId, ids)),
    db.select().from(schema.analysisItemResults).where(inArray(schema.analysisItemResults.analysisId, ids)),
  ]);
  return rows.map((row) =>
    extrasFrom(
      row,
      frames.filter((frame) => frame.analysisId === row.id).sort((a, b) => a.frameIndex - b.frameIndex),
      results.filter((result) => result.analysisId === row.id),
    ),
  );
}

function isStalled(row: typeof schema.analyses.$inferSelect) {
  if (row.status !== "analyzing") return false;
  const raw = row.progressUpdatedAt || row.createdAt;
  const ms = raw instanceof Date ? raw.getTime() : raw ? new Date(raw).getTime() : 0;
  return !ms || Date.now() - ms > 90_000;
}

function sanitizeAnalysis(user: AuthUser, row: typeof schema.analyses.$inferSelect) {
  return {
    ...row,
    modelUsed: isAdmin(user) ? row.modelUsed : undefined,
    stalled: isStalled(row),
  };
}

async function serveBrandingFile(key: string | null | undefined) {
  if (!key) return null;
  return getBlob(key);
}

app.get("/health", async (c) => {
  const vlm = await getVlmStatus();
  return c.json({ ok: true, vlm: { ready: vlm.ready } });
});

app.get("/branding", async (c) => {
  const settings = await getSettingsRow();
  return c.json(publicBranding(settings));
});

app.get("/branding/logo", async (c) => {
  const settings = await getSettingsRow();
  const blob = await serveBrandingFile(settings.logoBlobKey);
  if (!blob) return c.json({ error: "未设置 Logo" }, 404);
  return new Response(blob.data, { headers: { "Content-Type": blob.contentType, "Cache-Control": "public, max-age=3600" } });
});

app.get("/branding/login-image", async (c) => {
  const settings = await getSettingsRow();
  const blob = await serveBrandingFile(settings.loginImageBlobKey);
  if (!blob) return c.json({ error: "未设置登录页图片" }, 404);
  return new Response(blob.data, { headers: { "Content-Type": blob.contentType, "Cache-Control": "public, max-age=3600" } });
});

app.post("/login", async (c) => {
  await ensureAdmin();
  const body = await c.req.json<{ username?: string; password?: string }>();
  if (!body.username || !body.password) return c.json({ error: "请输入用户名和密码" }, 400);
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.username, body.username.trim())).limit(1);
  if (!user || !user.isActive || !verifyPassword(body.password, user.passwordHash)) {
    return c.json({ error: "用户名或密码错误" }, 401);
  }
  const token = await createSession(user.id);
  attachSession(c, token);
  const settings = await getSettingsRow();
  return c.json({
    user: publicUser(toAuthUser(user)),
    defaults: {
      frameIntervalSec: normalizeInterval(settings.frameIntervalSec),
      maxFrames: settings.maxFrames,
      intervals: ALLOWED_INTERVALS,
    },
    branding: publicBranding(settings),
  });
});

app.post("/logout", async (c) => {
  await destroySession(getCookie(c, SESSION_COOKIE));
  clearSessionCookie(c);
  return c.json({ ok: true });
});

app.get("/me", async (c) => {
  const user = c.get("user");
  const settings = await getSettingsRow();
  return c.json({
    user: publicUser(user),
    defaults: {
      frameIntervalSec: normalizeInterval(settings.frameIntervalSec),
      maxFrames: settings.maxFrames,
      intervals: ALLOWED_INTERVALS,
    },
    branding: publicBranding(settings),
  });
});

app.put("/me/password", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ oldPassword?: string; newPassword?: string }>();
  if (!body.oldPassword || !body.newPassword || body.newPassword.length < 6) {
    return c.json({ error: "请填写原密码，且新密码不少于 6 位" }, 400);
  }
  const db = await getDb();
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
  if (!row || !verifyPassword(body.oldPassword, row.passwordHash)) {
    return c.json({ error: "原密码不正确" }, 400);
  }
  await db.update(schema.users).set({ passwordHash: hashPassword(body.newPassword) }).where(eq(schema.users.id, user.id));
  return c.json({ ok: true });
});

app.get("/users", async (c) => {
  const user = c.get("user");
  if (!isAdmin(user)) return c.json({ error: "仅超级管理员可管理用户" }, 403);
  const db = await getDb();
  const rows = await db.select().from(schema.users).orderBy(asc(schema.users.id));
  return c.json(
    rows.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      role: row.role,
      isActive: row.isActive,
      createdAt: row.createdAt,
    })),
  );
});

app.post("/users", async (c) => {
  const user = c.get("user");
  if (!isAdmin(user)) return c.json({ error: "仅超级管理员可管理用户" }, 403);
  const body = await c.req.json<{ username?: string; displayName?: string; password?: string }>();
  if (!body.username || !body.password) return c.json({ error: "请填写用户名和密码" }, 400);
  const db = await getDb();
  try {
    const [created] = await db
      .insert(schema.users)
      .values({
        username: body.username.trim(),
        displayName: body.displayName?.trim() || body.username.trim(),
        passwordHash: hashPassword(body.password),
        role: "user",
        isActive: true,
      })
      .returning();
    return c.json(
      {
        id: created.id,
        username: created.username,
        displayName: created.displayName,
        role: created.role,
        isActive: created.isActive,
        createdAt: created.createdAt,
      },
      201,
    );
  } catch {
    return c.json({ error: "用户名已存在" }, 409);
  }
});

app.patch("/users/:id", async (c) => {
  const user = c.get("user");
  if (!isAdmin(user)) return c.json({ error: "仅超级管理员可管理用户" }, 403);
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ displayName?: string; isActive?: boolean; password?: string }>();
  const db = await getDb();
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!target) return c.json({ error: "用户不存在" }, 404);
  if (target.role === "super_admin" && body.isActive === false) {
    return c.json({ error: "不能停用唯一的超级管理员" }, 400);
  }
  const [updated] = await db
    .update(schema.users)
    .set({
      displayName: body.displayName ?? target.displayName,
      isActive: body.isActive ?? target.isActive,
      passwordHash: body.password ? hashPassword(body.password) : target.passwordHash,
    })
    .where(eq(schema.users.id, id))
    .returning();
  return c.json({
    id: updated.id,
    username: updated.username,
    displayName: updated.displayName,
    role: updated.role,
    isActive: updated.isActive,
    createdAt: updated.createdAt,
  });
});

function publicSettings(settings: Awaited<ReturnType<typeof getSettingsRow>>, vlm: Awaited<ReturnType<typeof getVlmStatus>>) {
  const model = getModel(settings.modelName || settings.defaultModel).id;
  return {
    modelName: model,
    defaultModel: model,
    frameIntervalSec: normalizeInterval(settings.frameIntervalSec),
    maxFrames: settings.maxFrames,
    availableModels: VLM_MODELS,
    intervals: ALLOWED_INTERVALS,
    vlm,
    appearance: publicBranding(settings),
  };
}

app.get("/settings", async (c) => {
  const user = c.get("user");
  if (!isAdmin(user)) return c.json({ error: "仅超级管理员可查看系统设置" }, 403);
  const settings = await getSettingsRow();
  return c.json(publicSettings(settings, await getVlmStatus()));
});

app.put("/settings", async (c) => {
  const user = c.get("user");
  if (!isAdmin(user)) return c.json({ error: "仅超级管理员可修改系统设置" }, 403);
  const body = await c.req.json<{
    modelName?: string;
    frameIntervalSec?: number;
    maxFrames?: number;
  }>();
  const db = await getDb();
  const current = await getSettingsRow();
  const modelName = getModel(body.modelName || current.modelName || current.defaultModel).id;
  const [updated] = await db
    .update(schema.appSettings)
    .set({
      modelName,
      defaultModel: modelName,
      apiKey: null,
      baseUrl: null,
      frameIntervalSec: normalizeInterval(body.frameIntervalSec ?? current.frameIntervalSec),
      maxFrames: Math.min(60, Math.max(4, Number(body.maxFrames ?? current.maxFrames))),
      updatedAt: new Date(),
    })
    .where(eq(schema.appSettings.id, current.id))
    .returning();
  return c.json(publicSettings(updated, await getVlmStatus()));
});

app.post("/settings/test", async (c) => {
  const user = c.get("user");
  if (!isAdmin(user)) return c.json({ error: "仅超级管理员可测试模型" }, 403);
  try {
    const result = await testVlmConnection();
    return c.json(result);
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : "连接失败" }, 400);
  }
});

app.put("/settings/appearance", async (c) => {
  const user = c.get("user");
  if (!isAdmin(user)) return c.json({ error: "仅超级管理员可修改外观" }, 403);
  const body = await c.req.json<{
    systemName?: string;
    tagline?: string;
    companyName?: string;
    copyright?: string;
    themeColor?: string;
  }>();
  const db = await getDb();
  const current = await getSettingsRow();
  const [updated] = await db
    .update(schema.appSettings)
    .set({
      systemName: body.systemName?.trim() || current.systemName,
      tagline: body.tagline?.trim() || current.tagline,
      companyName: body.companyName === undefined ? current.companyName : body.companyName.trim() || null,
      copyright: body.copyright?.trim() || current.copyright,
      themeColor: /^#([0-9a-fA-F]{6})$/.test(body.themeColor || "") ? body.themeColor : current.themeColor,
      updatedAt: new Date(),
    })
    .where(eq(schema.appSettings.id, current.id))
    .returning();
  return c.json(publicBranding(updated));
});

app.post("/settings/appearance/reset", async (c) => {
  const user = c.get("user");
  if (!isAdmin(user)) return c.json({ error: "仅超级管理员可重置外观" }, 403);
  const db = await getDb();
  const current = await getSettingsRow();
  if (current.logoBlobKey) await deleteBlob(current.logoBlobKey);
  if (current.loginImageBlobKey) await deleteBlob(current.loginImageBlobKey);
  const [updated] = await db
    .update(schema.appSettings)
    .set({
      systemName: DEFAULT_BRANDING.systemName,
      tagline: DEFAULT_BRANDING.tagline,
      companyName: null,
      copyright: DEFAULT_BRANDING.copyright,
      themeColor: DEFAULT_BRANDING.themeColor,
      logoBlobKey: null,
      loginImageBlobKey: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.appSettings.id, current.id))
    .returning();
  return c.json(publicBranding(updated));
});

app.post("/settings/appearance/:kind", async (c) => {
  const user = c.get("user");
  if (!isAdmin(user)) return c.json({ error: "仅超级管理员可修改外观" }, 403);
  const kind = c.req.param("kind");
  if (kind !== "logo" && kind !== "login-image") return c.json({ error: "不支持的资源" }, 400);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "请上传图片" }, 400);
  if (file.size > 4 * 1024 * 1024) return c.json({ error: "图片请小于 4MB" }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = `branding/${kind}`;
  await putBlob(key, bytes, file.type || "image/png");
  const db = await getDb();
  const current = await getSettingsRow();
  const [updated] = await db
    .update(schema.appSettings)
    .set({
      logoBlobKey: kind === "logo" ? key : current.logoBlobKey,
      loginImageBlobKey: kind === "login-image" ? key : current.loginImageBlobKey,
      updatedAt: new Date(),
    })
    .where(eq(schema.appSettings.id, current.id))
    .returning();
  return c.json(publicBranding(updated));
});

app.get("/sops", async (c) => {
  const user = c.get("user");
  const db = await getDb();
  const rows = isAdmin(user)
    ? await db.select().from(schema.sops).orderBy(desc(schema.sops.createdAt))
    : await db.select().from(schema.sops).where(eq(schema.sops.userId, user.id)).orderBy(desc(schema.sops.createdAt));
  const itemCounts = await db
    .select({ sopId: schema.sopCheckItems.sopId, total: count() })
    .from(schema.sopCheckItems)
    .groupBy(schema.sopCheckItems.sopId);
  const countMap = new Map(itemCounts.map((r) => [r.sopId, Number(r.total)]));
  const owners = await db.select().from(schema.users);
  const ownerMap = new Map(owners.map((u) => [u.id, u.displayName]));
  return c.json(
    rows.map((row) => ({
      ...row,
      modelUsed: isAdmin(user) ? row.modelUsed : undefined,
      checkItemCount: countMap.get(row.id) ?? 0,
      ownerName: isAdmin(user) ? ownerMap.get(row.userId ?? 0) : undefined,
    })),
  );
});

app.post("/sops", async (c) => {
  const user = c.get("user");
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "请上传 SOP 文件" }, 400);
  const title = String(form.get("title") || file.name.replace(/\.[^.]+$/, ""));
  const settings = await getSettingsRow();
  const model = isAdmin(user)
    ? getModel(String(form.get("model") || settings.modelName || settings.defaultModel)).id
    : getModel(settings.modelName || settings.defaultModel).id;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > 5.5 * 1024 * 1024) {
    return c.json({ error: "单份 SOP 请小于 5.5MB" }, 413);
  }
  const db = await getDb();
  const blobKey = `sops/${Date.now()}-${filenameFrom(file, "sop.bin")}`;
  await putBlob(blobKey, bytes, file.type || "application/octet-stream");
  const [created] = await db
    .insert(schema.sops)
    .values({
      userId: user.id,
      title,
      originalFilename: file.name,
      contentType: file.type || "application/octet-stream",
      blobKey,
      status: "parsing",
      modelUsed: model,
    })
    .returning();
  try {
    await enqueueParse(created.id, parseSopJob);
  } catch (error) {
    const db2 = await getDb();
    await db2
      .update(schema.sops)
      .set({ status: "failed", parseError: error instanceof Error ? error.message : "解析任务未能启动", updatedAt: new Date() })
      .where(eq(schema.sops.id, created.id));
  }
  return c.json(created, 201);
});

app.get("/sops/:id", async (c) => {
  const user = c.get("user");
  const sop = await requireOwnedSop(user, Number(c.req.param("id")));
  if (!sop) return c.json({ error: "手册不存在" }, 404);
  const db = await getDb();
  const items = await db
    .select()
    .from(schema.sopCheckItems)
    .where(eq(schema.sopCheckItems.sopId, sop.id))
    .orderBy(asc(schema.sopCheckItems.stepOrder));
  return c.json({ ...sop, modelUsed: isAdmin(user) ? sop.modelUsed : undefined, items });
});

app.post("/sops/:id/parse", async (c) => {
  const user = c.get("user");
  const sop = await requireOwnedSop(user, Number(c.req.param("id")));
  if (!sop) return c.json({ error: "手册不存在" }, 404);
  const body = await c.req.json<{ model?: string }>().catch(() => ({}) as { model?: string });
  const db = await getDb();
  const settings = await getSettingsRow();
  const model = getModel(isAdmin(user) && body.model ? body.model : settings.modelName || settings.defaultModel).id;
  await db
    .update(schema.sops)
    .set({ modelUsed: model, status: "parsing", updatedAt: new Date() })
    .where(eq(schema.sops.id, sop.id));
  try {
    await enqueueParse(sop.id, parseSopJob);
  } catch (error) {
    await db
      .update(schema.sops)
      .set({ status: "failed", parseError: error instanceof Error ? error.message : "解析任务未能启动", updatedAt: new Date() })
      .where(eq(schema.sops.id, sop.id));
  }
  const [updated] = await db.select().from(schema.sops).where(eq(schema.sops.id, sop.id)).limit(1);
  return c.json(updated);
});

app.delete("/sops/:id", async (c) => {
  const user = c.get("user");
  if (!isAdmin(user)) return c.json({ error: "仅超级管理员可删除手册" }, 403);
  const sop = await requireOwnedSop(user, Number(c.req.param("id")));
  if (!sop) return c.json({ error: "手册不存在" }, 404);
  const db = await getDb();
  const related = await db.select().from(schema.analyses).where(eq(schema.analyses.sopId, sop.id));
  for (const row of related) {
    const frames = await db.select().from(schema.analysisFrames).where(eq(schema.analysisFrames.analysisId, row.id));
    for (const frame of frames) await deleteBlob(frame.blobKey);
    if (row.videoBlobKey) await deleteBlob(row.videoBlobKey);
    await db.delete(schema.analyses).where(eq(schema.analyses.id, row.id));
  }
  await deleteBlob(sop.blobKey);
  await db.delete(schema.sops).where(eq(schema.sops.id, sop.id));
  return c.json({ ok: true });
});

app.get("/files", async (c) => {
  const user = c.get("user");
  const key = c.req.query("key");
  if (!key) return c.json({ error: "缺少 key" }, 400);
  const db = await getDb();
  if (!isAdmin(user)) {
    const [sop] = await db.select().from(schema.sops).where(eq(schema.sops.blobKey, key)).limit(1);
    const [analysis] = await db.select().from(schema.analyses).where(eq(schema.analyses.videoBlobKey, key)).limit(1);
    const [frame] = await db.select().from(schema.analysisFrames).where(eq(schema.analysisFrames.blobKey, key)).limit(1);
    let allowed = false;
    if (sop) allowed = sop.userId === user.id;
    if (analysis) allowed = analysis.userId === user.id;
    if (frame) {
      const [owner] = await db.select().from(schema.analyses).where(eq(schema.analyses.id, frame.analysisId)).limit(1);
      allowed = owner?.userId === user.id;
    }
    if (!allowed) return c.json({ error: "无权访问该文件" }, 403);
  }
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
  const user = c.get("user");
  const db = await getDb();
  const sopOwned = isAdmin(user) ? undefined : eq(schema.sops.userId, user.id);
  const analysisOwned = isAdmin(user) ? undefined : eq(schema.analyses.userId, user.id);
  const readyWhere = sopOwned ? and(eq(schema.sops.status, "ready"), sopOwned) : eq(schema.sops.status, "ready");
  const completedWhere = analysisOwned
    ? and(eq(schema.analyses.status, "completed"), analysisOwned)
    : eq(schema.analyses.status, "completed");
  const sopCountQuery = sopOwned
    ? db.select({ total: count() }).from(schema.sops).where(sopOwned)
    : db.select({ total: count() }).from(schema.sops);
  const analysisCountQuery = analysisOwned
    ? db.select({ total: count() }).from(schema.analyses).where(analysisOwned)
    : db.select({ total: count() }).from(schema.analyses);
  const recentQuery = analysisOwned
    ? db.select().from(schema.analyses).where(analysisOwned).orderBy(desc(schema.analyses.createdAt)).limit(6)
    : db.select().from(schema.analyses).orderBy(desc(schema.analyses.createdAt)).limit(6);
  const [[sopCount], [readyCount], [analysisCount], [completedCount], recent, vlm] = await Promise.all([
    sopCountQuery,
    db.select({ total: count() }).from(schema.sops).where(readyWhere),
    analysisCountQuery,
    db.select({ total: count() }).from(schema.analyses).where(completedWhere),
    recentQuery,
    getVlmStatus(),
  ]);
  return c.json({
    sops: Number(sopCount.total),
    sopsReady: Number(readyCount.total),
    analyses: Number(analysisCount.total),
    analysesCompleted: Number(completedCount.total),
    recent: recent.map((row) => sanitizeAnalysis(user, row)),
    vlm: isAdmin(user) ? vlm : { ready: vlm.ready },
  });
});

app.get("/analyses", async (c) => {
  const user = c.get("user");
  const db = await getDb();
  const rows = isAdmin(user)
    ? await db.select().from(schema.analyses).orderBy(desc(schema.analyses.createdAt))
    : await db.select().from(schema.analyses).where(eq(schema.analyses.userId, user.id)).orderBy(desc(schema.analyses.createdAt));
  const sops = await db.select().from(schema.sops);
  const sopMap = new Map(sops.map((s) => [s.id, s]));
  const owners = await db.select().from(schema.users);
  const ownerMap = new Map(owners.map((u) => [u.id, u.displayName]));
  const extras = await analysisExtrasMany(rows);
  return c.json(
    rows.map((row, index) => ({
      ...sanitizeAnalysis(user, row),
      sopTitle: sopMap.get(row.sopId)?.title ?? "",
      ownerName: isAdmin(user) ? ownerMap.get(row.userId ?? 0) : undefined,
      ...extras[index],
    })),
  );
});

app.post("/analyses", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    sopId: number;
    title?: string;
    sourceType?: "video" | "images";
    videoFilename: string;
    videoDurationSec?: number;
    frameIntervalSec?: number;
    maxFrames?: number;
    model?: string;
  }>();
  if (!body.sopId || !body.videoFilename) {
    return c.json({ error: "请选择 SOP 并提供文件名" }, 400);
  }
  const sop = await requireOwnedSop(user, body.sopId);
  if (!sop) return c.json({ error: "手册不存在或无权使用" }, 404);
  if (sop.status !== "ready") return c.json({ error: "请先等待手册解析完成" }, 400);
  const settings = await getSettingsRow();
  const db = await getDb();
  const model = getModel(isAdmin(user) && body.model ? body.model : FAST_ANALYZE_MODEL).id;
  const [created] = await db
    .insert(schema.analyses)
    .values({
      userId: user.id,
      sopId: body.sopId,
      title: body.title || `${sop.title} · ${body.videoFilename}`,
      sourceType: body.sourceType === "images" ? "images" : "video",
      videoFilename: body.videoFilename,
      videoDurationSec: body.videoDurationSec ?? null,
      frameIntervalSec: normalizeInterval(body.frameIntervalSec ?? settings.frameIntervalSec),
      maxFrames: Math.min(60, Math.max(1, Number(body.maxFrames ?? settings.maxFrames))),
      modelUsed: model,
      status: "uploading",
    })
    .returning();
  return c.json(created, 201);
});

app.post("/analyses/:id/video", async (c) => {
  const user = c.get("user");
  const analysis = await requireOwnedAnalysis(user, Number(c.req.param("id")));
  if (!analysis) return c.json({ error: "任务不存在" }, 404);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "请上传视频" }, 400);
  if (file.size > 5.5 * 1024 * 1024) {
    return c.json({ skipped: true, reason: "请改用分片上传" });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = `videos/${analysis.id}/${file.name}`;
  await putBlob(key, bytes, file.type || "video/mp4");
  const db = await getDb();
  await db.update(schema.analyses).set({ videoBlobKey: key }).where(eq(schema.analyses.id, analysis.id));
  return c.json({ ok: true, videoBlobKey: key });
});

app.post("/analyses/:id/video-chunk", async (c) => {
  const user = c.get("user");
  const analysis = await requireOwnedAnalysis(user, Number(c.req.param("id")));
  if (!analysis) return c.json({ error: "任务不存在" }, 404);
  const form = await c.req.formData();
  const file = form.get("file");
  const index = Number(form.get("index"));
  const total = Number(form.get("total"));
  const mime = String(form.get("contentType") || "video/mp4");
  if (!(file instanceof File) || Number.isNaN(index) || !total) {
    return c.json({ error: "分片参数不完整" }, 400);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  await putBlob(`videos/${analysis.id}/chunk-${String(index).padStart(4, "0")}`, bytes, "application/octet-stream");
  if (index < total - 1) return c.json({ ok: true, assembled: false });
  const parts: Uint8Array[] = [];
  let size = 0;
  for (let i = 0; i < total; i++) {
    const part = await getBlob(`videos/${analysis.id}/chunk-${String(i).padStart(4, "0")}`);
    if (!part) return c.json({ error: `缺少分片 ${i}` }, 400);
    parts.push(part.data);
    size += part.data.byteLength;
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.byteLength;
  }
  const key = `videos/${analysis.id}/source`;
  await putBlob(key, merged, mime);
  const db = await getDb();
  await db.update(schema.analyses).set({ videoBlobKey: key }).where(eq(schema.analyses.id, analysis.id));
  return c.json({ ok: true, assembled: true, videoBlobKey: key });
});

app.get("/analyses/:id/media", async (c) => {
  const user = c.get("user");
  const analysis = await requireOwnedAnalysis(user, Number(c.req.param("id")));
  if (!analysis?.videoBlobKey) return c.json({ error: "没有可回放的视频" }, 404);
  const blob = await getBlob(analysis.videoBlobKey);
  if (!blob) return c.json({ error: "视频文件不存在" }, 404);
  return new Response(blob.data, {
    headers: {
      "Content-Type": blob.contentType || "video/mp4",
      "Cache-Control": "private, max-age=3600",
    },
  });
});

app.post("/analyses/:id/frames", async (c) => {
  const user = c.get("user");
  const analysis = await requireOwnedAnalysis(user, Number(c.req.param("id")));
  if (!analysis) return c.json({ error: "任务不存在" }, 404);
  const body = await c.req.json<{
    frames: Array<{ index: number; timestampSec: number; mimeType?: string; dataBase64: string }>;
  }>();
  if (!body.frames?.length) return c.json({ error: "没有帧数据" }, 400);
  const db = await getDb();
  const saved = await Promise.all(
    body.frames.map(async (frame) => {
      const mime = frame.mimeType || "image/jpeg";
      const buf = Buffer.from(frame.dataBase64, "base64");
      const key = `frames/${analysis.id}/${String(frame.index).padStart(4, "0")}.jpg`;
      await putBlob(key, buf, mime);
      return {
        analysisId: analysis.id,
        frameIndex: frame.index,
        timestampSec: frame.timestampSec,
        blobKey: key,
      };
    }),
  );
  if (saved.length) await db.insert(schema.analysisFrames).values(saved);
  return c.json({ inserted: saved.length });
});

app.post("/analyses/:id/analyze", async (c) => {
  const user = c.get("user");
  const analysis = await requireOwnedAnalysis(user, Number(c.req.param("id")));
  if (!analysis) return c.json({ error: "任务不存在" }, 404);
  const db = await getDb();
  if (analysis.status === "completed" || analysis.status === "failed") {
    await db.delete(schema.analysisItemResults).where(eq(schema.analysisItemResults.analysisId, analysis.id));
  }
  await db
    .update(schema.analyses)
    .set({
      status: "analyzing",
      errorMessage: null,
      overallResult: null,
      overallSummary: null,
      completedAt: null,
      progressStep: 0,
      progressTotal: null,
      progressMessage: "已提交后台分析，正在排队…",
      progressUpdatedAt: new Date(),
    })
    .where(eq(schema.analyses.id, analysis.id));
  try {
    await enqueueAnalyze(analysis.id, analyzeVideoJob);
  } catch (error) {
    const message = error instanceof Error ? error.message : "后台分析未能启动";
    await db
      .update(schema.analyses)
      .set({ status: "failed", errorMessage: message, progressMessage: message, progressUpdatedAt: new Date() })
      .where(eq(schema.analyses.id, analysis.id));
    return c.json({ error: message }, 500);
  }
  const [updated] = await db.select().from(schema.analyses).where(eq(schema.analyses.id, analysis.id)).limit(1);
  return c.json(sanitizeAnalysis(user, updated));
});

app.post("/analyses/:id/items/:itemId/skip", async (c) => {
  const user = c.get("user");
  const analysis = await requireOwnedAnalysis(user, Number(c.req.param("id")));
  if (!analysis) return c.json({ error: "任务不存在" }, 404);
  const itemId = Number(c.req.param("itemId"));
  const db = await getDb();
  const [item] = await db.select().from(schema.sopCheckItems).where(eq(schema.sopCheckItems.id, itemId)).limit(1);
  if (!item || item.sopId !== analysis.sopId) return c.json({ error: "检查项不存在" }, 404);
  const [existing] = await db
    .select()
    .from(schema.analysisItemResults)
    .where(and(eq(schema.analysisItemResults.analysisId, analysis.id), eq(schema.analysisItemResults.checkItemId, itemId)))
    .limit(1);
  if (!existing) {
    await db.insert(schema.analysisItemResults).values({
      analysisId: analysis.id,
      checkItemId: itemId,
      verdict: "skipped",
      confidence: 0,
      reasoning: "用户跳过该步骤",
      evidenceFrameIds: [],
      observedAtSec: null,
    });
  }
  const items = await db.select().from(schema.sopCheckItems).where(eq(schema.sopCheckItems.sopId, analysis.sopId));
  const results = await db.select().from(schema.analysisItemResults).where(eq(schema.analysisItemResults.analysisId, analysis.id));
  if (results.length >= items.length) {
    const fails = results.filter((r) => r.verdict === "fail").length;
    await db
      .update(schema.analyses)
      .set({
        status: "completed",
        overallResult: fails ? "fail" : "partial",
        overallSummary: "部分步骤已跳过，其余步骤已出结论。",
        progressMessage: "已跳过剩余步骤",
        progressUpdatedAt: new Date(),
        completedAt: new Date(),
      })
      .where(eq(schema.analyses.id, analysis.id));
  } else {
    await db
      .update(schema.analyses)
      .set({
        status: "analyzing",
        progressMessage: `已跳过「${item.title}」，继续分析剩余步骤…`,
        progressUpdatedAt: new Date(),
      })
      .where(eq(schema.analyses.id, analysis.id));
    if (isStalled(analysis) || analysis.status === "failed") {
      try {
        await enqueueAnalyze(analysis.id, analyzeVideoJob);
      } catch (error) {
        console.error("resume after skip failed", error);
      }
    }
  }
  return c.json({ ok: true });
});

app.delete("/analyses/:id", async (c) => {
  const user = c.get("user");
  if (!isAdmin(user)) return c.json({ error: "仅超级管理员可删除分析" }, 403);
  const analysis = await requireOwnedAnalysis(user, Number(c.req.param("id")));
  if (!analysis) return c.json({ error: "任务不存在" }, 404);
  const db = await getDb();
  const frames = await db.select().from(schema.analysisFrames).where(eq(schema.analysisFrames.analysisId, analysis.id));
  for (const frame of frames) await deleteBlob(frame.blobKey);
  if (analysis.videoBlobKey) await deleteBlob(analysis.videoBlobKey);
  await db.delete(schema.analyses).where(eq(schema.analyses.id, analysis.id));
  return c.json({ ok: true });
});

app.get("/analyses/:id", async (c) => {
  const user = c.get("user");
  const analysis = await requireOwnedAnalysis(user, Number(c.req.param("id")));
  if (!analysis) return c.json({ error: "任务不存在" }, 404);
  const db = await getDb();
  const [sop] = await db.select().from(schema.sops).where(eq(schema.sops.id, analysis.sopId)).limit(1);
  const items = await db
    .select()
    .from(schema.sopCheckItems)
    .where(eq(schema.sopCheckItems.sopId, analysis.sopId))
    .orderBy(asc(schema.sopCheckItems.stepOrder));
  const frames = await db
    .select()
    .from(schema.analysisFrames)
    .where(eq(schema.analysisFrames.analysisId, analysis.id))
    .orderBy(asc(schema.analysisFrames.frameIndex));
  const results = await db
    .select()
    .from(schema.analysisItemResults)
    .where(eq(schema.analysisItemResults.analysisId, analysis.id));
  const resultByItem = new Map(results.map((r) => [r.checkItemId, r]));
  const frameById = new Map(frames.map((f) => [f.id, f]));
  const extras = await analysisExtras(analysis);
  return c.json({
    ...sanitizeAnalysis(user, analysis),
    ...extras,
    sop,
    frames: frames.map((f) => ({ ...f, url: fileUrl(f.blobKey) })),
    items: items.map((item) => {
      const result = resultByItem.get(item.id);
      const evidence = (result?.evidenceFrameIds ?? [])
        .map((fid) => frameById.get(fid))
        .filter(Boolean)
        .map((f) => ({ ...f, url: fileUrl(f!.blobKey) }));
      return { ...item, result: result ?? null, evidence };
    }),
  });
});

export { app };
