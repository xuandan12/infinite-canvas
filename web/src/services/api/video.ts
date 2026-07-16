import axios, { type AxiosResponse } from "axios";

import { dataUrlToFile } from "@/lib/image-utils";
import {
    buildGrokVideoPayload,
    buildNewApiGrokVideoPayload,
    GROK_VIDEO_REFERENCE_LIMITS,
    grokVideoRequestId,
    isGrokVideoModel,
    isOfficialXaiBaseUrl,
    officialXaiApiUrl,
    readGrokVideoTaskState,
    readNewApiGrokVideoTaskState,
    type GrokVideoCreateResponse,
    type GrokVideoProtocol,
    type GrokVideoTaskResponse,
    type NewApiGrokVideoTaskResponse,
} from "@/lib/grok-video";
import { getMediaBlob, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import {
    boolConfig,
    buildSeedancePromptText,
    isOfficialArkBaseUrl,
    isSeedanceVideoConfig,
    normalizeOfficialSeedanceModel,
    normalizeSeedanceDuration,
    normalizeSeedanceRatio,
    normalizeSeedanceResolution,
    officialArkVideoBaseUrl,
    seedanceVideoReferenceError,
    SEEDANCE_REFERENCE_LIMITS,
} from "@/lib/seedance-video";
import { buildApiUrl, modelOptionName, resolveModelRequestConfig, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

type VideoResponse = { id: string; status?: string; error?: { message?: string }; url?: string; result_url?: string; video_url?: string; content?: { video_url?: string; url?: string } | null };
type ApiVideoResponse = VideoResponse | { code?: number | string; data?: VideoResponse | null; msg?: string; message?: string; error?: { message?: string } };
type SeedanceTask = {
    id: string;
    status?: "queued" | "running" | "succeeded" | "completed" | "failed" | "cancelled" | "expired";
    error?: { code?: string; message?: string } | null;
    content?: { video_url?: string; url?: string; last_frame_url?: string } | null;
    url?: string;
    result_url?: string;
    video_url?: string;
    resolution?: string;
    ratio?: string;
    duration?: number | string;
};
type ApiEnvelope<T> = T | { code?: number | string; data?: T | null; msg?: string; message?: string; error?: { message?: string } };
type RequestOptions = { signal?: AbortSignal };

const GROK_PROXY_LOCAL_IMAGE_BUDGET_BYTES = 3 * 1024 * 1024;

export type VideoGenerationResult = { blob?: Blob; url?: string; mimeType?: string; resolution?: string; ratio?: string; durationSeconds?: number };
export type VideoGenerationTask = { id: string; provider: "openai" | "seedance" | "grok"; model: string; protocol?: GrokVideoProtocol };
export type VideoGenerationTaskState = { status: "pending" } | { status: "completed"; result: VideoGenerationResult } | { status: "failed"; error: string };

function aiApiUrl(config: AiConfig, path: string) {
    return buildApiUrl(config.baseUrl, path);
}

function grokApiUrl(config: AiConfig, path: string) {
    return officialXaiApiUrl(config.baseUrl, path) || aiApiUrl(config, path);
}

function aiHeaders(config: AiConfig, contentType?: string) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], options?: RequestOptions): Promise<VideoGenerationResult> {
    const task = await createVideoGenerationTask(config, prompt, references, videoReferences, audioReferences, options);
    const delayMs = task.provider === "openai" ? 2500 : 5000;
    for (let attempt = 0; attempt < 120; attempt += 1) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const state = await pollVideoGenerationTask(config, task, options);
        if (state.status === "completed") return state.result;
        if (state.status === "failed") throw new Error(state.error);
        if (attempt === 119) throw new Error(`${task.provider === "seedance" ? "Seedance " : ""}视频生成超时，请稍后重试`);
        await delay(delayMs, options?.signal);
    }
    throw new Error("视频生成超时，请稍后重试");
}

