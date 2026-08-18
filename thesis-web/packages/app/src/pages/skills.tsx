// [论文助手定制] Skill 管理独立页面（/skills）。
// 原会话侧边栏里的 InstallSkillDialog 与 AGENT_COLORS 迁移到这里（会话侧边栏已删除）；
// 主页右上角「Skill 管理」按钮作为入口跳转到本页。
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { TextField } from "@opencode-ai/ui/text-field"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { useTheme } from "@opencode-ai/ui/theme/context"
import { useMutation, useQueryClient } from "@tanstack/solid-query"
import { useNavigate } from "@solidjs/router"
import JSZip from "jszip"
import { For, Show, createMemo, createResource, createSignal } from "solid-js"
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

// [论文助手定制] 统一把后端错误（HttpApi 的 { data: { message } } 或普通 Error）转成可读文本。
export function formatApiError(error: unknown) {
  if (!error || typeof error !== "object") return undefined
  const data = (error as { data?: { message?: unknown } }).data
  if (typeof data?.message === "string") return data.message
  const message = (error as { message?: unknown }).message
  return typeof message === "string" ? message : undefined
}

type InstallForm = {
  name: string
  description: string
  content: string
  prompt: string
  filename: string
  // [论文助手定制] zip 导入：解压后的完整文件树（含 SKILL.md / references / static 等），
  // 提交时走 skillInstallZip 接口整包写入，而不是只装一个 SKILL.md。
  zipFiles: { path: string; content: string }[]
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
    zipFiles: [],
  })

  // [论文助手定制] 解析 SKILL.md 文本的 frontmatter（name / description）并剥离 frontmatter 正文。
  function parseSkillText(text: string, fallbackName: string) {
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
    if (!frontmatter) return { name: fallbackName, description: undefined as string | undefined, content: text.trim() }
    const name = frontmatter[1].match(/^name:\s*(.+)$/m)?.[1]?.trim()
    const description = frontmatter[1].match(/^description:\s*(.+)$/m)?.[1]?.trim()
    return { name: sanitizeName(name ?? "") || fallbackName, description, content: text.slice(frontmatter[0].length).trim() }
  }

  // [论文助手定制] zip 导入：解压整个 zip，保留 SKILL.md / references / static 等完整文件树，
  // 供 skillInstallZip 整包安装；自动从 SKILL.md frontmatter 识别名称与描述。
  async function loadSkillZip(file: File) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    const entries: { path: string; content: string }[] = []
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue
      // 跳过 macOS 打包产生的 __MACOSX 与 .DS_Store 冗余文件。
      const segments = entry.name.split("/").filter((segment) => segment !== "__MACOSX")
      if (segments.some((segment) => segment === ".DS_Store")) continue
      const rel = segments.join("/")
      if (!rel) continue
      const content = await entry.async("text")
      entries.push({ path: rel, content })
    }
    const skillEntry = entries.find((item) => /(^|\/)SKILL\.md$/i.test(item.path))
    if (!skillEntry) throw new Error("zip 中没有找到 SKILL.md，不是有效的 skill 包")
    const fallbackName = sanitizeName(file.name.replace(/\.(zip)$/i, ""))
    const parsed = parseSkillText(skillEntry.content, fallbackName)
    setForm({
      filename: file.name,
      name: parsed.name || form.name,
      description: parsed.description || form.description,
      content: parsed.content,
      prompt: form.prompt,
      zipFiles: entries,
      error: undefined,
    })
  }

  async function loadSkillFile(file: File) {
    if (/^application\/zip$|^application\/x-zip-compressed$|\\.zip$/i.test(file.type) || file.name.toLowerCase().endsWith(".zip")) {
      await loadSkillZip(file)
      return
    }
    const text = await file.text()
    const fallbackName = sanitizeName(file.name.replace(/\.(md|markdown)$/i, ""))
    const parsed = parseSkillText(text, fallbackName)
    setForm({
      filename: file.name,
      name: parsed.name || form.name,
      description: parsed.description || form.description,
      content: parsed.content,
      prompt: form.prompt,
      zipFiles: [],
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

      // [论文助手定制] zip 导入：以解压后的文件树整包安装（SKILL.md 用当前表单内容，
      // 允许用户在安装前手动修改）；普通 .md 走单文件安装。
      if (form.zipFiles.length > 0) {
        const files = form.zipFiles.map((item) =>
          /(^|\/)SKILL\.md$/i.test(item.path) ? { ...item, content: form.content.trim() } : item,
        )
        const res = await sdk().client.instance.skillInstallZip({
          directory: sdk().directory,
          name,
          description: form.description.trim() || undefined,
          files,
        })
        if (res.error) throw new Error(formatApiError(res.error) ?? "安装失败：请检查 zip 内容")
      } else {
        await sdk().client.instance.skillInstall({
          directory: sdk().directory,
          name,
          description: form.description.trim() || undefined,
          content: form.content.trim(),
          prompt: form.prompt.trim() || undefined,
        })
      }

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
            if (file) void loadSkillFile(file).catch((err) => setForm("error", err instanceof Error ? err.message : String(err)))
          }}
        >
          <input
            ref={fileInput}
            type="file"
            accept=".md,.markdown,.zip,text/markdown,application/zip"
            class="hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ""
              if (file) void loadSkillFile(file).catch((err) => setForm("error", err instanceof Error ? err.message : String(err)))
            }}
          />
          <Icon name="cloud-upload" size="medium" class="text-v2-icon-icon-strong" />
          <span class="text-13-medium text-v2-text-text-strong">
            {form.filename ? "重新选择文件" : "点击选择或拖拽上传 Skill 文件"}
          </span>
          <span class="text-11-regular text-v2-text-text-faint">
            支持 .md / .markdown / .zip，自动识别名称、描述与内容
          </span>
        </div>

        <Show when={form.filename}>
          <div class="flex items-center gap-1.5 rounded-md bg-v2-background-bg-layer-01 px-2 py-1.5 text-12-regular text-v2-text-text-base">
            <Icon name="check-small" class="text-v2-accent-accent-strong" />
            <span class="truncate">
              已识别：{form.filename}
              {form.zipFiles.length > 0 ? `（zip 内 ${form.zipFiles.length} 个文件，整包安装）` : ""}
            </span>
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

        <Show when={form.error}>
          <div class="rounded-md bg-v2-state-bg-error px-2.5 py-1.5 text-12-regular text-v2-state-text-error">
            {form.error}
          </div>
        </Show>

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

