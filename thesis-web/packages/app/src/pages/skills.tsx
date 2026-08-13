import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { useTheme } from "@opencode-ai/ui/theme/context"
import { useNavigate } from "@solidjs/router"
import { For, Show, createMemo } from "solid-js"
import { AGENT_COLORS, InstallSkillDialog } from "@/components/session/agent-sidebar"
import { useLanguage } from "@/context/language"
import { LocalProvider, useLocal } from "@/context/local"
import { ServerConnection, useServer } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { SDKProvider } from "@/context/sdk"
import { DirectoryDataProvider } from "@/pages/directory-layout"

export function ThesisSkillsPage() {
  const server = useServer()
  const serverSync = useServerSync()
  const directory = createMemo(() => serverSync().data.path.directory || serverSync().data.path.home || undefined)
  const serverKey = createMemo(() => (server.current ? ServerConnection.key(server.current) : undefined))

  return (
    <Show
      when={directory()}
      fallback={
        <div class="m-2 flex flex-1 items-center justify-center rounded-[10px] bg-v2-background-bg-base text-13-regular text-v2-text-text-weak">
          正在连接服务器…
        </div>
      }
    >
      {(dir) => (
        <SDKProvider directory={dir()}>
          <DirectoryDataProvider directory={dir()} server={serverKey}>
            <LocalProvider>
              <div
                class={`
                  m-2 min-h-0 flex-1 self-stretch overflow-hidden rounded-[10px]
                  bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]
                `}
              >
                <SkillsContent />
              </div>
            </LocalProvider>
          </DirectoryDataProvider>
        </SDKProvider>
      )}
    </Show>
  )
}

function SkillsContent() {
  const language = useLanguage()
  const local = useLocal()
  const dialog = useDialog()
  const theme = useTheme()
  const navigate = useNavigate()
  const agents = createMemo(() => local.agent.list())
  const active = createMemo(() => local.agent.current()?.name)

  return (
    <div class="mx-auto flex h-full w-full max-w-4xl flex-col gap-5 overflow-y-auto px-4 py-6 lg:px-8">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <IconButton
            type="button"
            icon="arrow-left"
            size="normal"
            variant="ghost"
            aria-label="返回主页"
            onClick={() => navigate("/")}
          />
          <Icon name="dot-grid" size="large" class="text-v2-text-text-strong" />
          <h1 class="text-20-medium text-v2-text-text-strong">Skill 管理</h1>
        </div>
        <div class="flex items-center gap-1">
          <TooltipV2 placement="bottom" value={theme.mode() === "dark" ? "切换为亮色模式" : "切换为暗色模式"}>
            <IconButton
              type="button"
              icon={theme.mode() === "dark" ? "sun" : "moon"}
              size="normal"
              variant="ghost"
              aria-label={theme.mode() === "dark" ? "切换为亮色模式" : "切换为暗色模式"}
              onClick={() => theme.setColorScheme(theme.mode() === "dark" ? "light" : "dark")}
            />
          </TooltipV2>
          <Button
            size="normal"
            variant="primary"
            icon="plus"
            onClick={() => dialog.show(() => <InstallSkillDialog />)}
          >
            添加 Skill
          </Button>
        </div>
      </div>
      <div class="text-13-regular text-v2-text-text-weak">
        {language.t("agent.sidebar.title")} · 管理所有 Skill 驱动的写作 Agent，点击卡片即可设为当前使用的 Agent（全局生效）。
      </div>
      <Show
        when={agents().length > 0}
        fallback={
          <div class="flex flex-col items-center gap-3 py-20 text-center">
            <Icon name="dot-grid" size="large" class="text-v2-text-text-weak" />
            <div class="text-14-medium text-v2-text-text-strong">还没有 Skill</div>
            <div class="text-13-regular text-v2-text-text-weak">点击右上角「添加 Skill」上传或安装一个</div>
          </div>
        }
      >
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <For each={agents()}>
            {(agent, index) => {
              const isActive = () => active() === agent.name
              return (
                <button
                  type="button"
                  classList={{
                    "flex flex-col items-start gap-1.5 rounded-[10px] border px-4 py-3 text-left transition-colors": true,
                    "border-v2-accent-accent-strong bg-v2-accent-accent-soft": isActive(),
                    "border-v2-border-border-base bg-v2-background-bg-layer-01 hover:bg-v2-background-bg-layer-02": !isActive(),
                  }}
                  onClick={() => local.agent.set(agent.name)}
                >
                  <span class="flex w-full items-center gap-2">
                    <span
                      class="size-2 shrink-0 rounded-full"
                      style={{ background: agent.color || AGENT_COLORS[index() % AGENT_COLORS.length] }}
                    />
                    <span class="min-w-0 flex-1 truncate text-14-medium text-v2-text-text-strong">{agent.name}</span>
                    <Show when={isActive()}>
                      <span class="shrink-0 rounded-md bg-v2-accent-accent-strong px-1.5 py-0.5 text-11-medium text-white">
                        当前
                      </span>
                    </Show>
                  </span>
                  <span class="line-clamp-2 text-12-regular text-v2-text-text-faint">
                    {agent.description ?? "Skill 驱动的 Agent"}
                  </span>
                </button>
              )
            }}
          </For>
        </div>
      </Show>
    </div>
  )
}