export async function createVideoGenerationTask(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], options?: RequestOptions): Promise<VideoGenerationTask> {
    const selectedModel = (config.model || config.videoModel).trim();
    const requestConfig = resolveModelRequestConfig(config, selectedModel);
    assertVideoConfig(requestConfig, requestConfig.model);
    if (isSeedanceVideoConfig(requestConfig)) {
        return createSeedanceTask(requestConfig, selectedModel, prompt, references, videoReferences, audioReferences, options);
    }
    if (videoReferences.length || audioReferences.length) {
        throw new Error("当前视频接口不支持参考视频或参考音频，请切换到 Seedance 2.0 / 火山 Agent Plan 模型，或移除参考素材");
    }
    if (isGrokVideoModel(requestConfig.model)) {
        return createGrokVideoTask(requestConfig, selectedModel, prompt, references, options);
    }
    return createOpenAIVideoTask(requestConfig, selectedModel, prompt, references, options);
}

export async function pollVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    const requestConfig = resolveModelRequestConfig(config, task.model);
    assertVideoConfig(requestConfig, requestConfig.model);
    if (task.provider === "seedance") return pollSeedanceTask(requestConfig, task, options);
    if (task.provider === "grok") return pollGrokVideoTask(requestConfig, task, options);
    return pollOpenAIVideoTask(requestConfig, task, options);
}

export async function storeGeneratedVideo(result: VideoGenerationResult): Promise<UploadedFile> {
    if (result.blob) return uploadMediaFile(result.blob, "video");
    if (result.url) {
        try {
            return await uploadMediaFile(result.url, "video");
        } catch {
            return { url: result.url, storageKey: "", bytes: 0, mimeType: result.mimeType || "video/mp4" };
        }
    }
    throw new Error("视频接口没有返回可播放的视频");
}

async function createOpenAIVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], options?: RequestOptions): Promise<VideoGenerationTask> {
    const body = new FormData();
    body.append("model", modelOptionName(model));
    body.append("prompt", prompt);
    body.append("seconds", normalizeVideoSeconds(config.videoSeconds));
    if (normalizeVideoSize(config.size)) body.append("size", normalizeVideoSize(config.size)!);
    body.append("resolution_name", normalizeVideoResolution(config.vquality));
    body.append("preset", "normal");
    const files = await Promise.all(references.slice(0, 7).map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    files.forEach((file) => body.append("input_reference[]", file));
    try {
        const created = unwrapVideoResponse((await axios.post<ApiVideoResponse>(aiApiUrl(config, "/videos"), body, { headers: aiHeaders(config), signal: options?.signal })).data);
        if (!created.id) throw new Error("视频接口没有返回任务 ID");
        return { id: created.id, provider: "openai", model };
    } catch (error) {
        throw new Error(readAxiosError(error, "视频任务创建失败"));
    }
}

async function pollOpenAIVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const video = unwrapVideoResponse((await axios.get<ApiVideoResponse>(aiApiUrl(config, `/videos/${task.id}`), { headers: aiHeaders(config), signal: options?.signal })).data);
        const url = videoResultUrl(video);
        if (url) return { status: "completed", result: await videoResultFromUrl(url, options) };
        if (video.status === "completed") {
            const content = await axios.get<Blob>(aiApiUrl(config, `/videos/${task.id}/content`), { headers: aiHeaders(config), responseType: "blob", signal: options?.signal });
            await assertVideoBlob(content.data);
            return { status: "completed", result: { blob: content.data } };
        }
        if (video.status === "failed" || video.status === "cancelled") return { status: "failed", error: readApiErrorMessage(video.error?.message) || "视频生成失败" };
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, "视频任务查询失败"));
    }
}