// [论文助手定制] Skill 查看：调 GET /skill 拉取该 skill 的完整 SKILL.md（content 字段），
// 用 Markdown 渲染展示，方便检查 skill 的指令与文件结构。
function SkillDetailDialog(props: { name: string }) {
  const sdk = useSDK()
  const [detail] = createResource(() => props.name, async (name) => {
    const res = await sdk().client.app.skills({ directory: sdk().directory })
    if (res.error) return undefined
    return (res.data ?? []).find((item) => item.name === name)
  })
  return (
    // [论文助手定制] 查看窗口用最大尺寸（x-large：宽 980px / 高 600px），
    // 去掉内容区 max-h 限制，让 SKILL.md 正文在窗口内滚动，方便阅读长指令。
    <Dialog size="x-large" title={`查看 Skill · ${props.name}`}>
      <div class="flex min-h-0 flex-col gap-3 px-2.5 pb-4">
        <Show when={detail.state !== "pending" && detail.state !== "unresolved"} fallback={<div class="py-10 text-center text-12-regular text-v2-text-text-faint">加载中…</div>}>
          <Show
            when={detail()}
            fallback={
              <div class="py-10 text-center text-12-regular text-v2-text-text-faint">
                该 Skill 没有可查看的指令文件（可能是内置 Agent）
              </div>
            }
          >
          <div class="rounded-md bg-v2-background-bg-layer-01 px-2.5 py-2">
            <div class="text-13-regular text-v2-text-text-base">{detail()?.description || "无描述"}</div>
            <div class="mt-0.5 text-11-regular text-v2-text-text-faint">位置：{detail()?.location}</div>
          </div>
          <div class="min-h-0 overflow-y-auto rounded-md border border-v2-border-border-base p-3">
            <Markdown text={detail()?.content ?? ""} cacheKey={detail()?.content ?? ""} class="text-13-regular" />
          </div>
          </Show>
        </Show>
      </div>
    </Dialog>
  )
}

// [论文助手定制] Skill 删除确认：调 /skill/uninstall 删除全局 skill 目录与同名 agent 配置（不可恢复）。
function SkillDeleteDialog(props: { name: string }) {
  const dialog = useDialog()
  const sdk = useSDK()
  const serverSync = useServerSync()
  const sync = useSync()
  const queryClient = useQueryClient()
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>(undefined)

  const remove = async () => {
    if (busy()) return
    setBusy(true)
    setError(undefined)
    try {
      const res = await sdk().client.instance.skillUninstall({ directory: sdk().directory, name: props.name })
      if (res.error) throw new Error(formatApiError(res.error) ?? "删除失败")
      dialog.close()
      const agentsQuery = () => serverSync().queryOptions.agents(pathKey(sdk().directory))
      await queryClient.invalidateQueries({ queryKey: agentsQuery().queryKey })
      const agents = await queryClient.fetchQuery(agentsQuery())
      sync().set("agent", agents)
      showToast({ variant: "success", icon: "circle-check", title: `已删除 Skill「${props.name}」` })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="删除 Skill"
      description={`确定删除「${props.name}」吗？将删除全局 skill 文件与同名 agent，且不可恢复。`}
    >
      <form
        class="flex flex-col gap-4 px-2.5 pb-4"
        onSubmit={(event) => {
          event.preventDefault()
          void remove()
        }}
      >
        {error() ? <div class="text-12-regular text-v2-text-text-error">{error()}</div> : null}
        <div class="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => dialog.close()}>
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={busy()} icon="circle-x">
            {busy() ? "删除中…" : "确认删除"}
          </Button>
        </div>
      </form>
    </Dialog>
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
                <div
                  classList={{
                    "flex cursor-pointer flex-col items-start gap-1.5 rounded-[10px] border px-4 py-3 text-left transition-colors": true,
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
                  {/* [论文助手定制] 操作区：查看（打开 SKILL.md 内容）/ 删除（确认后卸载）；阻止冒泡避免误切换当前 agent。 */}
                  <span class="flex w-full items-center justify-end gap-1">
                    <IconButton
                      type="button"
                      icon="open-file"
                      size="small"
                      variant="ghost"
                      aria-label={`查看 ${agent.name}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        dialog.show(() => <SkillDetailDialog name={agent.name} />)
                      }}
                    />
                    <Show when={agent.native === false}>
                      <IconButton
                        type="button"
                        icon="circle-x"
                        size="small"
                        variant="ghost"
                        aria-label={`删除 ${agent.name}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          dialog.show(() => <SkillDeleteDialog name={agent.name} />)
                        }}
                      />
                    </Show>
                  </span>
                </div>
              )
            }}
          </For>
        </div>
      </Show>
    </div>
  )
}
