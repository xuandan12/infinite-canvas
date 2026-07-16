import assert from "node:assert/strict";

import {
    buildGrokVideoPayload,
    buildNewApiGrokVideoPayload,
    grokVideoRequestId,
    isGrokVideo15Model,
    isGrokVideoModel,
    isOfficialXaiBaseUrl,
    normalizeGrokVideoDuration,
    normalizeGrokVideoRatio,
    normalizeGrokVideoResolution,
    officialXaiApiUrl,
    readGrokVideoTaskState,
    readNewApiGrokVideoTaskState,
} from "../src/lib/grok-video";
import xaiProxy from "../api/_xai-proxy";

assert.equal(isGrokVideoModel("grok-imagine-video"), true);
assert.equal(isGrokVideoModel("grok-imagine-video-1.5-preview"), true);
assert.equal(isGrokVideoModel("grok-imagine-image"), false);
assert.equal(isGrokVideo15Model("grok-imagine-video-1.5"), true);
assert.equal(isGrokVideo15Model("grok-imagine-video"), false);

assert.equal(isOfficialXaiBaseUrl("https://api.x.ai"), true);
assert.equal(isOfficialXaiBaseUrl("https://api.x.ai/v1/"), true);
assert.equal(isOfficialXaiBaseUrl("https://newapi.proapihub.com"), false);
assert.equal(officialXaiApiUrl("https://api.x.ai/v1", "/videos/generations"), "/api/xai/v1/videos/generations");
assert.equal(officialXaiApiUrl("https://newapi.proapihub.com", "/videos/generations"), "");

assert.equal(normalizeGrokVideoDuration(""), 6);
assert.equal(normalizeGrokVideoDuration("0"), 1);
assert.equal(normalizeGrokVideoDuration("20"), 15);
assert.equal(normalizeGrokVideoDuration("12", 1), 12);
assert.equal(normalizeGrokVideoDuration("12", 2), 10);
assert.equal(normalizeGrokVideoDuration("5", 7), 5);

assert.equal(normalizeGrokVideoRatio("16:9"), "16:9");
assert.equal(normalizeGrokVideoRatio("720x1280"), "9:16");
assert.equal(normalizeGrokVideoRatio("1500x1000"), "3:2");
assert.equal(normalizeGrokVideoRatio("auto"), "16:9");

assert.equal(normalizeGrokVideoResolution("480", "grok-imagine-video", false), "480p");
assert.equal(normalizeGrokVideoResolution("720p", "grok-imagine-video", false), "720p");
assert.equal(normalizeGrokVideoResolution("1080p", "grok-imagine-video", true), "720p");
assert.equal(normalizeGrokVideoResolution("1080p", "grok-imagine-video-1.5", true), "1080p");

const textPayload = buildGrokVideoPayload({
    model: "grok-imagine-video",
    prompt: "A sunrise over a lake",
    duration: 20,
    ratio: "1280x720",
    resolution: "480",
});
assert.deepEqual(textPayload, {
    model: "grok-imagine-video",
    prompt: "A sunrise over a lake",
    duration: 15,
    aspect_ratio: "16:9",
    resolution: "480p",
});

const imagePayload = buildGrokVideoPayload({
    model: "grok-imagine-video",
    prompt: "Slow push in",
    duration: 15,
    ratio: "9:16",
    resolution: "720p",
    referenceUrls: ["data:image/png;base64,abc"],
});
assert.equal(imagePayload.duration, 15);
assert.deepEqual(imagePayload.image, { url: "data:image/png;base64,abc" });
assert.equal(imagePayload.reference_images, undefined);

const referencePayload = buildGrokVideoPayload({
    model: "grok-imagine-video",
    prompt: "Use the references",
    duration: 12,
    ratio: "1:1",
    resolution: "720p",
    referenceUrls: Array.from({ length: 9 }, (_, index) => `https://example.com/${index}.png`),
});
assert.equal(referencePayload.duration, 10);
assert.equal(referencePayload.image, undefined);
assert.equal(referencePayload.reference_images?.length, 7);

