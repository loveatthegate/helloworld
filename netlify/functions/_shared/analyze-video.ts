import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "../../../db/index";
import { getBlob } from "./blobs";
import { parseAnalysisJson } from "./json";
import { generateVlmText, getVlmStatus } from "./vlm";

const ANALYZE_PROMPT = `你是现场履职审查员。下面给出 SOP 检查项，以及按时间顺序抽取的工作视频帧（每张图附带时间戳）。

请逐项判断视频是否满足该检查项：
- pass：画面能明确看到符合要求的动作/状态
- fail：画面显示明显不符合或缺失关键动作
- uncertain：有相关画面但无法确认
- not_observed：抽帧中完全看不到该步骤

只依据可见画面，不要臆测未出现的内容。必须返回 JSON：
{
  "overallSummary": "总体结论，中文",
  "results": [
    {
      "stepOrder": 1,
      "verdict": "pass",
      "confidence": 0.0,
      "reasoning": "结合哪些帧、看到了什么",
      "evidenceFrameIndex": 0,
      "observedAtSec": 0
    }
  ]
}

evidenceFrameIndex 使用帧列表中的序号（从 0 开始）。每条检查项都要有结果。`;

function overallFromVerdicts(verdicts: string[]): "pass" | "fail" | "partial" {
  if (verdicts.some((v) => v === "fail")) return "fail";
  if (verdicts.length > 0 && verdicts.every((v) => v === "pass")) return "pass";
  return "partial";
}

export async function analyzeVideoJob(analysisId: number): Promise<void> {
  const db = await getDb();
  const [analysis] = await db
    .select()
    .from(schema.analyses)
    .where(eq(schema.analyses.id, analysisId))
    .limit(1);
  if (!analysis) throw new Error(`分析任务 ${analysisId} 不存在`);

  await db
    .update(schema.analyses)
    .set({ status: "analyzing", errorMessage: null })
    .where(eq(schema.analyses.id, analysisId));

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
    if (!frames.length) throw new Error("没有可用的视频抽帧");

    const checklist = items
      .map((item) => {
        const actions = Array.isArray(item.keyActions) ? item.keyActions.join("；") : "";
        return `步骤${item.stepOrder} [${item.category || "操作"}] ${item.title}
说明：${item.description || ""}
关键动作：${actions}
通过标准：${item.passCriteria || ""}
风险：${item.riskHint || ""}`;
      })
      .join("\n\n");

    const images: { mimeType: string; base64: string }[] = [];
    const frameNotes: string[] = [];
    for (const frame of frames.slice(0, analysis.maxFrames)) {
      const blob = await getBlob(frame.blobKey);
      if (!blob) continue;
      images.push({
        mimeType: blob.contentType || "image/jpeg",
        base64: Buffer.from(blob.data).toString("base64"),
      });
      frameNotes.push(`帧${frame.frameIndex} t=${frame.timestampSec.toFixed(1)}s`);
    }
    if (!images.length) throw new Error("抽帧文件读取失败");

    const vlm = getVlmStatus();
    if (!vlm.ready) {
      await db.delete(schema.analysisItemResults).where(eq(schema.analysisItemResults.analysisId, analysisId));
      await db.insert(schema.analysisItemResults).values(
        items.map((item) => ({
          analysisId,
          checkItemId: item.id,
          verdict: "not_observed" as const,
          confidence: 0,
          reasoning: "未配置视觉模型密钥，无法对抽帧做履职判定。请设置 GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY，或部署到 Netlify 并启用 AI Gateway 后重新分析。",
          evidenceFrameIds: [],
          observedAtSec: null,
        })),
      );
      await db
        .update(schema.analyses)
        .set({
          status: "completed",
          overallResult: "partial",
          overallSummary: "抽帧已保存，但当前没有可用的视觉模型，检查项均标记为未观察到。配置密钥后可重新发起分析。",
          errorMessage: null,
          completedAt: new Date(),
        })
        .where(eq(schema.analyses.id, analysisId));
      return;
    }

    const raw = await generateVlmText(analysis.modelUsed, {
      text: `${ANALYZE_PROMPT}\n\n检查项：\n${checklist}\n\n抽帧时间轴：\n${frameNotes.join("\n")}\n抽帧间隔 ${analysis.frameIntervalSec} 秒，共 ${images.length} 帧。`,
      images,
    });
    const parsed = parseAnalysisJson(raw);

    await db.delete(schema.analysisItemResults).where(eq(schema.analysisItemResults.analysisId, analysisId));

    const results = items.map((item) => {
      const found = parsed.results.find((r) => r.stepOrder === item.stepOrder);
      const frame =
        found?.evidenceFrameIndex != null
          ? frames.find((f) => f.frameIndex === found.evidenceFrameIndex) ??
            frames[found.evidenceFrameIndex]
          : undefined;
      return {
        analysisId,
        checkItemId: item.id,
        verdict: found?.verdict ?? "not_observed",
        confidence: found?.confidence ?? 0.4,
        reasoning: found?.reasoning || "模型未给出该项说明",
        evidenceFrameIds: frame ? [frame.id] : [],
        observedAtSec: found?.observedAtSec ?? frame?.timestampSec ?? null,
      };
    });

    if (results.length) {
      await db.insert(schema.analysisItemResults).values(results);
    }

    const overall = overallFromVerdicts(results.map((r) => r.verdict));
    await db
      .update(schema.analyses)
      .set({
        status: "completed",
        overallResult: overall,
        overallSummary: parsed.overallSummary || "已完成逐项比对",
        errorMessage: null,
        completedAt: new Date(),
      })
      .where(eq(schema.analyses.id, analysisId));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(schema.analyses)
      .set({ status: "failed", errorMessage: message, completedAt: new Date() })
      .where(eq(schema.analyses.id, analysisId));
    throw error;
  }
}
