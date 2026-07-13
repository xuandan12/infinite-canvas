import { ArrowRight, ImagePlus, Maximize2, Sparkles, Video } from "lucide-react";
import { type ComponentType, useEffect, useMemo, useState } from "react";
import { App, Button, Image } from "antd";
import { useNavigate } from "react-router-dom";

import { fetchPrompts, type Prompt } from "@/services/api/prompts";
import { cn } from "@/lib/utils";

type QuickLink = {
    label: string;
    title: string;
    description: string;
    path: string;
    icon: ComponentType<{ className?: string }>;
};

const quickLinks: QuickLink[] = [
    {
        label: "从这里开始",
        title: "新建一张画布",
        description: "把零散的参考、提示词和生成结果放进同一个创作空间。",
        path: "/canvas?mode=new",
        icon: Maximize2,
    },
    {
        label: "生成图像",
        title: "把文字变成第一版视觉",
        description: "配置自己的模型，从一段描述开始快速试出画面方向。",
        path: "/image",
        icon: ImagePlus,
    },
    {
        label: "探索动态",
        title: "让静态想法开始运动",
        description: "从文字或参考图继续生成视频，保持创作链路不中断。",
        path: "/video",
        icon: Video,
    },
];

const showcaseVisibleCount = 5;
const showcaseBackupCount = 10;
const showcaseBatchSize = 16;
const showcaseCandidateCount = 32;
let showcasePromptsPromise: Promise<Prompt[]> | null = null;

function verifyCoverImage(url: string) {
    return new Promise<boolean>((resolve) => {
        const image = new window.Image();
        const timeout = window.setTimeout(() => {
            image.src = "";
            resolve(false);
        }, 6000);
        image.onload = () => {
            window.clearTimeout(timeout);
            resolve(true);
        };
        image.onerror = () => {
            window.clearTimeout(timeout);
            resolve(false);
        };
        image.src = url;
    });
}

async function selectShowcasePrompts(items: Prompt[]) {
    const candidates = items.filter((item) => Boolean(item.coverUrl)).slice(0, showcaseCandidateCount);
    const verified: Prompt[] = [];

    for (let start = 0; start < candidates.length && verified.length < showcaseBackupCount; start += showcaseBatchSize) {
        const batch = candidates.slice(start, start + showcaseBatchSize);
        const results = await Promise.all(batch.map(async (item) => ((await verifyCoverImage(item.coverUrl)) ? item : null)));
        verified.push(...results.filter((item): item is Prompt => item !== null));
    }

    return verified.slice(0, showcaseBackupCount);
}

function loadShowcasePrompts() {
    showcasePromptsPromise ??= fetchPrompts({ pageSize: 80 })
        .then((data) => selectShowcasePrompts(data.items))
        .catch((error) => {
            showcasePromptsPromise = null;
            throw error;
        });
    return showcasePromptsPromise;
}

