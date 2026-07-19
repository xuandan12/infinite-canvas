import localforage from "localforage";

export type StoredGenerationLog = Record<string, unknown> & { id?: string };

const imageLogStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });
const videoLogStore = localforage.createInstance({ name: "infinite-canvas", storeName: "video_generation_logs" });

export async function readGenerationLogReferences() {
    const [imageLogs, videoLogs] = await Promise.all([readStoredLogs(imageLogStore), readStoredLogs(videoLogStore)]);
    return { imageLogs, videoLogs };
}

async function readStoredLogs(store: typeof imageLogStore) {
    const logs: StoredGenerationLog[] = [];
    await store.iterate<StoredGenerationLog, void>((value) => {
        if (value && typeof value === "object") logs.push(value);
    });
    return logs;
}
