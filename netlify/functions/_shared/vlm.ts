import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { getEnv } from "../../../db/env";
import { getModel, type ChatContent, type VlmProvider } from "./models";

export type VlmMode = "gateway" | "byok" | "none";

export type VlmStatus = {
  ready: boolean;
  mode: VlmMode;
  providers: {
    gemini: boolean;
    openai: boolean;
    anthropic: boolean;
  };
};

function looksLikeGateway(): boolean {
  const urls = [
    getEnv("NETLIFY_AI_GATEWAY_BASE_URL"),
    getEnv("OPENAI_BASE_URL"),
    getEnv("GOOGLE_GEMINI_BASE_URL"),
    getEnv("ANTHROPIC_BASE_URL"),
  ];
  return urls.some((u) => Boolean(u && /netlify/i.test(u)));
}

export function getVlmStatus(): VlmStatus {
  const gateway = looksLikeGateway() || Boolean(getEnv("NETLIFY_AI_GATEWAY_KEY"));
  const gemini = Boolean(getEnv("GEMINI_API_KEY"));
  const openai = Boolean(getEnv("OPENAI_API_KEY"));
  const anthropic = Boolean(getEnv("ANTHROPIC_API_KEY"));
  const byok = gemini || openai || anthropic;
  const ready = gateway || byok;
  const mode: VlmMode = gateway ? "gateway" : byok ? "byok" : "none";
  return {
    ready,
    mode,
    providers: {
      gemini: gateway || gemini,
      openai: gateway || openai,
      anthropic: gateway || anthropic,
    },
  };
}

export function providerAvailable(provider: VlmProvider, status = getVlmStatus()): boolean {
  if (status.mode === "gateway") return true;
  return status.providers[provider];
}

export async function generateVlmText(modelId: string, content: ChatContent): Promise<string> {
  const model = getModel(modelId);
  const status = getVlmStatus();
  if (!providerAvailable(model.provider, status)) {
    throw new Error(
      `当前未配置 ${model.label} 所需密钥。请设置对应环境变量，或部署到 Netlify 并启用 AI Gateway。`,
    );
  }
  if (model.provider === "gemini") return generateGemini(model.id, content);
  if (model.provider === "openai") return generateOpenAI(model.id, content);
  return generateAnthropic(model.id, content);
}

async function generateGemini(model: string, content: ChatContent): Promise<string> {
  const apiKey = getEnv("GEMINI_API_KEY");
  const ai = new GoogleGenAI(apiKey ? { apiKey } : {});
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: content.text },
  ];
  for (const image of content.images ?? []) {
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
  }
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
  });
  const text = response.text;
  if (!text) throw new Error("Gemini 未返回文本");
  return text;
}

async function generateOpenAI(model: string, content: ChatContent): Promise<string> {
  const client = new OpenAI({
    ...(getEnv("OPENAI_API_KEY") ? { apiKey: getEnv("OPENAI_API_KEY") } : {}),
    ...(getEnv("OPENAI_BASE_URL") ? { baseURL: getEnv("OPENAI_BASE_URL") } : {}),
  });
  const parts: OpenAI.Chat.ChatCompletionContentPart[] = [{ type: "text", text: content.text }];
  for (const image of content.images ?? []) {
    parts.push({
      type: "image_url",
      image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
    });
  }
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.1,
    messages: [{ role: "user", content: parts }],
  });
  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("OpenAI 未返回文本");
  return text;
}

async function generateAnthropic(model: string, content: ChatContent): Promise<string> {
  const client = new Anthropic({
    ...(getEnv("ANTHROPIC_API_KEY") ? { apiKey: getEnv("ANTHROPIC_API_KEY") } : {}),
    ...(getEnv("ANTHROPIC_BASE_URL") ? { baseURL: getEnv("ANTHROPIC_BASE_URL") } : {}),
  });
  const parts: Anthropic.ContentBlockParam[] = [];
  for (const image of content.images ?? []) {
    const mediaType = image.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    parts.push({
      type: "image",
      source: { type: "base64", media_type: mediaType, data: image.base64 },
    });
  }
  parts.push({ type: "text", text: content.text });
  const message = await client.messages.create({
    model,
    max_tokens: 4096,
    temperature: 0.1,
    messages: [{ role: "user", content: parts }],
  });
  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  if (!text) throw new Error("Anthropic 未返回文本");
  return text;
}
