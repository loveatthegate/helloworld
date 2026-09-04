import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "../../../db/index";
import { getBlob } from "./blobs";
import { parseSingleStepJson } from "./json";
import { FAST_ANALYZE_MODEL } from "./models";
import { generateVlmText, getVlmStatus } from "./vlm";

const STEP_PROMPT = `你是现场履职审查员。只判断下面这一个 SOP 检查项。只返回 JSON：
{"verdict":"pass","confidence":0.0,"reasoning":"看到了什么","evidenceFrameIndex":0}
verdict 只能是 pass / fail / uncertain / not_observed。只依据可见画面。`;

const ANALYZE_CONCURRENCY = 2;
const ANALYZE_TIMEOUT_MS = 75_000;

function overallFromVerdicts(verdicts: string[]): "pass" | "fail" | "partial" {
  const meaningful = verdicts.filter((v) => v !== "skipped");
  if (meaningful.some((v) => v === "fail")) return "fail";
  if (meaningful.length > 0 && meaningful.every((v) => v === "pass")) return "pass";
  return "partial";
}

function withTimeout<T>(factory: (signal: AbortSignal) => Promise<T>, ms: number, label: string) {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`${label}超过 ${Math.round(ms / 1000)} 秒未返回`));
    }, ms);
    factory(controller.signal).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        if (controller.signal.aborted) {
          reject(new Error(`${label}超过 ${Math.round(ms / 1000)} 秒未返回`));
          return;
        }
        reject(error);
      },
    );
  });
}

function pickFrames<T>(frames: T[], limit: number) {
  if (frames.length <= limit) return frames;
  if (limit <= 1) return frames.slice(0, 1);
  const picked: T[] = [];
  for (let i = 0; i < limit; i++) {
    const idx = Math.round((i * (frames.length - 1)) / (limit - 1));
    const frame = frames[idx]!;
    if (!picked.includes(frame)) picked.push(frame);
  }
  return picked;
}

async function mapPool<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
}

async function setProgress(analysisId: number, step: number, total: number, message: string) {
  const db = await getDb();
  await db
    .update(schema.analyses)
    .set({
      status: "analyzing",
      progressStep: step,
      progressTotal: total,
      progressMessage: message,
      progressUpdatedAt: new Date(),
    })
    .where(eq(schema.analyses.id, analysisId));
}

function analyzeModelId(stored?: string | null) {
  if (!stored || stored === "gpt-5.6-terra" || stored === "gpt-5.6-sol") return FAST_ANALYZE_MODEL;
  return stored;
}

