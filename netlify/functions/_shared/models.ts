export const VLM_MODELS = [
  {
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    hint: "文档解析与画面核验，推荐默认",
  },
  {
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    hint: "文档解析与画面核验",
  },
  {
    id: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    hint: "文档解析与画面核验",
  },
  {
    id: "kimi-k3",
    label: "Kimi K3",
    hint: "长文本手册与视觉理解",
  },
  {
    id: "doubao-seed-evolving",
    label: "豆包 Seed",
    hint: "文档解析与视觉理解",
  },
  {
    id: "gemini-3.1-flash-image",
    label: "Gemini 3.1 Flash Image",
    hint: "看图分析",
  },
] as const;

export type VlmModelId = (typeof VLM_MODELS)[number]["id"];

export function getModel(id?: string | null) {
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
