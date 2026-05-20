export type AiConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  imageModel: string;
  textModel: string;
  systemPrompt: string;
  models: string[];
  quality: string;
  size: string;
  count: string;
};

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";

export const defaultConfig: AiConfig = {
  baseUrl: "https://api.openai.com",
  apiKey: "",
  model: "gpt-image-2",
  imageModel: "gpt-image-2",
  textModel: "gpt-5.5",
  systemPrompt: "",
  models: [],
  quality: "auto",
  size: "1:1",
  count: "1",
};

export function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function buildApiUrl(baseUrl: string, path: string) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const apiBaseUrl = normalizedBaseUrl.endsWith("/v1") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
  return `${apiBaseUrl}${path}`;
}