function CanvasPreview() {
    return (
        <div
            role="img"
            aria-label="Sun canvas 创作流程预览：灵感、提示词与生成结果通过画布连线串联"
            className="relative min-h-[400px] overflow-hidden rounded-[1.75rem] border border-[#2d281f]/10 bg-[#ded5c5] shadow-[0_32px_90px_rgba(71,53,24,0.18)] sm:min-h-[470px] lg:min-h-[520px] dark:border-white/10 dark:bg-[#25221d] dark:shadow-[0_34px_90px_rgba(0,0,0,0.38)]"
        >
            <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(rgba(80,67,47,.3)_1px,transparent_1px)] [background-size:18px_18px] opacity-45 dark:bg-[radial-gradient(rgba(255,244,220,.18)_1px,transparent_1px)]" />
            <div
                aria-hidden="true"
                className="absolute inset-x-0 top-0 flex h-12 items-center justify-between border-b border-[#2d281f]/10 bg-[#f5f0e7]/80 px-4 text-[11px] text-[#6f6556] backdrop-blur-md dark:border-white/10 dark:bg-[#191713]/85 dark:text-[#aaa08f]"
            >
                <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-[#eea829]" />
                    <span>晨光系列 / 方向探索</span>
                </div>
                <span className="font-mono tracking-[0.12em]">68%</span>
            </div>

            <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M35 30 C48 30 48 26 62 26" fill="none" stroke="#d89119" strokeWidth="0.65" strokeDasharray="2 1.4" vectorEffect="non-scaling-stroke" />
                <path d="M31 62 C43 62 50 71 62 71" fill="none" stroke="#d89119" strokeWidth="0.65" strokeDasharray="2 1.4" vectorEffect="non-scaling-stroke" />
                <circle cx="35" cy="30" r="0.9" fill="#f4ab27" />
                <circle cx="62" cy="26" r="0.9" fill="#f4ab27" />
                <circle cx="31" cy="62" r="0.9" fill="#f4ab27" />
                <circle cx="62" cy="71" r="0.9" fill="#f4ab27" />
            </svg>

            <div
                aria-hidden="true"
                className="absolute left-[6%] top-[18%] w-[35%] rounded-2xl border border-[#2d281f]/10 bg-[#f8f4ec] p-4 shadow-[0_18px_45px_rgba(64,48,24,0.13)] sm:p-5 dark:border-white/10 dark:bg-[#171511] dark:shadow-[0_20px_45px_rgba(0,0,0,0.32)]"
            >
                <div className="mb-5 flex items-center justify-between">
                    <span className="text-[10px] font-semibold tracking-[0.18em] text-[#9c7027]">灵感 01</span>
                    <Sparkles className="size-3.5 text-[#d89119]" />
                </div>
                <p className="text-sm font-medium leading-6 text-[#28231c] dark:text-[#f6f0e6]">清晨的城市植物园，玻璃与薄雾交叠。</p>
                <div className="mt-4 flex gap-1.5">
                    <span className="h-1.5 w-12 rounded-full bg-[#f0ab34]" />
                    <span className="h-1.5 w-7 rounded-full bg-[#cfc3b1] dark:bg-[#4a443a]" />
                    <span className="h-1.5 w-4 rounded-full bg-[#9d6f4a]" />
                </div>
            </div>

            <div
                aria-hidden="true"
                className="absolute bottom-[9%] left-[14%] w-[37%] rotate-[-2deg] overflow-hidden rounded-2xl border border-[#2d281f]/10 bg-[#ede5d8] shadow-[0_20px_48px_rgba(64,48,24,0.16)] dark:border-white/10 dark:bg-[#24201a] dark:shadow-[0_20px_48px_rgba(0,0,0,0.38)]"
            >
                <div className="aspect-[16/10] bg-[radial-gradient(circle_at_68%_28%,rgba(255,230,160,.92),transparent_18%),linear-gradient(145deg,#765448_0%,#c98245_42%,#e9c477_70%,#71806a_100%)]">
                    <div className="h-full w-full bg-[linear-gradient(104deg,transparent_42%,rgba(255,255,255,.16)_43%,transparent_46%)]" />
                </div>
                <div className="flex items-center justify-between px-3 py-2 text-[10px] text-[#756957] dark:text-[#bcb09e]">
                    <span>参考氛围</span>
                    <span className="font-mono">4:3</span>
                </div>
            </div>

            <div
                aria-hidden="true"
                className="absolute right-[5%] top-[16%] w-[36%] rotate-[1.5deg] overflow-hidden rounded-[1.4rem] border border-[#2d281f]/10 bg-[#f4ede1] shadow-[0_26px_60px_rgba(64,48,24,0.2)] dark:border-white/10 dark:bg-[#1a1713] dark:shadow-[0_26px_60px_rgba(0,0,0,0.42)]"
            >
                <div className="relative aspect-[4/5] overflow-hidden bg-[linear-gradient(165deg,#f1bd57_0%,#d56639_34%,#663c39_64%,#152d2a_100%)]">
                    <div className="absolute -right-[18%] top-[10%] size-[72%] rounded-full bg-[#ffd57b]/80 blur-[1px]" />
                    <div className="absolute -bottom-[8%] -left-[15%] h-[68%] w-[115%] rotate-[-9deg] rounded-[50%] bg-[#163a31]/85" />
                    <div className="absolute bottom-[16%] left-[15%] h-[46%] w-[22%] skew-x-[-8deg] rounded-t-full border-l border-white/35 bg-[#8a4638]/65" />
                    <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,.18),transparent_28%,rgba(15,23,20,.18)_72%)]" />
                </div>
                <div className="flex items-center justify-between px-3 py-2.5 text-[10px] text-[#756957] dark:text-[#bcb09e]">
                    <span>生成结果 03</span>
                    <span className="inline-flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-[#e9a42a]" />
                        已连接
                    </span>
                </div>
            </div>

            <div
                aria-hidden="true"
                className="absolute bottom-4 right-4 flex items-center gap-2 rounded-xl border border-white/55 bg-[#f8f4ec]/85 px-3 py-2 text-[10px] text-[#6f6556] shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-[#171511]/85 dark:text-[#aaa08f]"
            >
                <span className="size-1.5 animate-pulse rounded-full bg-[#e5a12b]" />3 个节点正在生长
            </div>
        </div>
    );
}