export async function analyzeVideoJob(analysisId: number): Promise<void> {
  const db = await getDb();
  const [analysis] = await db
    .select()
    .from(schema.analyses)
    .where(eq(schema.analyses.id, analysisId))
    .limit(1);
  if (!analysis) throw new Error(`分析任务 ${analysisId} 不存在`);

  try {
    const items = await db
      .select()
      .from(schema.sopCheckItems)
      .where(eq(schema.sopCheckItems.sopId, analysis.sopId))
      .orderBy(asc(schema.sopCheckItems.stepOrder));
    if (!items.length) throw new Error("该 SOP 还没有检查项，请先完成手册解析");

    const frames = await db
      .select()
      .from(schema.analysisFrames)
      .where(eq(schema.analysisFrames.analysisId, analysisId))
      .orderBy(asc(schema.analysisFrames.frameIndex));
    if (!frames.length) throw new Error("没有可用的画面");

    await setProgress(analysisId, 0, items.length, `已准备 ${frames.length} 张画面，开始快速分析`);

    const vlm = await getVlmStatus();
    if (!vlm.ready) {
      await db.delete(schema.analysisItemResults).where(eq(schema.analysisItemResults.analysisId, analysisId));
      await db.insert(schema.analysisItemResults).values(
        items.map((item) => ({
          analysisId,
          checkItemId: item.id,
          verdict: "not_observed" as const,
          confidence: 0,
          reasoning: "未配置视觉模型密钥，无法对抽帧做履职判定。请由管理员完成模型密钥配置后重新分析。",
          evidenceFrameIds: [],
          observedAtSec: null,
        })),
      );
      await db
        .update(schema.analyses)
        .set({
          status: "completed",
          overallResult: "partial",
          overallSummary: "抽帧已保存，但当前没有可用的视觉模型。",
          errorMessage: null,
          progressMessage: "未配置模型",
          progressUpdatedAt: new Date(),
          completedAt: new Date(),
        })
        .where(eq(schema.analyses.id, analysisId));
      return;
    }

    const frameLimit = analysis.sourceType === "images" ? Math.min(frames.length, 2) : Math.min(frames.length, 2);
    const selectedFrames = pickFrames(frames, frameLimit);
    await setProgress(analysisId, 0, items.length, `正在读取 ${selectedFrames.length} 张画面…`);
    const loaded = await Promise.all(
      selectedFrames.map(async (frame) => {
        const blob = await getBlob(frame.blobKey);
        if (!blob) return null;
        return {
          frame,
          image: {
            mimeType: blob.contentType || "image/jpeg",
            base64: Buffer.from(blob.data).toString("base64"),
          },
          note:
            analysis.sourceType === "images"
              ? `照片${frame.frameIndex + 1}（序号 ${frame.frameIndex}）`
              : `帧${frame.frameIndex} t=${frame.timestampSec.toFixed(1)}s`,
        };
      }),
    );
    const ready = loaded.filter((row): row is NonNullable<typeof row> => Boolean(row));
    const images = ready.map((row) => row.image);
    const frameNotes = ready.map((row) => row.note);
    if (!images.length) throw new Error("抽帧文件读取失败");

    const existing = await db
      .select()
      .from(schema.analysisItemResults)
      .where(eq(schema.analysisItemResults.analysisId, analysisId));
    const existingIds = new Set(existing.map((row) => row.checkItemId));
    const pending = items.filter((item) => !existingIds.has(item.id));
    let finished = items.length - pending.length;
    await setProgress(
      analysisId,
      finished,
      items.length,
      pending.length ? `并行分析剩余 ${pending.length} 步（每步约 1 张图）` : "步骤已齐，正在汇总",
    );

    const modelId = analyzeModelId(analysis.modelUsed);
    await mapPool(pending, ANALYZE_CONCURRENCY, async (item) => {
      const actions = Array.isArray(item.keyActions) ? item.keyActions.join("；") : "";
      const checklist = `步骤${item.stepOrder} ${item.title}
${item.description || ""}
关键动作：${actions}
通过标准：${item.passCriteria || ""}`;
      const heartbeat = setInterval(() => {
        void setProgress(analysisId, finished, items.length, `仍在分析「${item.title}」，模型尚未返回`);
      }, 12_000);
      try {
        const raw = await withTimeout(
          (signal) =>
            generateVlmText(
              modelId,
              {
                text: `${STEP_PROMPT}\n\n${checklist}\n画面：\n${frameNotes.join("\n")}`,
                images,
              },
              signal,
              700,
            ),
          ANALYZE_TIMEOUT_MS,
          `步骤「${item.title}」`,
        );
        const found = parseSingleStepJson(raw);
        const indexes = [
          ...(found.evidenceFrameIndexes ?? []),
          ...(found.evidenceFrameIndex != null ? [found.evidenceFrameIndex] : []),
        ];
        const unique = [...new Set(indexes)];
        const evidenceFrames = unique
          .map((idx) => frames.find((f) => f.frameIndex === idx) ?? frames[idx])
          .filter((frame): frame is (typeof frames)[number] => Boolean(frame));
        const again = await db
          .select()
          .from(schema.analysisItemResults)
          .where(
            and(eq(schema.analysisItemResults.analysisId, analysisId), eq(schema.analysisItemResults.checkItemId, item.id)),
          )
          .limit(1);
        if (!again[0]) {
          await db.insert(schema.analysisItemResults).values({
            analysisId,
            checkItemId: item.id,
            verdict: found.verdict,
            confidence: found.confidence ?? 0.4,
            reasoning: found.reasoning || "模型未给出该项说明",
            evidenceFrameIds: evidenceFrames.map((frame) => frame.id),
            observedAtSec: found.observedAtSec ?? evidenceFrames[0]?.timestampSec ?? null,
          });
        }
      } catch (error) {
        const again = await db
          .select()
          .from(schema.analysisItemResults)
          .where(
            and(eq(schema.analysisItemResults.analysisId, analysisId), eq(schema.analysisItemResults.checkItemId, item.id)),
          )
          .limit(1);
        if (!again[0]) {
          const message = error instanceof Error ? error.message : String(error);
          await db.insert(schema.analysisItemResults).values({
            analysisId,
            checkItemId: item.id,
            verdict: "uncertain",
            confidence: 0,
            reasoning: `该步骤分析未完成：${message}。可跳过或继续分析。`,
            evidenceFrameIds: [],
            observedAtSec: null,
          });
        }
      } finally {
        clearInterval(heartbeat);
        finished += 1;
        await setProgress(analysisId, finished, items.length, `已完成 ${finished}/${items.length} 步`);
      }
    });

    const results = await db
      .select()
      .from(schema.analysisItemResults)
      .where(eq(schema.analysisItemResults.analysisId, analysisId));
    const overall = overallFromVerdicts(results.map((r) => r.verdict));
    const done = results.filter((r) => r.verdict !== "skipped").length;
    await db
      .update(schema.analyses)
      .set({
        status: "completed",
        overallResult: overall,
        overallSummary: `已完成 ${done}/${items.length} 个步骤的比对。`,
        errorMessage: null,
        progressStep: items.length,
        progressTotal: items.length,
        progressMessage: "分析完成",
        progressUpdatedAt: new Date(),
        completedAt: new Date(),
        modelUsed: modelId,
      })
      .where(eq(schema.analyses.id, analysisId));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(schema.analyses)
      .set({
        status: "failed",
        errorMessage: message,
        progressMessage: message,
        progressUpdatedAt: new Date(),
        completedAt: new Date(),
      })
      .where(eq(schema.analyses.id, analysisId));
    throw error;
  }
}