async function createGrokVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], options?: RequestOptions): Promise<VideoGenerationTask> {
    const protocol: GrokVideoProtocol = isOfficialXaiBaseUrl(config.baseUrl) ? "xai-native" : "newapi-video";
    const sourceReferences = references.slice(0, GROK_VIDEO_REFERENCE_LIMITS.images);
    const referenceUrls = await prepareGrokReferenceUrls(sourceReferences);
    try {
        const commonPayload = {
            model: modelOptionName(model),
            prompt,
            duration: config.videoSeconds,
            ratio: config.size,
            resolution: config.vquality,
            referenceUrls,
        };
        const response =
            protocol === "xai-native"
                ? await axios.post<ApiEnvelope<GrokVideoCreateResponse>>(grokApiUrl(config, "/videos/generations"), buildGrokVideoPayload(commonPayload), { headers: aiHeaders(config, "application/json"), signal: options?.signal })
                : await axios.post<ApiEnvelope<GrokVideoCreateResponse>>(aiApiUrl(config, "/video/generations"), buildNewApiGrokVideoPayload(commonPayload), { headers: aiHeaders(config, "application/json"), signal: options?.signal });
        if (protocol === "xai-native") assertOfficialXaiProxyResponse(response, config);
        const created = unwrapEnvelope(response.data, "Grok 接口没有返回视频任务");
        const id = grokVideoRequestId(created);
        if (!id) throw new Error(protocol === "xai-native" ? "Grok 接口没有返回 request_id" : "New API 接口没有返回 task_id");
        return { id, provider: "grok", model, protocol };
    } catch (error) {
        throw new Error(readGrokAxiosError(error, config, protocol, "Grok 视频任务创建失败"));
    }
}

async function pollGrokVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    const protocol: GrokVideoProtocol = task.protocol || (isOfficialXaiBaseUrl(config.baseUrl) ? "xai-native" : "newapi-video");
    try {
        const response =
            protocol === "xai-native"
                ? await axios.get<ApiEnvelope<GrokVideoTaskResponse>>(grokApiUrl(config, `/videos/${encodeURIComponent(task.id)}`), { headers: aiHeaders(config), signal: options?.signal })
                : await axios.get<ApiEnvelope<NewApiGrokVideoTaskResponse>>(aiApiUrl(config, `/video/generations/${encodeURIComponent(task.id)}`), { headers: aiHeaders(config), signal: options?.signal });
        if (protocol === "xai-native") assertOfficialXaiProxyResponse(response, config);
        const state = unwrapEnvelope(response.data, protocol === "xai-native" ? "Grok 接口没有返回视频任务" : "New API 接口没有返回视频任务");
        const taskState = protocol === "xai-native" ? readGrokVideoTaskState(state as GrokVideoTaskResponse) : readNewApiGrokVideoTaskState(state as NewApiGrokVideoTaskResponse);
        if (taskState.status === "done") {
            const result = await videoResultFromUrl(taskState.url, options);
            return {
                status: "completed",
                result: {
                    ...result,
                    durationSeconds: taskState.durationSeconds,
                },
            };
        }
        if (taskState.status === "failed") return taskState;
        return { status: "pending" };
    } catch (error) {
        throw new Error(readGrokAxiosError(error, config, protocol, "Grok 视频任务查询失败"));
    }
}

async function createSeedanceTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[], options?: RequestOptions): Promise<VideoGenerationTask> {
    if (audioReferences.length && !references.length && !videoReferences.length) {
        throw new Error("Seedance 参考音频不能单独使用，请同时添加参考图或参考视频");
    }
    assertSeedanceVideoReferences(videoReferences);
    assertSeedanceAudioReferences(audioReferences);
    const content = await buildSeedanceContent(config, prompt, references, videoReferences, audioReferences);
    if (!content.length) throw new Error("请输入视频提示词，或连接参考图片/视频/音频");
    const requestModel = normalizeOfficialSeedanceModel(config.baseUrl, model);
    const payload = {
        model: requestModel,
        content,
        ratio: normalizeSeedanceRatio(config.size),
        resolution: normalizeSeedanceResolution(config.vquality, requestModel),
        duration: normalizeSeedanceDuration(config.videoSeconds),
        generate_audio: boolConfig(config.videoGenerateAudio, true),
        watermark: boolConfig(config.videoWatermark, false),
    };

    try {
        const response = await axios.post<ApiEnvelope<SeedanceTask>>(seedanceApiUrl(config), payload, { headers: aiHeaders(config, "application/json"), signal: options?.signal });
        assertOfficialArkProxyResponse(response, config);
        const created = unwrapSeedanceTask(response.data);
        if (!created.id) throw new Error("Seedance 接口没有返回任务 ID");
        return { id: created.id, provider: "seedance", model };
    } catch (error) {
        throw new Error(readSeedanceAxiosError(error, config, "Seedance 任务创建失败"));
    }
}

