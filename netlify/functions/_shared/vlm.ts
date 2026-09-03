import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { getEnv } from "../../../db/env";
import { getModel, type ChatContent, type VlmProvider } from "./models";
import { getSettingsRow } from "./settings";

export type VlmMode = "gateway" | "byok" | "settings" | "none";

export type VlmStatus = {
  ready: boolean;
  mode: VlmMode;
  provider?: string;
  model?: string;
  providers: {
    gemini: boolean;
    openai: boolean;
    anthropic: boolean;
  };
};

export type VlmRuntime = {
  provider: VlmProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
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

export async function resolveVlmRuntime(modelOverride?: string): Promise<VlmRuntime> {
  const settings = await getSettingsRow();
  const fallback = getModel(modelOverride || settings.modelName || settings.defaultModel);
  const provider = (settings.provider || fallback.provider) as VlmProvider;
  return {
    provider,
    model: modelOverride || settings.modelName || settings.defaultModel || fallback.id,
    apiKey: settings.apiKey || undefined,
    baseUrl: settings.baseUrl || undefined,
  };
}

export async function getVlmStatus(): Promise<VlmStatus> {
  const runtime = await resolveVlmRuntime();
  const gateway = looksLikeGateway() || Boolean(getEnv("NETLIFY_AI_GATEWAY_KEY"));
  const envGemini = Boolean(getEnv("GEMINI_API_KEY"));
  const envOpenAI = Boolean(getEnv("OPENAI_API_KEY"));
  const envAnthropic = Boolean(getEnv("ANTHROPIC_API_KEY"));
  const settingsReady = Boolean(runtime.apiKey) || gateway;
  const byok = envGemini || envOpenAI || envAnthropic;
  const ready = settingsReady || byok || gateway;
  const mode: VlmMode = runtime.apiKey ? "settings" : gateway ? "gateway" : byok ? "byok" : "none";
  return {
    ready,
    mode,
    provider: runtime.provider,
    model: runtime.model,
    providers: {
      gemini: gateway || envGemini || (runtime.provider === "gemini" && Boolean(runtime.apiKey)),
      openai: gateway || envOpenAI || (runtime.provider === "openai" && Boolean(runtime.apiKey)),
      anthropic: gateway || envAnthropic || (runtime.provider === "anthropic" && Boolean(runtime.apiKey)),
    },
  };
}

export async function generateVlmText(modelId: string | undefined, content: ChatContent): Promise<string> {
  const runtime = await resolveVlmRuntime(modelId);
  const status = await getVlmStatus();
  if (!status.ready) {
    throw new Error("尚未配置可用的视觉模型。请由超级管理员在系统设置中填写模型、接口地址与 API Key。");
  }
  if (runtime.provider === "gemini") return generateGemini(runtime, content);
  if (runtime.provider === "openai") return generateOpenAI(runtime, content);
  return generateAnthropic(runtime, content);
}

export async function testVlmConnection(): Promise<{ ok: true; sample: string; model: string; provider: string }> {
  const runtime = await resolveVlmRuntime();
  const text = await generateVlmText(runtime.model, { text: "只回复一个词：pong" });
  return { ok: true, sample: text.slice(0, 80), model: runtime.model, provider: runtime.provider };
}

async function generateGemini(runtime: VlmRuntime, content: ChatContent): Promise<string> {
  const apiKey = runtime.apiKey || getEnv("GEMINI_API_KEY");
  const ai = new GoogleGenAI(apiKey ? { apiKey } : {});
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: content.text },
  ];
  for (const image of content.images ?? []) {
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
  }
  const response = await ai.models.generateContent({
    model: runtime.model,
    contents: [{ role: "user", parts }],
  });
  const text = response.text;
  if (!text) throw new Error("Gemini 未返回文本");
  return text;
}

async function generateOpenAI(runtime: VlmRuntime, content: ChatContent): Promise<string> {
  const client = new OpenAI({
    ...(runtime.apiKey || getEnv("OPENAI_API_KEY")
      ? { apiKey: runtime.apiKey || getEnv("OPENAI_API_KEY") }
      : {}),
    ...(runtime.baseUrl || getEnv("OPENAI_BASE_URL")
      ? { baseURL: runtime.baseUrl || getEnv("OPENAI_BASE_URL") }
      : {}),
  });
  const parts: OpenAI.Chat.ChatCompletionContentPart[] = [{ type: "text", text: content.text }];
  for (const image of content.images ?? []) {
    parts.push({
      type: "image_url",
      image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
    });
  }
  const completion = await client.chat.completions.create({
    model: runtime.model,
    temperature: 0.1,
    messages: [{ role: "user", content: parts }],
  });
  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("OpenAI 未返回文本");
  return text;
}

async function generateAnthropic(runtime: VlmRuntime, content: ChatContent): Promise<string> {
  const client = new Anthropic({
    ...(runtime.apiKey || getEnv("ANTHROPIC_API_KEY")
      ? { apiKey: runtime.apiKey || getEnv("ANTHROPIC_API_KEY") }
      : {}),
    ...(runtime.baseUrl || getEnv("ANTHROPIC_BASE_URL")
      ? { baseURL: runtime.baseUrl || getEnv("ANTHROPIC_BASE_URL") }
      : {}),
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
    model: runtime.model,
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
