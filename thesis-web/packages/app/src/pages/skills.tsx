// [论文助手定制] Skill 管理独立页面（/skills）。
// 原会话侧边栏里的 InstallSkillDialog 与 AGENT_COLORS 迁移到这里（会话侧边栏已删除）；
// 主页右上角「Skill 管理」按钮作为入口跳转到本页。
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { TextField } from "@opencode-ai/ui/text-field"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { useTheme } from "@opencode-ai/ui/theme/context"
import { useMutation, useQueryClient } from "@tanstack/solid-query"
import { useNavigate } from "@solidjs/router"
import { For, Show, createMemo, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { useDirectoryPicker } from "@/components/directory-picker"
import { useLanguage } from "@/context/language"
import { LocalProvider, useLocal } from "@/context/local"
import { ServerConnection, useServer } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { SDKProvider, useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { DirectoryDataProvider } from "@/pages/directory-layout"
import { pathKey } from "@/utils/path-key"
import { showToast } from "@/utils/toast"

export const AGENT_COLORS = ["#4f8cff", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4"]

const SKILL_NAME_RE = /^[\p{L}\p{N}_-]+$/u
const sanitizeName = (value: string) =>
  value
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "")

type InstallForm = {
  name: string
  description: string
  content: string
  prompt: string
  filename: string
  error?: string
}

export function InstallSkillDialog() {
  const dialog = useDialog()
  const local = useLocal()
  const sdk = useSDK()
  const server = useServer()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const sync = useSync()
  const queryClient = useQueryClient()
  const pickDirectory = useDirectoryPicker()
  const [dragging, setDragging] = createSignal(false)
  let fileInput: HTMLInputElement | undefined

  const [form, setForm] = createStore<InstallForm>({
    name: "",
    description: "",
    content: "",
    prompt: "",
    filename: "",
  })

  async function loadSkillFile(file: File) {
    const text = await file.text()
    const fallbackName = sanitizeName(file.name.replace(/\.(md|markdown)$/i, ""))
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
    let name: string | undefined
    let description: string | undefined
    let content = text
    if (frontmatter) {
      name = frontmatter[1].match(/^name:\s*(.+)$/m)?.[1]?.trim()
      description = frontmatter[1].match(/^description:\s*(.+)$/m)?.[1]?.trim()
      content = text.slice(frontmatter[0].length)
    }
    setForm({
      filename: file.name,
      name: sanitizeName(name ?? "") || form.name || fallbackName,
      description: description || form.description,
      content: content.trim(),
      error: undefined,
    })
  }

  const install = useMutation(() => ({
    mutationFn: async () => {
      const name = form.name.trim()
      if (!name) throw new Error("请输入 Agent 名称")
      if (!SKILL_NAME_RE.test(name) || name.startsWith("."))
        throw new Error("名称仅支持字母、数字、下划线和短横线，且不能以 . 开头")
      if (!form.content.trim()) throw new Error("请输入 Skill 内容")

      await sdk().client.instance.skillInstall({
        directory: sdk().directory,
        name,
        description: form.description.trim() || undefined,
        content: form.content.trim(),
        prompt: form.prompt.trim() || undefined,
      })

      const agentsQuery = () => serverSync().queryOptions.agents(pathKey(sdk().directory))
      await queryClient.invalidateQueries({ queryKey: agentsQuery().queryKey })
      const agents = await queryClient.fetchQuery(agentsQuery())
      sync().set("agent", agents)
      return name
    },
    onSuccess: (name) => {
      dialog.close()
      local.agent.set(name)
      showToast({
        variant: "success",
        icon: "circle-check",
        title: `已添加 Skill「${name}」`,
      })
    },
    onError: (err) => {
      setForm("error", err instanceof Error ? err.message : String(err))
    },
  }))

  const installFromDirectory = useMutation(() => ({
    mutationFn: async (directory: string) => {
      const result = await sdk().client.instance.skillInstallDirectory({ directory })
      const agent = result.data?.agent
      if (!agent) throw new Error(formatApiError(result.error) ?? "安装失败：未返回 Agent 信息")

      const agentsQuery = () => serverSync().queryOptions.agents(pathKey(sdk().directory))
      await queryClient.invalidateQueries({ queryKey: agentsQuery().queryKey })
      const agents = await queryClient.fetchQuery(agentsQuery())
      sync().set("agent", agents)
      return agent.name
    },
    onSuccess: (name) => {
      dialog.close()
      local.agent.set(name)
      showToast({
        variant: "success",
        icon: "circle-check",
        title: `已添加 Skill「${name}」`,
      })
    },
    onError: (err) => {
      setForm("error", err instanceof Error ? err.message : String(err))
    },
  }))

  const pickSkillFolder = () => {
    const conn = server.current
    if (!conn) return
    pickDirectory({
      server: conn,
      title: "选择 Skill 文件夹",
      onSelect: (result) => {
        const directory = Array.isArray(result) ? result[0] : result
        if (!directory) return
        setForm("error", undefined)
        installFromDirectory.mutate(directory)
      },
    })
  }

  function formatApiError(error: unknown) {
    if (!error || typeof error !== "object") return undefined
    const data = (error as { data?: { message?: unknown } }).data
    if (typeof data?.message === "string") return data.message
    const message = (error as { message?: unknown }).message
    return typeof message === "string" ? message : undefined
  }

  return (
    <Dialog title="添加 Skill">
      <form
        class="flex max-h-[65vh] flex-col gap-4 overflow-y-auto px-2.5 pb-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (install.isPending) return
          setForm("error", undefined)
          install.mutate()
        }}
      >
        <div
          class="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-7 text-center transition-colors"
          classList={{
            "border-v2-accent-accent-strong bg-v2-accent-accent-soft": dragging(),
            "border-v2-border-border-base hover:bg-v2-background-bg-layer-01": !dragging(),
          }}
          onClick={() => fileInput?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            const file = event.dataTransfer?.files?.[0]
            if (file) void loadSkillFile(file)
          }}
        >
          <input
            ref={fileInput}
            type="file"
            accept=".md,.markdown,text/markdown"
            class="hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ""
              if (file) void loadSkillFile(file)
            }}
          />
          <Icon name="cloud-upload" size="medium" class="text-v2-icon-icon-strong" />
          <span class="text-13-medium text-v2-text-text-strong">
            {form.filename ? "重新选择文件" : "点击选择或拖拽上传 Skill 文件"}
          </span>
          <span class="text-11-regular text-v2-text-text-faint">
            支持 .md / .markdown，自动识别名称、描述与内容
          </span>
        </div>

        <Show when={form.filename}>
          <div class="flex items-center gap-1.5 rounded-md bg-v2-background-bg-layer-01 px-2 py-1.5 text-12-regular text-v2-text-text-base">
            <Icon name="check-small" class="text-v2-accent-accent-strong" />
            <span class="truncate">已识别：{form.filename}</span>
          </div>
        </Show>

        <div class="flex items-center gap-2">
          <div class="h-px flex-1 bg-v2-border-border-base" />
          <span class="text-11-regular text-v2-text-text-faint">或导入完整 Skill 文件夹</span>
          <div class="h-px flex-1 bg-v2-border-border-base" />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="small"
          icon="folder-add-left"
          class="w-full justify-center"
          disabled={installFromDirectory.isPending}
          onClick={pickSkillFolder}
        >
          {installFromDirectory.isPending ? "正在导入…" : "选择本地 Skill 文件夹"}
        </Button>

        <TextField label="名称" value={form.name} onChange={(value) => setForm("name", value)} />
        <TextField
          label="描述"
          placeholder="显示在侧边栏的一句话描述"
          value={form.description}
          onChange={(value) => setForm("description", value)}
        />
        <TextField
          multiline
          label="Skill 内容（markdown）"
          placeholder="上传文件后自动填充，也可手动修改"
          value={form.content}
          onChange={(value) => setForm("content", value)}
        />
        <TextField
          multiline
          label="Prompt（可选）"
          placeholder="该 agent 的系统提示词，留空则使用默认提示词"
          value={form.prompt}
          onChange={(value) => setForm("prompt", value)}
        />
        <Show when={form.error}>
          <div class="text-12-regular text-red-500">{form.error}</div>
        </Show>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => dialog.close()}>
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={install.isPending}>
            {install.isPending ? "安装中…" : "创建并启用"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

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
