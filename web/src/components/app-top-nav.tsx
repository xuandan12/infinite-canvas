"use client";

import { LogOut, Menu, Settings2, Shield } from "lucide-react";
import Link from "next/link";
import { App, Button, Drawer, Form, Input, Modal } from "antd";

import { useConfigDialogStore } from "@/stores/use-config-dialog-store";
import { ModelPicker } from "@/components/model-picker";
import { GitHubLink } from "@/components/github-link";
import { UserStatusActions } from "@/components/user-status-actions";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { VersionReleaseModal } from "@/components/version-release-modal";
import type { AiConfig } from "@/lib/ai-config";
import { navigationTools, type NavigationToolSlug } from "@/lib/navigation-tools";
import { fetchImageModels } from "@/services/api/image";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { cn } from "@/lib/utils";
import { useState } from "react";

type AppTopNavProps = {
  activeToolSlug?: NavigationToolSlug;
  config: AiConfig;
  onConfigChange: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
  hideHeader?: boolean;
};

export function AppTopNav({ activeToolSlug, config, onConfigChange, hideHeader = false }: AppTopNavProps) {
  const { message } = App.useApp();
  const [loadingModels, setLoadingModels] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "dev";
  const isConfigOpen = useConfigDialogStore((state) => state.isOpen);
  const shouldPromptContinue = useConfigDialogStore((state) => state.shouldPromptContinue);
  const openConfigDialog = useConfigDialogStore((state) => state.openConfigDialog);
  const setConfigDialogOpen = useConfigDialogStore((state) => state.setConfigDialogOpen);
  const clearPromptContinue = useConfigDialogStore((state) => state.clearPromptContinue);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const user = useUserStore((state) => state.user);
  const isReady = useUserStore((state) => state.isReady);
  const logout = useUserStore((state) => state.clearSession);

  const finishConfig = () => {
    setConfigDialogOpen(false);
    if (!config.baseUrl.trim() || !config.imageModel.trim() || !config.textModel.trim() || !config.apiKey.trim()) return;
    if (shouldPromptContinue) {
      message.success("配置已保存，请继续刚才的请求");
    } else {
      message.success("配置已保存");
    }
    clearPromptContinue();
  };
  const refreshModels = async () => {
    if (!config.baseUrl.trim() || !config.apiKey.trim()) {
      message.error("请先填写 Base URL 和 API Key");
      return;
    }
    setLoadingModels(true);
    try {
      const models = await fetchImageModels(config);
      onConfigChange("models", models);
      if (models.length && !models.includes(config.imageModel)) onConfigChange("imageModel", models[0]);
      if (models.length && !models.includes(config.textModel)) onConfigChange("textModel", models[0]);
      message.success("模型列表已更新");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "读取模型失败");
    } finally {
      setLoadingModels(false);
    }
  };

  return (
    <>
      {!hideHeader ? (
        <header className="sticky top-0 z-20 h-16 shrink-0 border-b border-stone-200 bg-background/90 backdrop-blur-xl dark:border-stone-800">
          <div className="mx-auto flex h-full max-w-7xl items-stretch justify-between gap-5 px-6">
            <div className="flex min-w-0 items-center">
              <Link
                href="/"
                className="flex h-full shrink-0 items-center gap-2 text-sm font-semibold leading-none tracking-tight text-stone-950 transition hover:text-stone-600 dark:text-stone-100 dark:hover:text-stone-300"
              >
                <span
                  className="size-5 shrink-0 bg-current"
                  style={{
                    mask: "url(/logo.svg) center / contain no-repeat",
                    WebkitMask: "url(/logo.svg) center / contain no-repeat",
                  }}
                />
                <span className="text-base font-medium">无限画布</span>
              </Link>

              <button
                type="button"
                className="ml-3 inline-flex size-8 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 md:hidden dark:text-stone-300 dark:hover:text-white"
                onClick={() => setMobileNavOpen(true)}
                aria-label="打开导航菜单"
                title="导航菜单"
              >
                <Menu className="size-5" />
              </button>

              <nav className="hide-scrollbar ml-8 hidden h-16 min-w-0 items-center gap-7 overflow-x-auto md:flex">
                {navigationTools.map((tool) => {
                  const Icon = tool.icon;
                  const active = tool.slug === activeToolSlug;
                  return (
                    <Link
                      key={tool.slug}
                      href={`/${tool.slug}`}
                      className={cn(
                        "relative flex h-16 shrink-0 items-center gap-2 text-sm leading-6 transition after:absolute after:inset-x-0 after:bottom-0 after:h-px",
                        active
                          ? "font-medium text-stone-950 after:bg-stone-950 dark:text-stone-100 dark:after:bg-stone-100"
                          : "text-stone-500 after:bg-transparent hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-100",
                      )}
                    >
                      <Icon className="size-4" />
                      <span className="truncate">{tool.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="my-auto flex h-9 min-w-0 items-center justify-end gap-2 justify-self-end whitespace-nowrap">
              {isReady && user ? (
                <UserStatusActions
                  version={appVersion}
                  theme={theme}
                  onThemeChange={setTheme}
                  onOpenConfig={() => openConfigDialog(false)}
                  userName={user.username}
                  menuItems={[
                    ...(user.role === "admin" ? [{ key: "admin", icon: <Shield className="size-4" />, label: <Link href="/admin">管理后台</Link> }] : []),
                    { key: "logout", icon: <LogOut className="size-4" />, label: "退出登录", onClick: logout },
                  ]}
                />
              ) : (
                <>
                  <button
                    type="button"
                    className="inline-flex size-8 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 dark:text-stone-300 dark:hover:text-white [&_svg]:size-4"
                    onClick={() => openConfigDialog(false)}
                    aria-label="配置"
                    title="配置"
                  >
                    <Settings2 className="size-4" />
                  </button>
                  <AnimatedThemeToggler
                    theme={theme}
                    onThemeChange={setTheme}
                    className="inline-flex size-8 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 dark:text-stone-300 dark:hover:text-white [&_svg]:size-4"
                    aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
                    title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
                  />
                  <VersionReleaseModal currentVersion={appVersion} />
                  <GitHubLink />
                  <Link href="/login" className="text-sm font-medium text-stone-600 underline-offset-4 transition hover:text-stone-950 hover:underline dark:text-stone-300 dark:hover:text-stone-100">
                    登录
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>
      ) : null}

      <Drawer
        title="导航"
        placement="left"
        size={280}
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        className="md:hidden"
      >
        <div className="space-y-1">
          {navigationTools.map((tool) => {
            const Icon = tool.icon;
            const active = tool.slug === activeToolSlug;
            return (
              <Link
                key={tool.slug}
                href={`/${tool.slug}`}
                onClick={() => setMobileNavOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-3 text-base transition",
                  active
                    ? "bg-stone-100 font-medium text-stone-950 dark:bg-stone-800 dark:text-stone-100"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100",
                )}
              >
                <Icon className="size-5" />
                <span>{tool.label}</span>
              </Link>
            );
          })}
        </div>
      </Drawer>

      <Modal
        title={<div><div className="text-lg font-semibold">配置</div><div className="mt-1 text-xs font-normal text-stone-500">模型和密钥</div></div>}
        open={isConfigOpen}
        width={560}
        centered
        onCancel={() => setConfigDialogOpen(false)}
        footer={<Button type="primary" size="large" onClick={finishConfig}>完成</Button>}
      >
        <div className="pt-1">
          <Form layout="vertical" requiredMark={false} size="large">
            <Form.Item label="Base URL" className="mb-4">
              <Input value={config.baseUrl} onChange={(event) => onConfigChange("baseUrl", event.target.value)} />
            </Form.Item>
            <Form.Item label="API Key" className="mb-4">
              <Input.Password value={config.apiKey} onChange={(event) => onConfigChange("apiKey", event.target.value)} />
            </Form.Item>
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
              <div className="min-w-0">
                <div className="text-sm font-medium">模型列表</div>
                <div className="mt-1 text-xs text-stone-500">当前已保存 {config.models.length} 个模型</div>
              </div>
              <Button loading={loadingModels} onClick={() => void refreshModels()}>拉取模型列表</Button>
            </div>
            <Form.Item label="默认生图模型" className="mb-4">
              <ModelPicker config={config} value={config.imageModel} onChange={(model) => onConfigChange("imageModel", model)} fullWidth />
            </Form.Item>
            <Form.Item label="默认文本模型" className="mb-0">
              <ModelPicker config={config} value={config.textModel} onChange={(model) => onConfigChange("textModel", model)} fullWidth />
            </Form.Item>
            <Form.Item label="系统提示词" className="mb-0">
              <Input.TextArea rows={4} value={config.systemPrompt} placeholder="例如：你是一位擅长电影感写实摄影的视觉导演。" onChange={(event) => onConfigChange("systemPrompt", event.target.value)} />
            </Form.Item>
          </Form>
        </div>
      </Modal>

    </>
  );
}