function PromptCard({ item, featured, onImageError, onOpen }: { item: Prompt; featured: boolean; onImageError: () => void; onOpen: () => void }) {
    return (
        <button
            type="button"
            onClick={onOpen}
            className={cn("group relative h-[330px] min-w-[82vw] snap-center overflow-hidden rounded-[1.4rem] bg-[#d9d0c1] text-left sm:min-w-[58vw] lg:h-auto lg:min-w-0 dark:bg-[#24211c]", featured && "lg:col-span-2 lg:row-span-2")}
        >
            <img src={item.coverUrl} alt={item.title} onError={onImageError} className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.035]" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#15110b]/90 via-[#15110b]/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-6">
                <div className="mb-3 flex flex-wrap gap-2">
                    {item.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="border border-white/25 bg-black/10 px-2 py-1 text-[10px] tracking-wide text-white/80 backdrop-blur-sm">
                            {tag}
                        </span>
                    ))}
                </div>
                <h3 className={cn("font-medium tracking-[-0.02em]", featured ? "text-xl sm:text-2xl" : "text-base")}>{item.title}</h3>
                <p className="mt-2 line-clamp-2 max-w-xl text-xs leading-5 text-white/68">{item.prompt}</p>
            </div>
        </button>
    );
}

function PromptSkeleton() {
    return (
        <div className="flex snap-x gap-4 overflow-hidden lg:grid lg:auto-rows-[190px] lg:grid-cols-4">
            {Array.from({ length: showcaseVisibleCount }).map((_, index) => (
                <div key={index} className={cn("h-[330px] min-w-[82vw] animate-pulse rounded-[1.4rem] bg-[#e5ded2] sm:min-w-[58vw] lg:h-auto lg:min-w-0 dark:bg-[#23201b]", index === 0 && "lg:col-span-2 lg:row-span-2")} />
            ))}
        </div>
    );
}

