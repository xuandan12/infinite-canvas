import axios from "axios";

import { buildApiUrl, type AiConfig } from "@/lib/ai-config";
import { createId } from "@/lib/id";
import { dataUrlToFile } from "@/lib/image-utils";
import { imageToDataUrl } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";

export type ChatCompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

type ImageApiResponse = {
  data?: Array<Record<string, unknown>>;
  error?: { message?: string };
};

function resolveImageDataUrl(item: Record<string, unknown>) {
  if (typeof item.b64_json === "string" && item.b64_json) {
    return `data:image/png;base64,${item.b64_json}`;
  }
  if (typeof item.url === "string" && item.url) {
    return item.url;
  }
  return null;
}

function parseImagePayload(payload: ImageApiResponse) {
  const images =
    payload.data
      ?.map(resolveImageDataUrl)
      .filter((value): value is string => Boolean(value))
      .map((dataUrl) => ({ id: createId(), dataUrl })) || [];

  if (images.length === 0) {
    throw new Error("接口没有返回图片");
  }

  return images;
}

function readAxiosError(error: unknown, fallback: string) {
  if (axios.isAxiosError<{ error?: { message?: string } }>(error)) {
    return error.response?.data?.error?.message || (error.response?.status ? `${fallback}：${error.response.status}` : fallback);
  }
  return error instanceof Error ? error.message : fallback;
}

function parseStreamChunk(chunk: string, onDelta: (value: string) => void) {
  let deltaText = "";
  for (const eventBlock of chunk.split("\n\n")) {
    const data = eventBlock.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
    if (!data || data === "[DONE]") continue;
    const delta = (JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }).choices?.[0]?.delta?.content || "";
    deltaText += delta;
  }
  if (deltaText) onDelta(deltaText);
}

function withSystemPrompt(config: AiConfig, prompt: string) {
  const systemPrompt = config.systemPrompt.trim();
  return systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
}

function withSystemMessage(config: AiConfig, messages: ChatCompletionMessage[]) {
  const systemPrompt = config.systemPrompt.trim();
  return systemPrompt ? [{ role: "system" as const, content: systemPrompt }, ...messages] : messages;
}

export async function requestGeneration(config: AiConfig, prompt: string) {
  const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
  try {
    const response = await axios.post<ImageApiResponse>(
      buildApiUrl(config.baseUrl, "/images/generations"),
      {
        model: config.model,
        prompt: withSystemPrompt(config, prompt),
        n,
        quality: config.quality || undefined,
        size: config.size || undefined,
        response_format: "b64_json",
      },
      {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );
    return parseImagePayload(response.data);
  } catch (error) {
    throw new Error(readAxiosError(error, "请求失败"));
  }
}

export async function requestEdit(config: AiConfig, prompt: string, references: ReferenceImage[]) {
  const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
  const formData = new FormData();
  formData.set("model", config.model);
  formData.set("prompt", withSystemPrompt(config, prompt));
  formData.set("n", String(n));
  formData.set("response_format", "b64_json");
  if (config.quality) {
    formData.set("quality", config.quality);
  }
  if (config.size) {
    formData.set("size", config.size);
  }
  const files = await Promise.all(references.map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
  files.forEach((file) => formData.append("image", file));

  try {
    const response = await axios.post<ImageApiResponse>(buildApiUrl(config.baseUrl, "/images/edits"), formData, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    });
    return parseImagePayload(response.data);
  } catch (error) {
    throw new Error(readAxiosError(error, "请求失败"));
  }
}

export async function requestImageQuestion(config: AiConfig, messages: ChatCompletionMessage[], onDelta: (text: string) => void) {
  let buffer = "";
  let answer = "";
  let processedLength = 0;

  try {
    await axios.post(
      buildApiUrl(config.baseUrl, "/chat/completions"),
      {
      model: config.model,
      messages: withSystemMessage(config, messages),
      stream: true,
      },
      {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        responseType: "text",
        onDownloadProgress: (event) => {
          const responseText = String(event.event?.target?.responseText || "");
          const nextText = responseText.slice(processedLength);
          processedLength = responseText.length;
          buffer += nextText;
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() || "";
          for (const chunk of chunks) {
            parseStreamChunk(chunk, (delta) => {
              answer += delta;
              onDelta(answer);
            });
          }
        },
      },
    );
    if (buffer) {
      parseStreamChunk(buffer, (delta) => {
        answer += delta;
        onDelta(answer);
      });
    }
  } catch (error) {
    throw new Error(readAxiosError(error, "请求失败"));
  }
  return answer || "没有返回内容";
}

export async function fetchImageModels(config: AiConfig) {
  try {
    const response = await axios.get<{ data?: Array<{ id?: string }>; error?: { message?: string } }>(buildApiUrl(config.baseUrl, "/models"), {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    });
    return (response.data.data || [])
      .map((model) => model.id)
      .filter((id): id is string => Boolean(id))
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    throw new Error(readAxiosError(error, "读取模型失败"));
  }
}
