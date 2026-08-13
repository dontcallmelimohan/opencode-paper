import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { TextField } from "@opencode-ai/ui/text-field"
import { useTheme } from "@opencode-ai/ui/theme/context"
import { useMutation, useQueryClient } from "@tanstack/solid-query"
import { useNavigate } from "@solidjs/router"
import { For, Show, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { useDirectoryPicker } from "@/components/directory-picker"
import { useLanguage } from "@/context/language"
import { useLocal } from "@/context/local"
import { useWritingMode, WRITING_MODES } from "./writing-mode"
import { useSDK } from "@/context/sdk"
import { useServer } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"
import { pathKey } from "@/utils/path-key"
import { showToast } from "@/utils/toast"

export const AGENT_COLORS = ["#4f8cff", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4"]
const SIDEBAR_COLLAPSED_KEY = "opencode.dat:thesis-agent-sidebar-collapsed"

const SKILL_NAME_RE = /^[\p{L}\p{N}_-]+$/u
const sanitizeName = (value: string) =>
  value
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "")

const readCollapsed = () => {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1"
  } catch {
    return false
  }
}

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

        <TextField
          label="名称"
          value={form.name}
          onChange={(value) => setForm("name", value)}
        />
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

export function SessionAgentSidebar() {
  const language = useLanguage()
  const theme = useTheme()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = createSignal(readCollapsed())
  // [论文助手定制] 模式状态来自共享 Context；配置面板的打开/收起按钮已移到会话页面（不再在侧边栏）。
  const { mode, setMode } = useWritingMode()

  const toggle = () => {
    const next = !collapsed()
    setCollapsed(next)
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0")
    } catch {
      // ignore storage errors
    }
  }

  // [论文助手定制] 持久化改由 WritingModeProvider 统一处理。
  const selectMode = (key: string) => {
    setMode(key as Parameters<typeof setMode>[0])
  }

  return (
    <>
      <Show
        when={!collapsed()}
        fallback={
          <IconButton
            type="button"
            icon="chevron-right"
            size="small"
            variant="ghost"
            class="absolute left-1 top-1/2 z-50 hidden -translate-y-1/2 md:flex"
            aria-label="展开侧边栏"
            onClick={toggle}
          />
        }
      >
        <aside class="hidden w-52 shrink-0 flex-col overflow-hidden rounded-[10px] bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)] md:flex">
          <div class="flex items-center justify-between gap-2 px-3 pb-1.5 pt-3">
            <span class="text-13-medium text-v2-text-text-strong">{language.t("agent.sidebar.title")}</span>
            <div class="flex items-center">
              <IconButton
                type="button"
                icon={theme.mode() === "dark" ? "sun" : "moon"}
                size="small"
                variant="ghost"
                aria-label={theme.mode() === "dark" ? "切换为亮色模式" : "切换为暗色模式"}
                onClick={() => theme.setColorScheme(theme.mode() === "dark" ? "light" : "dark")}
              />
              <IconButton
                type="button"
                icon="chevron-left"
                size="small"
                variant="ghost"
                aria-label="隐藏侧边栏"
                onClick={toggle}
              />
            </div>
          </div>
          <div class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
            <div class="px-2 pb-1 pt-1 text-10-medium tracking-wide text-v2-text-text-faint">写作流程</div>
            {/* [论文助手定制] 点击整行 = 选择写作模式；配置面板的打开按钮在会话页面的面板条上。 */}
            <For each={WRITING_MODES}>
              {(item) => (
                <button
                  type="button"
                  class="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors"
                  classList={{
                    "bg-v2-background-bg-layer-01 text-v2-text-text-strong": mode() === item.key,
                    "text-v2-text-text-base hover:bg-v2-background-bg-layer-01": mode() !== item.key,
                  }}
                  onClick={() => selectMode(item.key)}
                >
                  <span class="flex w-full items-center gap-1.5 text-13-medium">
                    <span class="size-1.5 shrink-0 rounded-full" style={{ background: item.color }} />
                    <span class="min-w-0 flex-1 truncate">{item.label}</span>
                    <Show when={mode() === item.key}>
                      <Icon name="check-small" size="small" class="shrink-0 text-v2-accent-accent-strong" />
                    </Show>
                  </span>
                  <span class="pl-3 text-11-regular text-v2-text-text-faint">
                    {item.step} · {item.desc}
                  </span>
                </button>
              )}
            </For>
            <div class="my-1 h-px bg-v2-border-border-base" />
            <Button
              type="button"
              variant="ghost"
              size="small"
              icon="dot-grid"
              class="w-full justify-start"
              onClick={() => navigate("/skills")}
            >
              Skill 管理
            </Button>
          </div>
        </aside>
      </Show>
    </>
  )
}