assert.throws(() => buildGrokVideoPayload({ model: "grok-imagine-video-1.5", prompt: "Animate", duration: 5, ratio: "16:9", resolution: "720p" }), /仅支持图生视频/);
assert.throws(
    () =>
        buildGrokVideoPayload({
            model: "grok-imagine-video-1.5",
            prompt: "Animate",
            duration: 5,
            ratio: "16:9",
            resolution: "720p",
            referenceUrls: ["https://example.com/1.png", "https://example.com/2.png"],
        }),
    /仅支持单张参考图/,
);
const grok15Payload = buildGrokVideoPayload({
    model: "grok-imagine-video-1.5",
    prompt: "Animate",
    duration: 12,
    ratio: "16:9",
    resolution: "1080p",
    referenceUrls: ["https://example.com/start.png"],
});
assert.equal(grok15Payload.resolution, "1080p");
assert.equal(grok15Payload.duration, 12);

const newApiPayload = buildNewApiGrokVideoPayload({
    model: "grok-imagine-video",
    prompt: "Animate through New API",
    duration: 5,
    ratio: "9:16",
    resolution: "720p",
    referenceUrls: ["data:image/png;base64,abc"],
});
assert.deepEqual(newApiPayload, {
    model: "grok-imagine-video",
    prompt: "Animate through New API",
    duration: 5,
    image: "data:image/png;base64,abc",
    metadata: {
        aspect_ratio: "9:16",
        resolution: "720p",
    },
});
assert.deepEqual(
    buildNewApiGrokVideoPayload({
        model: "grok-imagine-video",
        prompt: "Two references",
        duration: 5,
        ratio: "16:9",
        resolution: "720p",
        referenceUrls: ["https://example.com/1.png", "https://example.com/2.png"],
    }),
    {
        model: "grok-imagine-video",
        prompt: "Two references",
        duration: 5,
        images: ["https://example.com/1.png", "https://example.com/2.png"],
        metadata: {
            aspect_ratio: "16:9",
            resolution: "720p",
        },
    },
);

assert.equal(grokVideoRequestId({ request_id: " request-1 " }), "request-1");
assert.equal(grokVideoRequestId({ task_id: " newapi-task " }), "newapi-task");
assert.equal(grokVideoRequestId({ id: "legacy-id" }), "legacy-id");
assert.equal(grokVideoRequestId({}), "");

assert.deepEqual(readGrokVideoTaskState({ status: "pending" }), { status: "pending" });
assert.deepEqual(readGrokVideoTaskState({ status: "done", video: { url: "https://example.com/video.mp4", duration: 8 } }), {
    status: "done",
    url: "https://example.com/video.mp4",
    durationSeconds: 8,
});
assert.deepEqual(readGrokVideoTaskState({ status: "done", video: null }), { status: "failed", error: "Grok 任务已完成，但没有返回 video.url" });
assert.deepEqual(readGrokVideoTaskState({ status: "failed", error: { message: "render failed" } }), { status: "failed", error: "render failed" });
assert.deepEqual(readGrokVideoTaskState({ status: "expired" }), { status: "failed", error: "Grok 视频生成已过期" });

assert.deepEqual(readNewApiGrokVideoTaskState({ status: "QUEUED" }), { status: "pending" });
assert.deepEqual(readNewApiGrokVideoTaskState({ status: "IN_PROGRESS" }), { status: "pending" });
assert.deepEqual(readNewApiGrokVideoTaskState({ status: "SUCCESS", result_url: "https://example.com/newapi.mp4", metadata: { duration: "5" } }), {
    status: "done",
    url: "https://example.com/newapi.mp4",
    durationSeconds: 5,
});
assert.deepEqual(readNewApiGrokVideoTaskState({ status: "completed", data: { url: "https://example.com/nested.mp4" } }), {
    status: "done",
    url: "https://example.com/nested.mp4",
    durationSeconds: undefined,
});
assert.deepEqual(readNewApiGrokVideoTaskState({ status: "FAILURE", fail_reason: "upstream rejected" }), { status: "failed", error: "upstream rejected" });

const missingProxyRoute = await xaiProxy.fetch(new Request("http://localhost/api/xai/not-allowed"));
assert.equal(missingProxyRoute.status, 404);
assert.equal(missingProxyRoute.headers.get("x-sun-canvas-xai-proxy"), "1");

const invalidCreateMethod = await xaiProxy.fetch(new Request("http://localhost/api/xai/v1/videos/generations"));
assert.equal(invalidCreateMethod.status, 405);
assert.equal(invalidCreateMethod.headers.get("allow"), "POST");

const invalidTaskMethod = await xaiProxy.fetch(new Request("http://localhost/api/xai/v1/videos/request-123", { method: "POST" }));
assert.equal(invalidTaskMethod.status, 405);
assert.equal(invalidTaskMethod.headers.get("allow"), "GET");

console.log("grok video tests passed");
