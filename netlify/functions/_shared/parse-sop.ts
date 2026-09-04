import { eq } from "drizzle-orm";
import { getDb, schema } from "../../../db/index";
import { getBlob } from "./blobs";
import { extractSopContent } from "./extract";
import { heuristicParseSop } from "./heuristic";
import { parseSopJson, type ParsedSop } from "./json";
import { generateVlmText, getVlmStatus } from "./vlm";
import { getModel } from "./models";

const PARSE_PROMPT = `你是工业/现场作业 SOP 结构化助手。请阅读用户提供的作业指导书，抽取可用于现场履职检查的步骤清单。

要求：
1. 只依据原文，不要编造手册中没有的步骤。
2. 每个步骤要能被视频画面核验（动作、顺序、防护、确认点）。
3. 必须返回 JSON 对象，不要 Markdown 解释。

JSON 形状：
{
  "title": "手册标题",
  "summary": "一两句话概述作业目的与范围",
  "steps": [
    {
      "order": 1,
      "title": "短标题",
      "description": "该步骤做什么",
      "keyActions": ["可观察的动作1", "动作2"],
      "passCriteria": "判定合格的画面标准",
      "riskHint": "违规/安全风险，可空字符串",
      "category": "准备|操作|确认|收尾"
    }
  ]
}`;

async function parseWithModel(modelId: string, extracted: { text: string; images: { mimeType: string; base64: string }[] }): Promise<ParsedSop> {
  const raw = await generateVlmText(modelId, {
    text: `${PARSE_PROMPT}\n\n手册原文：\n${extracted.text.slice(0, 24000)}`,
    images: extracted.images.slice(0, 8),
  });
  return parseSopJson(raw);
}

export async function parseSopJob(sopId: number): Promise<void> {
  const db = await getDb();
  const [sop] = await db.select().from(schema.sops).where(eq(schema.sops.id, sopId)).limit(1);
  if (!sop) throw new Error(`SOP ${sopId} 不存在`);

  await db
    .update(schema.sops)
    .set({ status: "parsing", parseError: null, updatedAt: new Date() })
    .where(eq(schema.sops.id, sopId));

  try {
    const blob = await getBlob(sop.blobKey);
    if (!blob) throw new Error("找不到已上传的 SOP 文件");
    const extracted = await extractSopContent(blob.data, sop.contentType, sop.originalFilename);
    if (!extracted.text && extracted.images.length === 0) {
      throw new Error("无法从文件中提取内容，请上传 PDF、Word、图片或文本手册");
    }

    const model = getModel(sop.modelUsed);
    const status = await getVlmStatus();
    const canUseModel = status.ready && (Boolean(extracted.text) || extracted.images.length > 0);

    let parsed: ParsedSop;
    let modelUsed: string = model.id;
    if (canUseModel && (status.ready || extracted.images.length > 0)) {
      try {
        parsed = await parseWithModel(model.id, extracted);
      } catch (err) {
        if (!extracted.text) throw err;
        parsed = heuristicParseSop(extracted.text, sop.originalFilename);
        modelUsed = "local-heuristic";
      }
    } else if (extracted.text) {
      parsed = heuristicParseSop(extracted.text, sop.originalFilename);
      modelUsed = "local-heuristic";
    } else {
      parsed = await parseWithModel(model.id, extracted);
    }

    await db.delete(schema.sopCheckItems).where(eq(schema.sopCheckItems.sopId, sopId));
    if (parsed.steps.length) {
      await db.insert(schema.sopCheckItems).values(
        parsed.steps.map((step, index) => ({
          sopId,
          stepOrder: step.order ?? index + 1,
          title: step.title.slice(0, 255),
          description: step.description,
          keyActions: step.keyActions ?? [],
          passCriteria: step.passCriteria,
          riskHint: step.riskHint,
          category: step.category || null,
        })),
      );
    }

    await db
      .update(schema.sops)
      .set({
        status: "ready",
        title: parsed.title.slice(0, 255),
        summary: parsed.summary,
        modelUsed,
        parseError: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.sops.id, sopId));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(schema.sops)
      .set({ status: "failed", parseError: message, updatedAt: new Date() })
      .where(eq(schema.sops.id, sopId));
    throw error;
  }
}
