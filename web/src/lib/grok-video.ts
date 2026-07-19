export const GROK_VIDEO_REFERENCE_LIMITS = {
    images: 7,
    referenceDurationSeconds: 10,
} as const;

const XAI_API_HOST = "api.x.ai";

export const grokVideoResolutionOptions = [
    { value: "480p", label: "480p" },
    { value: "720p", label: "720p" },
    { value: "1080p", label: "1080p" },
] as const;

export const grokVideoRatioOptions = [
    { value: "16:9", label: "16:9", description: "横屏" },
    { value: "9:16", label: "9:16", description: "竖屏" },
    { value: "1:1", label: "1:1", description: "方形" },
    { value: "4:3", label: "4:3", description: "标准横屏" },
    { value: "3:4", label: "3:4", description: "标准竖屏" },
    { value: "3:2", label: "3:2", description: "摄影横屏" },
    { value: "2:3", label: "2:3", description: "摄影竖屏" },
] as const;

export const grokVideoDurationOptions = [1, 5, 6, 8, 10, 12, 15] as const;

export type GrokVideoResolution = (typeof grokVideoResolutionOptions)[number]["value"];
export type GrokVideoRatio = (typeof grokVideoRatioOptions)[number]["value"];
export type GrokVideoProtocol = "xai-native" | "newapi-video";

export type GrokVideoPayload = {
    model: string;
    prompt: string;
    duration: number;
    aspect_ratio: GrokVideoRatio;
    resolution: GrokVideoResolution;
    image?: { url: string };
    reference_images?: Array<{ url: string }>;
};

export type GrokVideoCreateResponse = {
    request_id?: string;
    task_id?: string;
    id?: string;
};

export type GrokVideoTaskResponse = {
    status?: "pending" | "done" | "expired" | "failed" | string;
    video?: {
        url?: string;
        duration?: number | string;
        respect_moderation?: boolean;
    } | null;
    error?: { code?: string; message?: string } | string | null;
};

export type GrokVideoTaskState = { status: "pending" } | { status: "done"; url: string; durationSeconds?: number } | { status: "failed"; error: string };

export type NewApiGrokVideoPayload = {
    model: string;
    prompt: string;
    duration: number;
    image?: string;
    images?: string[];
    metadata: {
        aspect_ratio: GrokVideoRatio;
        resolution: GrokVideoResolution;
    };
};

export type NewApiGrokVideoTaskResponse = {
    task_id?: string;
    id?: string;
    status?: string;
    url?: string;
    video_url?: string;
    result_url?: string;
    fail_reason?: string;
    message?: string;
    video?: { url?: string; duration?: number | string } | null;
    output?: { url?: string } | null;
    data?: { url?: string; video_url?: string; result_url?: string } | null;
    metadata?: {
        duration?: number | string;
        width?: number | string;
        height?: number | string;
    } | null;
    error?: { code?: string | number; message?: string } | string | null;
};

export function isGrokVideoModel(model: string) {
    return model.trim().toLowerCase().startsWith("grok-imagine-video");
}

export function isGrokVideo15Model(model: string) {
    return model.trim().toLowerCase().startsWith("grok-imagine-video-1.5");
}

export function isOfficialXaiBaseUrl(baseUrl: string) {
    try {
        const url = new URL(baseUrl.trim());
        return url.protocol === "https:" && url.hostname.toLowerCase() === XAI_API_HOST;
    } catch {
        return false;
    }
}

export function officialXaiApiUrl(baseUrl: string, path: string) {
    if (!isOfficialXaiBaseUrl(baseUrl)) return "";
    const normalizedPath = `/${path}`.replace(/\/{2,}/g, "/");
    const versionedPath = normalizedPath === "/v1" || normalizedPath.startsWith("/v1/") ? normalizedPath : `/v1${normalizedPath}`;
    return `/api/xai${versionedPath}`;
}

export function normalizeGrokVideoDuration(value: string | number, imageReferenceCount = 0) {
    const rawValue = String(value).trim();
    const numericValue = Number(rawValue);
    const parsed = rawValue && Number.isFinite(numericValue) ? Math.floor(numericValue) : 6;
    const maximum = imageReferenceCount > 1 ? GROK_VIDEO_REFERENCE_LIMITS.referenceDurationSeconds : 15;
    return Math.max(1, Math.min(maximum, parsed));
}

export function normalizeGrokVideoRatio(value: string): GrokVideoRatio {
    const normalized = String(value || "")
        .trim()
        .toLowerCase();
    const direct = grokVideoRatioOptions.find((item) => item.value === normalized);
    if (direct) return direct.value;

    const dimensions = normalized.match(/^(\d+)x(\d+)$/);
    if (!dimensions) return "16:9";
    const width = Number(dimensions[1]);
    const height = Number(dimensions[2]);
    if (!width || !height) return "16:9";
    const ratio = width / height;
    const candidates = grokVideoRatioOptions.map((item) => {
        const [candidateWidth, candidateHeight] = item.value.split(":").map(Number);
        return { value: item.value, ratio: candidateWidth / candidateHeight };
    });
    return candidates.reduce((best, item) => (Math.abs(item.ratio - ratio) < Math.abs(best.ratio - ratio) ? item : best), candidates[0]).value;
}