async function pollSeedanceTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const response = await axios.get<ApiEnvelope<SeedanceTask>>(seedanceApiUrl(config, task.id), { headers: aiHeaders(config), signal: options?.signal });
        assertOfficialArkProxyResponse(response, config);
        const state = unwrapSeedanceTask(response.data);
        const url = videoResultUrl(state);
        if (url) {
            const media = await videoResultFromUrl(url, options);
            const durationSeconds = Number(state.duration);
            return {
                status: "completed",
                result: {
                    ...media,
                    resolution: state.resolution,
                    ratio: state.ratio,
                    durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : undefined,
                },
            };
        }
        if (state.status === "succeeded" || state.status === "completed") return { status: "failed", error: "Seedance 任务成功但没有返回视频 URL" };
        if (state.status === "failed" || state.status === "cancelled" || state.status === "expired") return { status: "failed", error: readApiErrorMessage(state.error?.message) || `Seedance 视频生成${state.status === "expired" ? "超时" : "失败"}` };
        return { status: "pending" };
    } catch (error) {
        throw new Error(readSeedanceAxiosError(error, config, "Seedance 任务查询失败"));
    }
}

function assertSeedanceVideoReferences(videoReferences: ReferenceVideo[]) {
    const error = seedanceVideoReferenceError(videoReferences);
    if (error) throw new Error(error);
    let total = 0;
    for (const video of videoReferences) {
        if (!video.durationMs) continue;
        if (video.durationMs < 2000 || video.durationMs > 15000) throw new Error("Seedance 参考视频单个时长需要在 2-15 秒之间");
        total += video.durationMs;
    }
    if (total > 15000) throw new Error("Seedance 参考视频总时长不能超过 15 秒");
}

function assertSeedanceAudioReferences(audioReferences: ReferenceAudio[]) {
    let total = 0;
    for (const audio of audioReferences) {
        if (!audio.durationMs) continue;
        if (audio.durationMs < 2000 || audio.durationMs > 15000) throw new Error("Seedance 参考音频单个时长需要在 2-15 秒之间");
        total += audio.durationMs;
    }
    if (total > 15000) throw new Error("Seedance 参考音频总时长不能超过 15 秒");
}

function seedanceApiUrl(config: AiConfig, taskId?: string) {
    const directUrl = buildApiUrl(officialArkVideoBaseUrl(config.baseUrl), `/contents/generations/tasks${taskId ? `/${encodeURIComponent(taskId)}` : ""}`);
    if (!isOfficialArkBaseUrl(config.baseUrl)) return directUrl;
    const url = new URL(directUrl);
    return `/api/ark${url.pathname}${url.search}`;
}

async function buildSeedanceContent(config: AiConfig, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[]) {
    const content: Array<Record<string, unknown>> = [];
    const text = buildSeedancePromptText(prompt, references, videoReferences, audioReferences);
    if (text) content.push({ type: "text", text });
    for (const image of references.slice(0, SEEDANCE_REFERENCE_LIMITS.images)) {
        content.push({ type: "image_url", image_url: { url: await resolveSeedanceImageUrl(config, image) }, role: "reference_image" });
    }
    for (const video of videoReferences.slice(0, SEEDANCE_REFERENCE_LIMITS.videos)) {
        content.push({ type: "video_url", video_url: { url: await resolveSeedanceVideoUrl(config, video) }, role: "reference_video" });
    }
    for (const audio of audioReferences.slice(0, SEEDANCE_REFERENCE_LIMITS.audios)) {
        content.push({ type: "audio_url", audio_url: { url: await resolveSeedanceAudioUrl(config, audio) }, role: "reference_audio" });
    }
    return content;
}

