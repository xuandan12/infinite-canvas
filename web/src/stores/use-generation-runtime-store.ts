import { create, type StoreApi } from "zustand";

type GenerationRuntimeStore = {
    imageLogRevision: number;
    videoLogRevision: number;
    logSyncActive: boolean;
    storageCleanupActive: boolean;
    activeImageLogIds: Set<string>;
    activeVideoLogIds: Set<string>;
    notifyImageLogs: () => void;
    notifyVideoLogs: () => void;
    beginImageGeneration: (id: string) => boolean;
    finishImageGeneration: (id: string) => void;
    beginVideoGeneration: (id: string) => boolean;
    finishVideoGeneration: (id: string) => void;
    beginLogSync: () => boolean;
    finishLogSync: () => void;
    beginStorageCleanup: () => boolean;
    finishStorageCleanup: () => void;
};

export const useGenerationRuntimeStore = create<GenerationRuntimeStore>((set) => ({
    imageLogRevision: 0,
    videoLogRevision: 0,
    logSyncActive: false,
    storageCleanupActive: false,
    activeImageLogIds: new Set(),
    activeVideoLogIds: new Set(),
    notifyImageLogs: () => set((state) => ({ imageLogRevision: state.imageLogRevision + 1 })),
    notifyVideoLogs: () => set((state) => ({ videoLogRevision: state.videoLogRevision + 1 })),
    beginImageGeneration: (id) => beginGeneration(set, "activeImageLogIds", id),
    finishImageGeneration: (id) => finishGeneration(set, "activeImageLogIds", id),
    beginVideoGeneration: (id) => beginGeneration(set, "activeVideoLogIds", id),
    finishVideoGeneration: (id) => finishGeneration(set, "activeVideoLogIds", id),
    beginLogSync: () => beginLogSync(set),
    finishLogSync: () =>
        set((state) => ({
            logSyncActive: false,
            imageLogRevision: state.imageLogRevision + 1,
            videoLogRevision: state.videoLogRevision + 1,
        })),
    beginStorageCleanup: () => beginStorageCleanup(set),
    finishStorageCleanup: () => set({ storageCleanupActive: false }),
}));

type ActiveKey = "activeImageLogIds" | "activeVideoLogIds";
type SetGenerationRuntimeStore = StoreApi<GenerationRuntimeStore>["setState"];

function beginGeneration(set: SetGenerationRuntimeStore, key: ActiveKey, id: string) {
    let started = false;
    set((state) => {
        if (state.logSyncActive || state.storageCleanupActive || state[key].has(id)) return state;
        started = true;
        const activeIds = new Set(state[key]);
        activeIds.add(id);
        return { [key]: activeIds };
    });
    return started;
}

function beginLogSync(set: SetGenerationRuntimeStore) {
    let started = false;
    set((state) => {
        if (state.logSyncActive || state.storageCleanupActive || state.activeImageLogIds.size || state.activeVideoLogIds.size) return state;
        started = true;
        return { logSyncActive: true };
    });
    return started;
}

function beginStorageCleanup(set: SetGenerationRuntimeStore) {
    let started = false;
    set((state) => {
        if (state.storageCleanupActive || state.logSyncActive || state.activeImageLogIds.size || state.activeVideoLogIds.size) return state;
        started = true;
        return { storageCleanupActive: true };
    });
    return started;
}

function finishGeneration(set: SetGenerationRuntimeStore, key: ActiveKey, id: string) {
    set((state) => {
        if (!state[key].has(id)) return state;
        const activeIds = new Set(state[key]);
        activeIds.delete(id);
        return { [key]: activeIds };
    });
}
