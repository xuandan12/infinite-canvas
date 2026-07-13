import { Alert, App, Button, Checkbox, ConfigProvider, Form, Input, Modal, Segmented, Steps } from "antd";
import { ArrowLeft, ArrowRight, Check, KeyRound, Link2, Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { fetchChannelModels } from "@/services/api/image";
import { createModelChannel, defaultConfig, modelMatchesCapability, useConfigStore, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";

export const SUN_API_BASE_URL = "https://newapi.proapihub.com";

const onboardingStorageKey = "sun-canvas:onboarding:sun-api:v1";
const sunApiChannelId = "sun-api";

type OnboardingStatus = "dismissed" | "completed";
type ModelFilter = "all" | ModelCapability;

const modelFilters: Array<{ label: string; value: ModelFilter }> = [
    { label: "全部", value: "all" },
    { label: "图像", value: "image" },
    { label: "视频", value: "video" },
    { label: "文本", value: "text" },
    { label: "音频", value: "audio" },
];

const capabilityLabels: Record<ModelCapability, string> = {
    image: "图像",
    video: "视频",
    text: "文本",
    audio: "音频",
};

function readOnboardingStatus(): OnboardingStatus | null {
    try {
        const value = window.localStorage.getItem(onboardingStorageKey);
        return value === "dismissed" || value === "completed" ? value : null;
    } catch {
        return null;
    }
}

function writeOnboardingStatus(status: OnboardingStatus) {
    try {
        window.localStorage.setItem(onboardingStorageKey, status);
    } catch {
        // Private browsing can block localStorage. Closing still works for this page load.
    }
}

function modelCapability(model: string): ModelCapability {
    if (modelMatchesCapability(model, "image")) return "image";
    if (modelMatchesCapability(model, "video")) return "video";
    if (modelMatchesCapability(model, "audio")) return "audio";
    return "text";
}

function connectionErrorMessage(error: unknown) {
    const value = error instanceof Error ? error.message : "读取模型失败";
    if (value.includes("鉴权失败")) return "API Key 无效或无权读取模型。请确认密钥、账户状态与模型权限。";
    if (value.includes("404")) return "未找到模型接口。请确认 Sun API 服务兼容 OpenAI /v1/models。";
    if (value.includes("429") || value.includes("限流")) return "请求过于频繁或额度不足，请稍后再试。";
    if (value.includes("超时")) return "连接超时。请稍后重试，或检查 Sun API 服务是否可用。";
    const serverStatus = value.match(/\b5\d\d\b/)?.[0];
    if (serverStatus) return `Sun API 暂时不可用（HTTP ${serverStatus}），请稍后重试。`;
    if (value === "读取模型失败") return "浏览器无法连接 Sun API。请检查网络或服务端 CORS 设置。";
    return value;
}

function isUntouchedDefaultChannel(channel: ModelChannel) {
    const defaultChannel = defaultConfig.channels[0];
    if (!defaultChannel) return false;
    return (
        channel.id === defaultChannel.id &&
        channel.name === defaultChannel.name &&
        channel.baseUrl === defaultChannel.baseUrl &&
        channel.apiKey === defaultChannel.apiKey &&
        channel.apiFormat === defaultChannel.apiFormat &&
        channel.models.length === defaultChannel.models.length &&
        channel.models.every((model) => defaultChannel.models.includes(model))
    );
}

export function SunApiOnboardingModal({ enabled }: { enabled: boolean }) {
    const { message, modal } = App.useApp();
    const config = useConfigStore((state) => state.config);
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const updateChannels = useConfigStore((state) => state.updateChannels);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const requestController = useRef<AbortController | null>(null);
    const [status, setStatus] = useState<OnboardingStatus | null>(readOnboardingStatus);
    const [autoOpenAllowed] = useState(() => !/(^|\/)config\/?$/.test(window.location.pathname));
    const [step, setStep] = useState(0);
    const [apiKey, setApiKey] = useState("");
    const [apiKeyTouched, setApiKeyTouched] = useState(false);
    const [models, setModels] = useState<string[]>([]);
    const [selectedModels, setSelectedModels] = useState<string[]>([]);
    const [modelFilter, setModelFilter] = useState<ModelFilter>("all");
    const [modelSearch, setModelSearch] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const hasReadyChannel = config.channels.some((channel) => channel.baseUrl.trim() && channel.apiKey.trim() && channel.models.length > 0);
    const open = enabled && autoOpenAllowed && status !== "dismissed" && !isConfigOpen && !hasReadyChannel;

    useEffect(
        () => () => {
            requestController.current?.abort();
        },
        [],
    );

    useEffect(() => {
        if (!enabled || status || !hasReadyChannel) return;
        writeOnboardingStatus("completed");
        setStatus("completed");
    }, [enabled, hasReadyChannel, status]);

    const filteredModels = useMemo(() => {
        const keyword = modelSearch.trim().toLowerCase();
        return models.filter((model) => (!keyword || model.toLowerCase().includes(keyword)) && (modelFilter === "all" || modelMatchesCapability(model, modelFilter)));
    }, [modelFilter, modelSearch, models]);

    const filterOptions = useMemo(
        () =>
            modelFilters.map((item) => ({
                value: item.value,
                label: `${item.label} ${item.value === "all" ? models.length : models.filter((model) => modelMatchesCapability(model, item.value as ModelCapability)).length}`,
            })),
        [models],
    );

    const finishOnboarding = (nextStatus: OnboardingStatus) => {
        requestController.current?.abort();
        requestController.current = null;
        setLoading(false);
        writeOnboardingStatus(nextStatus);
        setStatus(nextStatus);
    };

    const dismissOnboarding = () => {
        if (step === 1) {
            modal.confirm({
                title: "退出接入？",
                content: "已验证的连接信息和模型选择尚未保存。",
                okText: "退出",
                cancelText: "继续配置",
                onOk: () => finishOnboarding("dismissed"),
            });
            return;
        }
        finishOnboarding("dismissed");
    };

    const useAnotherChannel = () => {
        finishOnboarding("dismissed");
        window.setTimeout(() => openConfigDialog(false, "channels"), 180);
    };

    const connectSunApi = async () => {
        setApiKeyTouched(true);
        const normalizedApiKey = apiKey.trim();
        if (!normalizedApiKey) return;
        requestController.current?.abort();
        const controller = new AbortController();
        requestController.current = controller;
        setLoading(true);
        setError("");
        try {
            const discoveredModels = await fetchChannelModels(createModelChannel({ id: sunApiChannelId, name: "Sun API", baseUrl: SUN_API_BASE_URL, apiKey: normalizedApiKey, apiFormat: "openai", models: [] }), {
                signal: controller.signal,
                timeoutMs: 15_000,
            });
            if (controller.signal.aborted) return;
            if (!discoveredModels.length) throw new Error("连接成功，但没有读取到可用模型。请检查账户权限，或稍后重试。");
            setModels(discoveredModels);
            setSelectedModels(discoveredModels);
            setModelFilter("all");
            setModelSearch("");
            setStep(1);
        } catch (requestError) {
            if (controller.signal.aborted) return;
            setError(connectionErrorMessage(requestError));
        } finally {
            if (requestController.current === controller) {
                requestController.current = null;
                setLoading(false);
            }
        }
    };

    const completeOnboarding = () => {
        if (!selectedModels.length) {
            setError("至少选择 1 个模型。");
            return;
        }
        const sunChannel = createModelChannel({
            id: sunApiChannelId,
            name: "Sun API",
            baseUrl: SUN_API_BASE_URL,
            apiKey: apiKey.trim(),
            apiFormat: "openai",
            models: selectedModels,
        });
        const preservedChannels = config.channels.filter((channel) => channel.id !== sunApiChannelId && !isUntouchedDefaultChannel(channel));
        updateChannels([sunChannel, ...preservedChannels], sunApiChannelId);
        finishOnboarding("completed");
        void message.success(`Sun API 已接入，已启用 ${selectedModels.length} 个模型`);
    };

    const toggleModel = (model: string) => {
        setError("");
        setSelectedModels((current) => (current.includes(model) ? current.filter((item) => item !== model) : [...current, model]));
    };

    return (
        <ConfigProvider theme={{ token: { colorPrimary: "#d9911c", colorInfo: "#d9911c" } }}>
            <Modal
                title={<span className="sr-only">Sun API一键接入</span>}
                open={open}
                width={680}
                centered
                footer={null}
                destroyOnHidden
                mask={{ closable: false, blur: true }}
                onCancel={dismissOnboarding}
                styles={{ header: { marginBottom: 0 }, body: { padding: 0, maxHeight: "calc(100dvh - 80px)", overflowY: "auto" } }}
            >
                <div className="p-5 sm:p-6">
                    <div className="flex items-start gap-3 pr-9">
                        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
                        <div>
                            <h2 className="text-lg font-semibold tracking-[-0.02em] text-stone-950 dark:text-stone-50">Sun API一键接入</h2>
                            <p className="mt-1 text-sm leading-5 text-stone-600 dark:text-stone-400">用 2 步完成连接与模型选择，之后即可在画布和工作台中直接使用。</p>
                        </div>
                    </div>

                    <div className="my-6 border-y border-stone-200 py-4 dark:border-stone-800">
                        <Steps current={step} size="small" responsive={false} items={[{ title: "验证连接" }, { title: "选择模型" }]} />
                    </div>

                    {step === 0 ? (
                        <Form layout="vertical" requiredMark={false}>
                            <Form.Item label="Base URL" htmlFor="sun-api-base-url" className="mb-5">
                                <Input id="sun-api-base-url" size="large" value={SUN_API_BASE_URL} readOnly prefix={<Link2 className="size-4 text-stone-400" />} />
                            </Form.Item>
                            <Form.Item
                                label="API Key"
                                htmlFor="sun-api-key"
                                className="mb-4"
                                validateStatus={apiKeyTouched && !apiKey.trim() ? "error" : undefined}
                                help={apiKeyTouched && !apiKey.trim() ? "请输入 Sun API Key" : "粘贴你在 Sun API 控制台创建的密钥。"}
                            >
                                <Input.Password
                                    id="sun-api-key"
                                    size="large"
                                    value={apiKey}
                                    autoFocus
                                    autoComplete="off"
                                    placeholder="sk-..."
                                    prefix={<KeyRound className="size-4 text-stone-400" />}
                                    onBlur={() => setApiKeyTouched(true)}
                                    onChange={(event) => {
                                        setApiKey(event.target.value);
                                        setError("");
                                    }}
                                    onPressEnter={() => void connectSunApi()}
                                />
                            </Form.Item>

                            <div aria-live="polite">{error ? <Alert type="error" showIcon message={error} className="mb-4" /> : null}</div>

                            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <Button type="text" onClick={useAnotherChannel} className="sm:-ml-3">
                                    使用其他渠道
                                </Button>
                                <Button
                                    type="primary"
                                    size="large"
                                    loading={loading}
                                    disabled={!apiKey.trim()}
                                    icon={<ArrowRight className="size-4" />}
                                    iconPlacement="end"
                                    onClick={() => void connectSunApi()}
                                    className="!border-[#d9911c] !bg-[#e7a12b] !font-semibold !text-[#21180a] hover:!border-[#efb343] hover:!bg-[#efb343]"
                                >
                                    {loading ? "正在验证并读取模型" : "验证并获取模型"}
                                </Button>
                            </div>
                        </Form>
                    ) : (
                        <div>
                            <Alert type="success" showIcon message={`已连接 Sun API · 读取到 ${models.length} 个模型`} className="mb-5" />

                            <div className="mb-3 flex flex-col gap-3 sm:flex-row">
                                <Input aria-label="搜索可用模型" value={modelSearch} onChange={(event) => setModelSearch(event.target.value)} placeholder="搜索模型名称" prefix={<Search className="size-4 text-stone-400" />} allowClear />
                                <Segmented aria-label="按能力筛选模型" value={modelFilter} onChange={(value) => setModelFilter(value as ModelFilter)} options={filterOptions} className="shrink-0" />
                            </div>

                            <div className="mb-3 flex items-center justify-between text-xs text-stone-600 dark:text-stone-400">
                                <span>已选择 {selectedModels.length} 个模型</span>
                                <div className="flex items-center gap-1">
                                    <Button type="link" size="small" onClick={() => setSelectedModels(Array.from(new Set([...selectedModels, ...filteredModels])))}>
                                        全选当前
                                    </Button>
                                    <Button
                                        type="link"
                                        size="small"
                                        onClick={() => {
                                            setError("");
                                            setSelectedModels([]);
                                        }}
                                    >
                                        清空
                                    </Button>
                                </div>
                            </div>

                            <div role="group" aria-label="可用模型" className="max-h-72 overflow-y-auto border-y border-stone-200 dark:border-stone-800">
                                {filteredModels.length ? (
                                    filteredModels.map((model) => {
                                        const selected = selectedModels.includes(model);
                                        const capability = modelCapability(model);
                                        return (
                                            <Checkbox
                                                key={model}
                                                checked={selected}
                                                onChange={() => toggleModel(model)}
                                                className={`!flex min-h-11 w-full cursor-pointer items-center px-2 py-2.5 transition-colors hover:bg-stone-100 dark:hover:bg-stone-800/70 [&>.ant-checkbox-label]:!flex [&>.ant-checkbox-label]:min-w-0 [&>.ant-checkbox-label]:flex-1 [&>.ant-checkbox-label]:items-center [&>.ant-checkbox-label]:gap-3 ${selected ? "bg-amber-50/80 dark:bg-amber-400/10" : ""}`}
                                            >
                                                <span title={model} className="min-w-0 flex-1 truncate font-mono text-xs text-stone-900 dark:text-stone-100">
                                                    {model}
                                                </span>
                                                <span className="shrink-0 text-xs text-stone-500 dark:text-stone-400">{capabilityLabels[capability]}</span>
                                            </Checkbox>
                                        );
                                    })
                                ) : (
                                    <div className="grid min-h-32 place-items-center px-4 text-center text-sm text-stone-500 dark:text-stone-400">{modelSearch ? `没有匹配“${modelSearch}”的模型` : "当前分类暂无模型"}</div>
                                )}
                            </div>

                            <div aria-live="polite">{error ? <Alert type="error" showIcon message={error} className="mt-4" /> : null}</div>

                            <div className="mt-5 flex items-center justify-between gap-3">
                                <Button
                                    icon={<ArrowLeft className="size-4" />}
                                    onClick={() => {
                                        setError("");
                                        setStep(0);
                                    }}
                                >
                                    返回
                                </Button>
                                <Button
                                    type="primary"
                                    size="large"
                                    disabled={!selectedModels.length}
                                    icon={<Check className="size-4" />}
                                    onClick={completeOnboarding}
                                    className="!border-[#d9911c] !bg-[#e7a12b] !font-semibold !text-[#21180a] hover:!border-[#efb343] hover:!bg-[#efb343]"
                                >
                                    完成接入（{selectedModels.length}）
                                </Button>
                            </div>
                        </div>
                    )}

                    <div className="mt-5 flex items-start gap-2 border-t border-stone-200 pt-4 text-xs leading-5 text-stone-600 dark:border-stone-800 dark:text-stone-400">
                        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#c57d12] dark:text-[#e9a329]" />
                        <span>API Key 仅保存在当前浏览器，并由浏览器直接请求 Sun API；不会随画布或 WebDAV 同步。</span>
                    </div>
                </div>
            </Modal>
        </ConfigProvider>
    );
}
