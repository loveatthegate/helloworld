import { inferCheckItemAttrs } from "./check-item";
import type { ParsedSop } from "./json";

function splitBlocks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const heading = normalized.split(/\n(?=#{1,3}\s+)/);
  if (heading.length > 1) return heading.map((b) => b.trim()).filter(Boolean);
  const numbered = normalized.split(/\n(?=(?:\d+[\.、\)]\s|[一二三四五六七八九十]+[、.]\s|步骤\s*\d+))/);
  if (numbered.length > 1) return numbered.map((b) => b.trim()).filter(Boolean);
  return normalized
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 8);
}

function firstLine(block: string): string {
  return block.split("\n")[0]?.replace(/^#{1,3}\s*/, "").replace(/^\d+[\.、\)]\s*/, "").trim() || "未命名步骤";
}

export function heuristicParseSop(text: string, filename: string): ParsedSop {
  const blocks = splitBlocks(text);
  const titleBlock = blocks[0] ?? filename;
  const title = firstLine(titleBlock).slice(0, 80) || filename.replace(/\.[^.]+$/, "");
  const stepBlocks = blocks.length > 1 ? blocks.slice(1) : blocks;
  const steps = stepBlocks.slice(0, 20).map((block, index) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const stepTitle = firstLine(block).slice(0, 80);
    const body = lines.slice(1).join("\n");
    const actions = lines
      .filter((l) => /^[-*•]/.test(l) || /应|必须|需要|确认/.test(l))
      .map((l) => l.replace(/^[-*•]\s*/, ""))
      .slice(0, 6);
    return {
      order: index + 1,
      title: stepTitle,
      description: body || lines.join("\n"),
      keyActions: actions.length ? actions : lines.slice(0, 3),
      passCriteria: actions[0] || "画面中可观察到该步骤的关键动作",
      riskHint: /禁止|不得|危险|注意/.test(block) ? "注意手册中的禁止项与安全提示" : "",
      category: index === 0 ? "准备" : "操作",
      ...inferCheckItemAttrs({
        title: stepTitle,
        description: body || lines.join("\n"),
        category: index === 0 ? "准备" : "操作",
        riskHint: /禁止|不得|危险|注意/.test(block) ? "注意手册中的禁止项与安全提示" : "",
        keyActions: actions.length ? actions : lines.slice(0, 3),
      }),
    };
  });
  return {
    title,
    summary: `由本地规则从《${title}》抽取 ${steps.length} 个检查项（未调用视觉模型）。`,
    steps: steps.length ? steps : [
      {
        order: 1,
        title: title,
        description: text.slice(0, 800),
        keyActions: ["按手册全文核验作业过程"],
        passCriteria: "视频覆盖手册要求的主要动作",
        riskHint: "",
        category: "综合",
        ...inferCheckItemAttrs({ title, description: text.slice(0, 800), category: "综合" }),
      },
    ],
  };
}