async function resolveSeedanceImageUrl(config: AiConfig, image: ReferenceImage) {
    const directUrl = image.url || image.dataUrl;
    if (isPublicMediaUrl(directUrl) || directUrl.startsWith("asset://")) return directUrl;
    const dataUrl = await imageToDataUrl(image);
    if (!dataUrl) throw new Error("参考图读取失败，请换一张图片或重新上传");
    return dataUrl;
}

async function resolveGrokImageUrl(image: ReferenceImage) {
    const directUrl = image.url || image.dataUrl;
    if (/^https?:\/\//i.test(directUrl) || directUrl.startsWith("data:")) return directUrl;
    const dataUrl = await imageToDataUrl(image);
    if (!dataUrl) throw new Error("Grok 参考图读取失败，请换一张图片或重新上传");
    return dataUrl;
}

async function prepareGrokReferenceUrls(references: ReferenceImage[]) {
    const sourceUrls = await Promise.all(references.map(resolveGrokImageUrl));
    const localImageCount = sourceUrls.filter((url) => url.startsWith("data:")).length;
    if (!localImageCount) return sourceUrls;
    const perImageBudget = Math.floor(GROK_PROXY_LOCAL_IMAGE_BUDGET_BYTES / localImageCount);
    const urls = await Promise.all(sourceUrls.map((url) => (url.startsWith("data:") ? compressGrokReferenceDataUrl(url, perImageBudget) : url)));
    const totalBytes = urls.reduce((total, url) => total + (url.startsWith("data:") ? dataUrlByteSize(url) : 0), 0);
    if (totalBytes > GROK_PROXY_LOCAL_IMAGE_BUDGET_BYTES) throw new Error("Grok 本地参考图请求体仍然过大，请压缩图片或改用上游可访问的公网图片 URL");
    return urls;
}

async function compressGrokReferenceDataUrl(dataUrl: string, maximumBytes: number) {
    if (dataUrlByteSize(dataUrl) <= maximumBytes) return dataUrl;
    if (typeof document === "undefined" || typeof Image === "undefined") throw new Error("Grok 参考图过大且当前环境无法压缩，请改用公网图片 URL");

    const image = await loadDataUrlImage(dataUrl);
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const byteScale = Math.min(1, Math.sqrt(maximumBytes / Math.max(1, dataUrlByteSize(dataUrl))) * 0.94);
    let scale = Math.min(byteScale, 2048 / Math.max(1, longestSide));
    for (let attempt = 0; attempt < 12; attempt += 1) {
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Grok 参考图压缩失败，请换一张图片或使用公网图片 URL");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        const quality = Math.max(0.5, 0.86 - (attempt % 4) * 0.12);
        const blob = await canvasToBlob(canvas, "image/jpeg", quality);
        if (blob.size <= maximumBytes) return blobToDataUrl(blob);
        if (attempt % 4 === 3) scale *= 0.78;
    }
    throw new Error("Grok 参考图压缩后仍超过代理限制，请先压缩图片或改用公网图片 URL");
}

function loadDataUrlImage(dataUrl: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Grok 参考图读取失败，请换一张图片或使用公网图片 URL"));
        image.src = dataUrl;
    });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Grok 参考图压缩失败，请换一张图片或使用公网图片 URL"))), type, quality);
    });
}

function dataUrlByteSize(dataUrl: string) {
    const commaIndex = dataUrl.indexOf(",");
    if (commaIndex < 0) return new TextEncoder().encode(dataUrl).byteLength;
    const metadata = dataUrl.slice(0, commaIndex);
    const content = dataUrl.slice(commaIndex + 1);
    if (/;base64/i.test(metadata)) {
        const padding = content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0;
        return Math.max(0, Math.floor((content.length * 3) / 4) - padding);
    }
    return new TextEncoder().encode(dataUrl).byteLength;
}

async function resolveSeedanceVideoUrl(config: AiConfig, video: ReferenceVideo) {
    if (isPublicMediaUrl(video.url) || video.url.startsWith("asset://")) return video.url;
    if (isOfficialArkBaseUrl(config.baseUrl)) throw new Error("官方 Ark 的参考视频必须使用公网 URL 或 asset:// 素材 ID");
    let blob: Blob | null = null;
    if (video.storageKey) blob = await getMediaBlob(video.storageKey);
    if (!blob && video.url?.startsWith("blob:")) blob = await (await fetch(video.url)).blob();
    if (!blob) throw new Error("参考视频必须是公网 URL、素材 ID，或本地已保存的视频");
    return blobToDataUrl(blob);
}

