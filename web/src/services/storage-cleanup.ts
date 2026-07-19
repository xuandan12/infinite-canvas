import { cleanupUnusedMedia } from "@/services/file-storage";
import { readGenerationLogReferences } from "@/services/generation-log-storage";
import { cleanupUnusedImages } from "@/services/image-storage";

type StorageCleanupContext = {
    assets: unknown;
    projects: unknown;
    extra?: unknown;
};

type StorageCleanupDependencies = {
    readGenerationLogs: typeof readGenerationLogReferences;
    cleanupImages: typeof cleanupUnusedImages;
    cleanupMedia: typeof cleanupUnusedMedia;
};

const defaultDependencies: StorageCleanupDependencies = {
    readGenerationLogs: readGenerationLogReferences,
    cleanupImages: cleanupUnusedImages,
    cleanupMedia: cleanupUnusedMedia,
};

export async function cleanupAppStorage(candidates: unknown, context: StorageCleanupContext, dependencies: StorageCleanupDependencies = defaultDependencies) {
    const generationLogs = await dependencies.readGenerationLogs();
    const usedData = { ...context, generationLogs };
    await dependencies.cleanupImages(candidates, usedData);
    await dependencies.cleanupMedia(candidates, usedData);
}