export default function IndexPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const [promptShowcase, setPromptShowcase] = useState<Prompt[]>([]);
    const [loadingPrompts, setLoadingPrompts] = useState(true);
    const [failedCoverIds, setFailedCoverIds] = useState<Set<string>>(() => new Set());
    const [previewIndex, setPreviewIndex] = useState(0);
    const [previewOpen, setPreviewOpen] = useState(false);
    const availablePrompts = useMemo(() => promptShowcase.filter((item) => !failedCoverIds.has(item.id)), [failedCoverIds, promptShowcase]);
    const visiblePrompts = useMemo(() => availablePrompts.slice(0, showcaseVisibleCount), [availablePrompts]);

    useEffect(() => {
        let active = true;
        void loadShowcasePrompts()
            .then((items) => {
                if (active) setPromptShowcase(items);
            })
            .catch((error) => {
                if (active) void message.error(error instanceof Error ? error.message : "获取提示词失败");
            })
            .finally(() => {
                if (active) setLoadingPrompts(false);
            });
        return () => {
            active = false;
        };
    }, [message]);

    const openPromptPreview = (item: Prompt) => {
        const index = visiblePrompts.findIndex((prompt) => prompt.id === item.id);
        if (index < 0) return;
        setPreviewIndex(index);
        setPreviewOpen(true);
    };

    return (
        <main id="sun-canvas-main" className="relative h-full overflow-y-auto bg-[#f7f4ed] text-[#191611] selection:bg-[#efaa2f]/30 dark:bg-[#0f0e0c] dark:text-[#f7f1e8]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[48rem] bg-[radial-gradient(circle_at_70%_14%,rgba(237,168,44,.2),transparent_29%),radial-gradient(circle_at_8%_26%,rgba(174,119,64,.08),transparent_24%)] dark:bg-[radial-gradient(circle_at_70%_14%,rgba(237,168,44,.12),transparent_30%),radial-gradient(circle_at_8%_26%,rgba(174,119,64,.07),transparent_24%)]" />
            <section className="relative mx-auto grid min-h-[calc(100dvh-3.5rem)] max-w-[90rem] items-center gap-12 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,.82fr)_minmax(31rem,1.18fr)] lg:gap-14 lg:px-12 lg:py-16 xl:gap-20">
                <div className="relative z-10 max-w-2xl">
                    <div className="mb-7 flex items-center gap-3 text-[11px] font-semibold tracking-[0.18em] text-[#8a6b35] dark:text-[#c8a768]">
                        <span className="size-2 bg-[#e9a329]" />
                        <span>SUN CANVAS / AI 创作工作台</span>
                    </div>
                    <h1 className="max-w-[11ch] text-balance text-[clamp(3.35rem,7vw,6.9rem)] font-semibold leading-[0.9] tracking-[-0.065em]">
                        把灵感铺开，<span className="text-[#d78e16]">直到它发光。</span>
                    </h1>
                    <p className="mt-8 max-w-[34rem] text-pretty text-base leading-8 text-[#6e665b] sm:text-lg dark:text-[#aaa195]">在一张不设边界的画布上生成图像、连接参考、拆解想法。Sun canvas 让每一次尝试都留在创作脉络里。</p>
                    <div className="mt-9 flex flex-wrap items-center gap-3">
                        <Button
                            type="primary"
                            size="large"
                            onClick={() => navigate("/canvas?mode=new")}
                            className="!h-12 !rounded-xl !border-[#d9911c] !bg-[#e7a12b] !px-6 !font-semibold !text-[#21180a] !shadow-none transition hover:!border-[#efb343] hover:!bg-[#efb343] active:!scale-[0.98]"
                            icon={<ArrowRight className="size-4" />}
                            iconPlacement="end"
                        >
                            开始一张新画布
                        </Button>
                        <button
                            type="button"
                            onClick={() => navigate("/canvas")}
                            className="group inline-flex h-12 items-center gap-2 px-3 text-sm font-medium text-[#3f382e] transition hover:text-[#b9740d] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d89119] dark:text-[#d8d0c4] dark:hover:text-[#efb343]"
                        >
                            查看已有画布
                            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                        </button>
                    </div>
                    <div className="mt-12 grid max-w-lg grid-cols-3 border-y border-[#2d281f]/12 py-4 dark:border-white/12">
                        {["生成", "连接", "重组"].map((item, index) => (
                            <div key={item} className={cn("px-4 first:pl-0", index > 0 && "border-l border-[#2d281f]/12 dark:border-white/12")}>
                                <span className="block font-mono text-[10px] text-[#a17834]">0{index + 1}</span>
                                <span className="mt-1 block text-sm font-medium">{item}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <CanvasPreview />
            </section>

            <section className="relative border-y border-[#2d281f]/10 bg-[#f1ece2]/72 dark:border-white/10 dark:bg-[#15130f]">
                <div className="mx-auto grid max-w-[90rem] px-5 sm:px-8 lg:grid-cols-[minmax(16rem,.58fr)_minmax(0,1.42fr)] lg:px-12">
                    <div className="py-16 lg:pr-16 lg:pt-20">
                        <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9a732e] dark:text-[#c8a768]">快速进入创作</p>
                        <h2 className="mt-5 max-w-sm text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl">不用先整理好，再开始。</h2>
                        <p className="mt-5 max-w-sm text-sm leading-7 text-[#746b5f] dark:text-[#9f9689]">选择离你此刻想法最近的入口，后面的路径可以边做边长出来。</p>
                    </div>
                    <div className="border-t border-[#2d281f]/10 lg:border-l lg:border-t-0 dark:border-white/10">
                        {quickLinks.map((item, index) => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.path}
                                    type="button"
                                    onClick={() => navigate(item.path)}
                                    className="group grid w-full grid-cols-[auto_1fr_auto] items-start gap-4 border-b border-[#2d281f]/10 px-1 py-7 text-left transition hover:bg-[#e8dfcf]/60 sm:gap-7 sm:px-7 sm:py-8 lg:px-9 dark:border-white/10 dark:hover:bg-white/[0.035]"
                                >
                                    <span className="mt-0.5 grid size-10 place-items-center rounded-xl border border-[#b98937]/25 bg-[#e9a329]/12 text-[#bb7610] transition group-hover:border-[#e9a329]/50 group-hover:bg-[#e9a329] group-hover:text-[#21180a] dark:text-[#e6ad4c]">
                                        <Icon className="size-[18px]" />
                                    </span>
                                    <span>
                                        <span className="block text-[10px] font-semibold tracking-[0.14em] text-[#9a732e] dark:text-[#b99a64]">{item.label}</span>
                                        <span className="mt-2 block text-xl font-semibold tracking-[-0.025em] sm:text-2xl">{item.title}</span>
                                        <span className="mt-2 block max-w-xl text-sm leading-6 text-[#746b5f] dark:text-[#9f9689]">{item.description}</span>
                                    </span>
                                    <span className="mt-2 grid size-9 place-items-center text-[#6f6558] transition group-hover:translate-x-1 group-hover:text-[#bd7610] dark:text-[#aaa092] dark:group-hover:text-[#e9a329]">
                                        <ArrowRight className="size-5" />
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </section>

            <section id="inspiration" aria-labelledby="inspiration-heading" className="relative mx-auto max-w-[90rem] px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
                <div className="mb-10 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
                    <div>
                        <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9a732e] dark:text-[#c8a768]">灵感图谱</p>
                        <h2 id="inspiration-heading" className="mt-4 max-w-2xl text-balance text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
                            不必每次都从空白开始。
                        </h2>
                        <p className="mt-4 max-w-2xl text-sm leading-7 text-[#746b5f] dark:text-[#9f9689]">浏览经过验证的提示词与视觉方向，把合适的片段带回你的画布继续推演。</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => navigate("/prompts")}
                        className="group inline-flex items-center gap-2 justify-self-start text-sm font-medium text-[#3f382e] transition hover:text-[#b9740d] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d89119] lg:justify-self-end dark:text-[#d8d0c4] dark:hover:text-[#efb343]"
                    >
                        浏览完整提示词库
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                    </button>
                </div>

                {loadingPrompts ? (
                    <PromptSkeleton />
                ) : visiblePrompts.length ? (
                    <div className="hide-scrollbar -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:auto-rows-[190px] lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:pb-0">
                        {visiblePrompts.map((item, index) => (
                            <PromptCard key={item.id} item={item} featured={index === 0} onImageError={() => setFailedCoverIds((current) => new Set(current).add(item.id))} onOpen={() => openPromptPreview(item)} />
                        ))}
                    </div>
                ) : (
                    <div className="flex min-h-72 flex-col items-start justify-end rounded-[1.75rem] border border-[#2d281f]/10 bg-[radial-gradient(circle_at_78%_20%,rgba(235,164,42,.28),transparent_24%),linear-gradient(135deg,#e6ddce,#f2ede5)] p-7 sm:p-10 dark:border-white/10 dark:bg-[radial-gradient(circle_at_78%_20%,rgba(235,164,42,.16),transparent_24%),linear-gradient(135deg,#1c1915,#15130f)]">
                        <Sparkles className="size-6 text-[#c37c12]" />
                        <h3 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">灵感库暂时没有连接成功</h3>
                        <p className="mt-3 max-w-lg text-sm leading-6 text-[#746b5f] dark:text-[#9f9689]">这不会影响画布使用。你可以先开始创作，稍后再回来查看开源提示词。</p>
                        <Button className="!mt-6 !rounded-lg" onClick={() => navigate("/canvas?mode=new")}>
                            先去新建画布
                        </Button>
                    </div>
                )}
            </section>

            <footer className="border-t border-[#2d281f]/10 px-5 dark:border-white/10">
                <div className="mx-auto flex max-w-[90rem] flex-col gap-4 py-8 text-xs text-[#7e7467] sm:flex-row sm:items-center sm:justify-between sm:px-3 dark:text-[#938a7d]">
                    <div className="flex items-center gap-2.5">
                        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="size-5 rounded object-cover" />
                        <span className="font-semibold tracking-[-0.01em] text-[#3b342b] dark:text-[#ded5c8]">Sun canvas</span>
                        <span>让每个想法都有继续生长的空间。</span>
                    </div>
                    <span className="font-medium text-[#5f564a] dark:text-[#b1a797]">© 2026 Sun canvas</span>
                </div>
            </footer>

            <Image.PreviewGroup
                preview={{
                    open: previewOpen,
                    current: previewIndex,
                    onOpenChange: setPreviewOpen,
                    onChange: setPreviewIndex,
                }}
            >
                <div className="hidden">
                    {visiblePrompts.map((item) => (
                        <Image key={item.id} src={item.coverUrl} alt={item.title} />
                    ))}
                </div>
            </Image.PreviewGroup>
        </main>
    );
}