async function resolveSeedanceAudioUrl(config: AiConfig, audio: ReferenceAudio) {
    if (isPublicMediaUrl(audio.url) || audio.url.startsWith("asset://")) return audio.url;
    if (isOfficialArkBaseUrl(config.baseUrl)) throw new Error("官方 Ark 的参考音频必须使用公网 URL 或 asset:// 素材 ID");
    let blob: Blob | null = null;
    if (audio.storageKey) blob = await getMediaBlob(audio.storageKey);
    if (!blob && audio.url?.startsWith("blob:")) blob = await (await fetch(audio.url)).blob();
    if (!blob) throw new Error("参考音频必须是公网 URL、素材 ID，或本地已保存的音频");
    return blobToDataUrl(blob);
}

async function videoResultFromUrl(url: string, options?: RequestOptions): Promise<VideoGenerationResult> {
    try {
        const response = await axios.get<Blob>(url, { responseType: "blob", signal: options?.signal });
        await assertVideoBlob(response.data);
        return { blob: response.data };
    } catch (error) {
        if (axios.isCancel(error) || options?.signal?.aborted) throw error;
        return { url, mimeType: "video/mp4" };
    }
}

function assertVideoConfig(config: AiConfig, model: string) {
    if (!model) throw new Error("请先配置视频模型");
    if (!config.baseUrl.trim()) throw new Error("请先配置 Base URL");
    if (!config.apiKey.trim()) throw new Error("请先配置 API Key");
    if (config.apiFormat === "gemini") throw new Error("Gemini 调用格式暂不支持视频生成，请使用 OpenAI 格式渠道");
}

function normalizeVideoSeconds(value: string) {
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(1, Math.min(20, seconds)));
}

function normalizeVideoSize(value: string) {
    if (value === "auto") return null;
    const size = value || "1280x720";
    if (/^\d+x\d+$/.test(size)) return size;
    return ["9:16", "2:3", "3:4"].includes(size) ? "720x1280" : "1280x720";
}

function normalizeVideoResolution(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = value.replace(/p$/i, "") || "720";
    return `${resolution}p`;
}

function unwrapVideoResponse(payload: ApiVideoResponse) {
    return unwrapEnvelope(payload, "接口没有返回视频任务");
}

function unwrapSeedanceTask(payload: ApiEnvelope<SeedanceTask>) {
    return unwrapEnvelope(payload, "Seedance 接口没有返回任务");
}

function unwrapEnvelope<T>(payload: ApiEnvelope<T>, emptyMessage: string): T {
    if (!payload) throw new Error(emptyMessage);
    if (typeof payload === "object" && "code" in payload && payload.code !== undefined) {
        const code = String(payload.code).trim().toLowerCase();
        if (!["0", "200", "success", "ok"].includes(code)) throw new Error(readApiErrorMessage(payload) || "请求失败");
        if (!payload.data) throw new Error(emptyMessage);
        return payload.data;
    }
    return payload as T;
}

