import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { TextField } from "@opencode-ai/ui/text-field"
import { useTheme } from "@opencode-ai/ui/theme/context"
import { useMutation, useQueryClient } from "@tanstack/solid-query"
import { For, Show, createMemo, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useLocal } from "@/context/local"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"
import { pathKey } from "@/utils/path-key"
import { showToast } from "@/utils/toast"

const AGENT_COLORS = ["#4f8cff", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4"]
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

function InstallSkillDialog() {
  const dialog = useDialog()
  const local = useLocal()
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const sync = useSync()
  const queryClient = useQueryClient()
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
        title: `已添加 Agent「${name}」`,
      })
    },
    onError: (err) => {
      setForm("error", err instanceof Error ? err.message : String(err))
    },
  }))

  return (
    <Dialog title="添加 Skill Agent" description="上传 skill 的 markdown 文件，自动识别信息并创建同名 agent（全局安装，所有项目通用）">
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

        <TextField
          label="名称"
          placeholder="例如：outline-assistant"
          description="自动识别自 frontmatter 或文件名，可修改；会用作 skill 与 agent 的文件名"
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
  const local = useLocal()
  const dialog = useDialog()
  const theme = useTheme()
  const [collapsed, setCollapsed] = createSignal(readCollapsed())
  const agents = createMemo(() => local.agent.list())
  const active = createMemo(() => local.agent.current()?.name)

  const toggle = () => {
    const next = !collapsed()
    setCollapsed(next)
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0")
    } catch {
      // ignore storage errors
    }
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
            <Show
              when={agents().length > 0}
              fallback={
                <div class="px-2 py-1.5 text-11-regular text-v2-text-text-faint">
                  暂无 Agent，点击下方“添加”创建一个
                </div>
              }
            >
              <For each={agents()}>
                {(agent, index) => {
                  const isActive = () => active() === agent.name
                  return (
                    <button
                      type="button"
                      classList={{
                        "flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors": true,
                        "bg-v2-background-bg-layer-01 text-v2-text-text-strong": isActive(),
                        "text-v2-text-text-base hover:bg-v2-background-bg-layer-01": !isActive(),
                      }}
                      onClick={() => local.agent.set(agent.name)}
                    >
                      <span class="flex w-full items-center gap-1.5 text-13-medium">
                        <span
                          class="size-1.5 shrink-0 rounded-full"
                          style={{ background: agent.color || AGENT_COLORS[index() % AGENT_COLORS.length] }}
                        />
                        <span class="truncate">{agent.name}</span>
                      </span>
                      <span class="line-clamp-2 text-11-regular text-v2-text-text-faint">
                        {agent.description ?? "Skill 驱动的 Agent"}
                      </span>
                    </button>
                  )
                }}
              </For>
            </Show>
          </div>
          <div class="px-2 pb-2">
            <Button
              type="button"
              variant="ghost"
              size="small"
              icon="plus"
              class="w-full justify-start"
              onClick={() => dialog.show(() => <InstallSkillDialog />)}
            >
              添加 Agent
            </Button>
          </div>
        </aside>
      </Show>
    </>
  )
}
