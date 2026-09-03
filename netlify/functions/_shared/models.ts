export const VLM_MODELS = [
  {
    id: "gemini-2.5-flash",
    provider: "gemini" as const,
    label: "Gemini 2.5 Flash",
    hint: "默认，速度快、适合验证抽帧",
  },
  {
    id: "gemini-2.5-pro",
    provider: "gemini" as const,
    label: "Gemini 2.5 Pro",
    hint: "更强视觉推理",
  },
  {
    id: "gemini-2.0-flash",
    provider: "gemini" as const,
    label: "Gemini 2.0 Flash",
    hint: "轻量视觉",
  },
  {
    id: "gpt-4o",
    provider: "openai" as const,
    label: "GPT-4o",
    hint: "OpenAI 多模态",
  },
  {
    id: "gpt-4o-mini",
    provider: "openai" as const,
    label: "GPT-4o Mini",
    hint: "成本更低",
  },
  {
    id: "gpt-4.1",
    provider: "openai" as const,
    label: "GPT-4.1",
    hint: "较强视觉理解",
  },
  {
    id: "claude-sonnet-4-5",
    provider: "anthropic" as const,
    label: "Claude Sonnet 4.5",
    hint: "适合细则对照",
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic" as const,
    label: "Claude Haiku 4.5",
    hint: "更快更省",
  },
] as const;

export type VlmModelId = (typeof VLM_MODELS)[number]["id"];
export type VlmProvider = (typeof VLM_MODELS)[number]["provider"];

export function getModel(id: string) {
  return VLM_MODELS.find((m) => m.id === id) ?? VLM_MODELS[0];
}

export type ImagePart = {
  mimeType: string;
  base64: string;
};

export type ChatContent = {
  text: string;
  images?: ImagePart[];
};