export function normalizeGrokVideoResolution(value: string, model: string, hasImage: boolean): GrokVideoResolution {
    const normalized = normalizeResolutionToken(value);
    if (normalized === "1080p") {
        if (isGrokVideo15Model(model) && hasImage) return "1080p";
        return "720p";
    }
    return normalized === "480p" ? "480p" : "720p";
}

export function buildGrokVideoPayload({ model, prompt, duration, ratio, resolution, referenceUrls = [] }: { model: string; prompt: string; duration: string | number; ratio: string; resolution: string; referenceUrls?: string[] }): GrokVideoPayload {
    const normalizedModel = model.trim();
    const references = referenceUrls
        .map((url) => url.trim())
        .filter(Boolean)
        .slice(0, GROK_VIDEO_REFERENCE_LIMITS.images);
    const is15 = isGrokVideo15Model(normalizedModel);
    if (is15 && !references.length) throw new Error("grok-imagine-video-1.5 仅支持图生视频，请先添加一张参考图");
    if (is15 && references.length > 1) throw new Error("grok-imagine-video-1.5 仅支持单张参考图的图生视频，请只保留一张参考图");

    const payload: GrokVideoPayload = {
        model: normalizedModel,
        prompt,
        duration: normalizeGrokVideoDuration(duration, references.length),
        aspect_ratio: normalizeGrokVideoRatio(ratio),
        resolution: normalizeGrokVideoResolution(resolution, normalizedModel, references.length === 1),
    };
    if (references.length === 1) payload.image = { url: references[0] };
    if (references.length > 1) payload.reference_images = references.map((url) => ({ url }));
    return payload;
}

export function buildNewApiGrokVideoPayload({
    model,
    prompt,
    duration,
    ratio,
    resolution,
    referenceUrls = [],
}: {
    model: string;
    prompt: string;
    duration: string | number;
    ratio: string;
    resolution: string;
    referenceUrls?: string[];
}): NewApiGrokVideoPayload {
    const references = referenceUrls.map((url) => url.trim()).filter(Boolean);
    const payload = buildGrokVideoPayload({ model, prompt, duration, ratio, resolution, referenceUrls: references });
    return {
        model: payload.model,
        prompt: payload.prompt,
        duration: payload.duration,
        ...(payload.image?.url ? { image: payload.image.url } : {}),
        ...(payload.reference_images?.length ? { images: payload.reference_images.map((item) => item.url) } : {}),
        metadata: {
            aspect_ratio: payload.aspect_ratio,
            resolution: payload.resolution,
        },
    };
}

export function grokVideoRequestId(response: GrokVideoCreateResponse) {
    return String(response.request_id || response.task_id || response.id || "").trim();
}

export function readGrokVideoTaskState(response: GrokVideoTaskResponse): GrokVideoTaskState {
    const status = String(response.status || "pending").toLowerCase();
    if (status === "done") {
        const url = String(response.video?.url || "").trim();
        if (!url) return { status: "failed", error: "Grok 任务已完成，但没有返回 video.url" };
        const duration = Number(response.video?.duration);
        return { status: "done", url, durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : undefined };
    }
    if (status === "failed" || status === "expired") {
        const detail = typeof response.error === "string" ? response.error : response.error?.message;
        return { status: "failed", error: detail || `Grok 视频生成${status === "expired" ? "已过期" : "失败"}` };
    }
    return { status: "pending" };
}

export function readNewApiGrokVideoTaskState(response: NewApiGrokVideoTaskResponse): GrokVideoTaskState {
    const status = String(response.status || "queued")
        .trim()
        .toLowerCase();
    const url = [response.url, response.video_url, response.result_url, response.video?.url, response.output?.url, response.data?.url, response.data?.video_url, response.data?.result_url].find((value) => typeof value === "string" && value.trim())?.trim();
    const duration = Number(response.metadata?.duration ?? response.video?.duration);
    if (["completed", "succeeded", "success", "done"].includes(status) || url) {
        if (!url) return { status: "failed", error: "New API 视频任务已完成，但没有返回视频 URL" };
        return { status: "done", url, durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : undefined };
    }
    if (["failed", "failure", "error", "cancelled", "canceled", "expired"].includes(status)) {
        const detail = response.fail_reason || (typeof response.error === "string" ? response.error : response.error?.message) || response.message;
        return { status: "failed", error: detail || `New API 视频生成${status === "expired" ? "已过期" : "失败"}` };
    }
    return { status: "pending" };
}

function normalizeResolutionToken(value: string) {
    const normalized = String(value || "")
        .trim()
        .toLowerCase();
    if (normalized === "low" || normalized === "480" || normalized === "480p") return "480p";
    if (normalized === "1080" || normalized === "1080p") return "1080p";
    return "720p";
}
