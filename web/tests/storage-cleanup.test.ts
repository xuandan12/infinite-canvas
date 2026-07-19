import { describe, expect, test } from "bun:test";

import { collectMediaStorageKeys } from "../src/services/file-storage";
import { collectImageStorageKeys } from "../src/services/image-storage";
import { cleanupAppStorage } from "../src/services/storage-cleanup";

describe("application storage cleanup", () => {
    test("protects image and video generation history while pruning only supplied candidates", async () => {
        const candidates = {
            removedAsset: { storageKey: "image:removed-asset" },
            removedVideo: { storageKey: "video:removed-video" },
        };
        const imageLogs = [{ images: [{ storageKey: "image:generated-result" }], references: [{ storageKey: "image:generated-reference" }] }];
        const videoLogs = [{ video: { storageKey: "video:generated-result" }, references: [{ storageKey: "image:video-reference" }] }];
        let imageCandidateKeys = new Set<string>();
        let imageUsedKeys = new Set<string>();
        let mediaCandidateKeys = new Set<string>();
        let mediaUsedKeys = new Set<string>();

        await cleanupAppStorage(
            candidates,
            {
                assets: [{ data: { storageKey: "image:asset" } }],
                projects: [{ nodes: [{ metadata: { storageKey: "video:canvas" } }] }],
            },
            {
                readGenerationLogs: async () => ({ imageLogs, videoLogs }),
                cleanupImages: async (candidateData, usedData) => {
                    imageCandidateKeys = collectImageStorageKeys(candidateData);
                    imageUsedKeys = collectImageStorageKeys(usedData);
                },
                cleanupMedia: async (candidateData, usedData) => {
                    mediaCandidateKeys = collectMediaStorageKeys(candidateData);
                    mediaUsedKeys = collectMediaStorageKeys(usedData);
                },
            },
        );

        expect([...imageCandidateKeys]).toEqual(["image:removed-asset"]);
        expect(imageUsedKeys).toEqual(new Set(["image:asset", "image:generated-result", "image:generated-reference", "image:video-reference"]));
        expect(mediaCandidateKeys).toEqual(new Set(["video:removed-video"]));
        expect(mediaUsedKeys).toEqual(new Set(["video:canvas", "video:generated-result"]));
    });

    test("does not delete anything when generation logs cannot be read", async () => {
        let cleanupCalls = 0;

        await expect(
            cleanupAppStorage(
                { storageKey: "image:candidate" },
                { assets: [], projects: [] },
                {
                    readGenerationLogs: async () => {
                        throw new Error("IndexedDB unavailable");
                    },
                    cleanupImages: async () => {
                        cleanupCalls += 1;
                    },
                    cleanupMedia: async () => {
                        cleanupCalls += 1;
                    },
                },
            ),
        ).rejects.toThrow("IndexedDB unavailable");
        expect(cleanupCalls).toBe(0);
    });
});