function videoResultUrl(payload: VideoResponse | SeedanceTask) {
    return [payload.video_url, payload.result_url, payload.url, payload.content?.video_url, payload.content?.url].find((url) => typeof url === "string" && (isPublicMediaUrl(url) || /\.mp4(\?|#|$)/i.test(url)));
}

function readApiErrorMessage(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") {
        try {
            return readApiErrorMessage(JSON.parse(value)) || value;
        } catch {
            return value;
        }
    }
    if (typeof value !== "object") return "";
    const payload = value as { msg?: unknown; message?: unknown; error?: { message?: unknown } };
    return readApiErrorMessage(payload.msg) || readApiErrorMessage(payload.message) || readApiErrorMessage(payload.error?.message);
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return "请求已取消";
    if (axios.isAxiosError<{ error?: { message?: string }; msg?: string; message?: string; code?: number | string }>(error)) {
        const responseData = error.response?.data;
        return readApiErrorMessage(responseData) || statusMessage(error.response?.status, fallback);
    }
    if (error instanceof DOMException && error.name === "AbortError") return "请求已取消";
    return error instanceof Error ? readApiErrorMessage(error.message) || error.message : fallback;
}

function readSeedanceAxiosError(error: unknown, config: AiConfig, fallback: string) {
    if (isOfficialArkBaseUrl(config.baseUrl) && axios.isAxiosError(error) && isLikelyMissingArkProxy(error.response)) {
        return "当前部署未启用 Ark 同源代理，请使用新版 Vercel 或 Docker 配置重新部署";
    }
    return readAxiosError(error, fallback);
}

function readGrokAxiosError(error: unknown, config: AiConfig, protocol: GrokVideoProtocol, fallback: string) {
    if (protocol === "newapi-video" && axios.isAxiosError(error)) {
        const status = error.response?.status;
        const detail = readApiErrorMessage(error.response?.data);
        if (/invalid api platform|invalid_api_platform/i.test(detail)) {
            return "New API 已收到请求，但当前中转服务端没有为该 Grok 模型接入视频任务适配器；模型出现在列表中不代表视频协议已开通，请在中转后台启用支持 Grok 视频的渠道";
        }
        if ((status === 404 || status === 405) && (!detail || /not found|method not allowed/i.test(detail))) {
            return "当前 New API 中转未开放标准视频接口 /v1/video/generations，请升级中转服务端或启用视频任务路由";
        }
    }
    return readAxiosError(error, fallback);
}

function assertOfficialArkProxyResponse(response: AxiosResponse<unknown>, config: AiConfig) {
    if (isOfficialArkBaseUrl(config.baseUrl) && isLikelyMissingArkProxy(response)) {
        throw new Error("当前部署未启用 Ark 同源代理，请使用新版 Vercel 或 Docker 配置重新部署");
    }
}

function assertOfficialXaiProxyResponse(response: AxiosResponse<unknown>, config: AiConfig) {
    if (!isOfficialXaiBaseUrl(config.baseUrl)) return;
    if (String(response.headers?.["x-sun-canvas-xai-proxy"] || "") !== "1") {
        throw new Error("当前部署未启用 xAI 同源代理，请使用新版 Vercel 或 Docker 配置重新部署");
    }
}

function isLikelyMissingArkProxy(response: AxiosResponse<unknown> | undefined) {
    if (!response) return false;
    const contentType = String(response.headers?.["content-type"] || "").toLowerCase();
    const text = typeof response.data === "string" ? response.data.trimStart().toLowerCase() : "";
    if (contentType.includes("text/html") || text.startsWith("<!doctype html") || text.startsWith("<html")) return true;
    const proxyHeader = String(response.headers?.["x-sun-canvas-ark-proxy"] || "");
    return !proxyHeader && (response.status === 404 || response.status === 405) && !response.data;
}

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return "鉴权失败，请检查 API Key、套餐权限或模型权限";
    if (status === 413) return "参考素材请求体过大，请改用公网 URL 或 asset:// 素材 ID";
    if (status === 429) return "请求被限流或额度不足，请稍后重试";
    return status ? `${fallback}（${status}）` : fallback;
}

async function assertVideoBlob(blob: Blob) {
    if (!blob.type.includes("json")) return;
    let payload: { code?: number; msg?: string; error?: { message?: string } };
    try {
        payload = JSON.parse(await blob.text()) as { code?: number; msg?: string; error?: { message?: string } };
    } catch {
        return;
    }
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(readApiErrorMessage(payload) || "视频下载失败");
    if (payload.error?.message) throw new Error(readApiErrorMessage(payload.error.message) || payload.error.message);
}

function isPublicMediaUrl(value: string) {
    return /^https?:\/\//i.test(value || "");
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
        );
    });
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取本地素材失败"));
        reader.readAsDataURL(blob);
    });
}
