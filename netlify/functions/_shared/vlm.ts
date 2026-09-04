import OpenAI from "openai";
import { getEnv } from "../../../db/env";
import { getModel, type ChatContent } from "./models";
import { getSettingsRow } from "./settings";

export type VlmStatus = {
  ready: boolean;
  model?: string;
};

function vlmApiKey() {
  return getEnv("LVZHI_VLM_API_KEY");
}

function vlmBaseUrl() {
  return getEnv("LVZHI_VLM_BASE_URL");
}

export function isVlmConfigured() {
  return Boolean(vlmApiKey() && vlmBaseUrl());
}

export async function resolveVlmModel(modelOverride?: string): Promise<string> {
  const settings = await getSettingsRow();
  return getModel(modelOverride || settings.modelName || settings.defaultModel).id;
}

export async function getVlmStatus(): Promise<VlmStatus> {
  const ready = isVlmConfigured();
  return {
    ready,
    model: ready ? await resolveVlmModel() : undefined,
  };
}

function client() {
  const apiKey = vlmApiKey();
  const baseURL = vlmBaseUrl();
  if (!apiKey || !baseURL) {
    throw new Error("视觉模型尚未配置。请由管理员在运行环境中设置密钥后重试。");
  }
  return new OpenAI({ apiKey, baseURL });
}

export async function generateVlmText(
  modelId: string | undefined,
  content: ChatContent,
  signal?: AbortSignal,
  maxTokens = 4096,
): Promise<string> {
  if (!isVlmConfigured()) {
    throw new Error("视觉模型尚未配置。请由管理员在运行环境中设置密钥后重试。");
  }
  const model = await resolveVlmModel(modelId);
  const parts: OpenAI.Chat.ChatCompletionContentPart[] = [{ type: "text", text: content.text }];
  for (const image of content.images ?? []) {
    parts.push({
      type: "image_url",
      image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
    });
  }
  const options = signal ? { signal } : undefined;
  let completion;
  try {
    completion = await client().chat.completions.create(
      {
        model,
        temperature: 0.1,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: parts }],
      },
      options,
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    completion = await client().chat.completions.create(
      {
        model,
        messages: [{ role: "user", content: parts }],
      },
      options,
    );
  }
  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("模型未返回文本");
  return text;
}

export async function testVlmConnection(): Promise<{ ok: true; sample: string; model: string }> {
  const model = await resolveVlmModel();
  const text = await generateVlmText(model, { text: "只回复一个词：pong" });
  return { ok: true, sample: text.slice(0, 80), model };
}
