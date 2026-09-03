import { z } from "zod";

export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("模型未返回 JSON 对象");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

export const parsedSopSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional().default(""),
  steps: z
    .array(
      z.object({
        order: z.number().int().positive().optional(),
        title: z.string().min(1),
        description: z.string().optional().default(""),
        keyActions: z.array(z.string()).optional().default([]),
        passCriteria: z.string().optional().default(""),
        riskHint: z.string().optional().default(""),
        category: z.string().optional().default(""),
      }),
    )
    .min(1),
});

export type ParsedSop = z.infer<typeof parsedSopSchema>;

export const analysisResultSchema = z.object({
  overallSummary: z.string().optional().default(""),
  results: z.array(
    z.object({
      stepOrder: z.number().int().positive(),
      verdict: z.enum(["pass", "fail", "uncertain", "not_observed"]),
      confidence: z.number().min(0).max(1).optional().default(0.5),
      reasoning: z.string().optional().default(""),
      evidenceFrameIndex: z.number().int().min(0).optional(),
      evidenceFrameIndexes: z.array(z.number().int().min(0)).optional(),
      observedAtSec: z.number().optional(),
    }),
  ),
});

export type AnalysisLlmResult = z.infer<typeof analysisResultSchema>;

export function parseSopJson(text: string): ParsedSop {
  const parsed = parsedSopSchema.parse(extractJsonObject(text));
  return {
    ...parsed,
    steps: parsed.steps.map((step, index) => ({
      ...step,
      order: step.order ?? index + 1,
    })),
  };
}

export function parseAnalysisJson(text: string): AnalysisLlmResult {
  return analysisResultSchema.parse(extractJsonObject(text));
}
