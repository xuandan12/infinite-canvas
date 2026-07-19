import { beforeEach, describe, expect, test } from "bun:test";

import { useGenerationRuntimeStore } from "../src/stores/use-generation-runtime-store";

beforeEach(() => {
    useGenerationRuntimeStore.setState({
        imageLogRevision: 0,
        videoLogRevision: 0,
        logSyncActive: false,
        storageCleanupActive: false,
        activeImageLogIds: new Set(),
        activeVideoLogIds: new Set(),
    });
});

describe("generation runtime coordination", () => {
    test("allows only one image runner for the same log", () => {
        const runtime = useGenerationRuntimeStore.getState();

        expect(runtime.beginImageGeneration("image-1")).toBe(true);
        expect(runtime.beginImageGeneration("image-1")).toBe(false);
        expect([...useGenerationRuntimeStore.getState().activeImageLogIds]).toEqual(["image-1"]);

        runtime.finishImageGeneration("image-1");
        expect(useGenerationRuntimeStore.getState().activeImageLogIds.size).toBe(0);
    });

    test("allows only one video poller for the same log", () => {
        const runtime = useGenerationRuntimeStore.getState();

        expect(runtime.beginVideoGeneration("video-1")).toBe(true);
        expect(runtime.beginVideoGeneration("video-1")).toBe(false);
        expect([...useGenerationRuntimeStore.getState().activeVideoLogIds]).toEqual(["video-1"]);

        runtime.finishVideoGeneration("video-1");
        expect(useGenerationRuntimeStore.getState().activeVideoLogIds.size).toBe(0);
    });

    test("allows different image and video logs to run concurrently and finish independently", () => {
        const runtime = useGenerationRuntimeStore.getState();

        expect(runtime.beginImageGeneration("image-1")).toBe(true);
        expect(runtime.beginImageGeneration("image-2")).toBe(true);
        expect(runtime.beginVideoGeneration("video-1")).toBe(true);
        expect(runtime.beginVideoGeneration("video-2")).toBe(true);
        expect(runtime.beginImageGeneration("image-1")).toBe(false);
        expect(runtime.beginVideoGeneration("video-1")).toBe(false);

        runtime.finishImageGeneration("image-1");
        runtime.finishVideoGeneration("video-1");
        expect([...useGenerationRuntimeStore.getState().activeImageLogIds]).toEqual(["image-2"]);
        expect([...useGenerationRuntimeStore.getState().activeVideoLogIds]).toEqual(["video-2"]);

        runtime.finishImageGeneration("missing-image");
        runtime.finishVideoGeneration("missing-video");
        expect([...useGenerationRuntimeStore.getState().activeImageLogIds]).toEqual(["image-2"]);
        expect([...useGenerationRuntimeStore.getState().activeVideoLogIds]).toEqual(["video-2"]);

        runtime.finishImageGeneration("image-2");
        runtime.finishVideoGeneration("video-2");
        expect(useGenerationRuntimeStore.getState().activeImageLogIds.size).toBe(0);
        expect(useGenerationRuntimeStore.getState().activeVideoLogIds.size).toBe(0);
    });

    test("notifies mounted image and video workbenches after storage updates", () => {
        const runtime = useGenerationRuntimeStore.getState();

        runtime.notifyImageLogs();
        runtime.notifyVideoLogs();

        expect(useGenerationRuntimeStore.getState().imageLogRevision).toBe(1);
        expect(useGenerationRuntimeStore.getState().videoLogRevision).toBe(1);
    });

    test("keeps WebDAV log writes and generation runners mutually exclusive", () => {
        const runtime = useGenerationRuntimeStore.getState();

        expect(runtime.beginLogSync()).toBe(true);
        expect(runtime.beginImageGeneration("image-during-sync")).toBe(false);
        runtime.finishLogSync();

        expect(runtime.beginVideoGeneration("video-before-sync")).toBe(true);
        expect(runtime.beginLogSync()).toBe(false);
        runtime.finishVideoGeneration("video-before-sync");
    });

    test("keeps WebDAV sync blocked until every concurrent generation finishes", () => {
        const runtime = useGenerationRuntimeStore.getState();

        expect(runtime.beginImageGeneration("image-1")).toBe(true);
        expect(runtime.beginImageGeneration("image-2")).toBe(true);
        expect(runtime.beginVideoGeneration("video-1")).toBe(true);
        expect(runtime.beginLogSync()).toBe(false);

        runtime.finishImageGeneration("image-1");
        expect(runtime.beginLogSync()).toBe(false);
        runtime.finishImageGeneration("image-2");
        expect(runtime.beginLogSync()).toBe(false);
        runtime.finishVideoGeneration("video-1");
        expect(runtime.beginLogSync()).toBe(true);
        expect(runtime.beginImageGeneration("image-during-sync")).toBe(false);
        expect(runtime.beginVideoGeneration("video-during-sync")).toBe(false);

        runtime.finishLogSync();
        expect(useGenerationRuntimeStore.getState().imageLogRevision).toBe(1);
        expect(useGenerationRuntimeStore.getState().videoLogRevision).toBe(1);
        expect(useGenerationRuntimeStore.getState().logSyncActive).toBe(false);
    });

    test("keeps storage cleanup mutually exclusive with generation and WebDAV sync", () => {
        const runtime = useGenerationRuntimeStore.getState();

        expect(runtime.beginStorageCleanup()).toBe(true);
        expect(runtime.beginImageGeneration("image-during-cleanup")).toBe(false);
        expect(runtime.beginVideoGeneration("video-during-cleanup")).toBe(false);
        expect(runtime.beginLogSync()).toBe(false);

        runtime.finishStorageCleanup();
        expect(useGenerationRuntimeStore.getState().storageCleanupActive).toBe(false);
        expect(runtime.beginImageGeneration("image-after-cleanup")).toBe(true);
        expect(runtime.beginStorageCleanup()).toBe(false);
        runtime.finishImageGeneration("image-after-cleanup");
    });
});
