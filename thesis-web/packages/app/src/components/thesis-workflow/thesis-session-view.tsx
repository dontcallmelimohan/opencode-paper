// [论文助手定制] 论文工作台产物区域的「会话」视图：
// 在展示文稿的同一个位置显示「当前模块」的专属会话的聊天记录，并支持直接继续对话：
//   - 底部输入框：与主会话页同款完整对话框（PromptInputV2），带模型选择、skill 选择、
//     @引用/附件等；发送后复用当前模块的专属会话（还没有则自动创建），模型回复流式显示；
//   - 输入框左侧「插入文件」按钮：弹出文件选择窗口，可浏览文件空间并选中任意文件，
//     以 opencode 原生的文件引用方式插入输入框（@路径 彩色 mention，发送后消息里显示带图标的文件卡片）；
//   - 每条助手消息可「存为当前文稿」：把该回复采纳为当前步骤的产物，支持反复修改迭代。
// [论文助手定制] 输出路由（三个通道，见下方 auto-save 位置注释）：自由对话的回复默认只留在
// 会话里，不会自动覆盖画布；配置面板生成的回复走各板块生成流程落盘，选区改写的回复只替换选中文本。
import { Icon } from "@opencode-ai/ui/icon"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { useNavigate } from "@solidjs/router"
import { Button } from "@opencode-ai/ui/button"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { TextField } from "@opencode-ai/ui/text-field"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { createAutoScroll } from "@opencode-ai/ui/hooks"
import { Message } from "@opencode-ai/session-ui/message-part"
import { createEffect, createMemo, createResource, createSignal, For, onMount, Show } from "solid-js"
import type { AssistantMessage } from "@opencode-ai/sdk/v2"
import { PromptInputV2Composer, usePromptInputV2Controller } from "@/components/prompt-input-v2"
import type { PromptInputV2PersistedState } from "@opencode-ai/session-ui/v2/prompt-input"
import { useServerSync } from "@/context/server-sync"
import { useLocal } from "@/context/local"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { createPromptInputController } from "@/pages/session/composer"
import { createPromptModelSelection } from "@/pages/session/composer/prompt-model-selection"
import { useSessionKey } from "@/pages/session/session-layout"
import { legacySessionHref } from "@/utils/session-route"
import { useComposerCommands } from "@/pages/session/use-composer-commands"
import { showToast } from "@/utils/toast"
import { normalizeSessionMessages } from "@/utils/session-message"
import { useThesisManuscriptFile } from "./thesis-manuscript-file"
import { useThesisWorkflow, type StepKey } from "./thesis-workflow-store"

// [论文助手定制] 板块标识（会话记录/会话视图共用）：用于把会话 ID 映射回所属板块。
const STEP_KEYS: StepKey[] = ["outline", "writing", "formatting", "review"]
const STEP_LABELS: Record<StepKey, string> = {
  outline: "提纲助手",
  writing: "辅助写作",
  formatting: "论文排版",
  review: "论文评审",
}

// [论文助手定制] 按扩展名推断文件 MIME：图片/PDF/常见文本给准确类型，其余兜底 octet-stream，
// 供原生文件引用的 file part 使用（发送后消息卡片能正确渲染、服务端能正确识别文件类型）。
const fileMime = (name: string): string => {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  const MIME: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    md: "text/markdown",
    txt: "text/plain",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    // [论文助手定制] 修复 .dotx 模板被兜底成 application/octet-stream 导致
    // 「file part media type … not supported」报错：补上 Word 模板等文档类型。
    dotx: "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
    dot: "application/msword",
    tex: "application/x-tex",
    latex: "application/x-latex",
    json: "application/json",
    csv: "text/csv",
    yml: "application/x-yaml",
    yaml: "application/x-yaml",
    html: "text/html",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  }
  return MIME[ext] ?? "application/octet-stream"
}

// [论文助手定制] 「插入文件」弹窗：浏览论文项目文件空间（可进入子目录），点选文件后
// 以原生文件引用方式插入输入框（file part，发送后成为真实附件，消息里带图标）。
function FilePickerDialog(props: { directory: string; onPick: (path: string, name: string) => void }) {
  const sdk = useSDK()
  const dialog = useDialog()
  // [论文助手定制] 当前浏览目录（相对项目根，空串=根目录），与文件空间面板同一套浏览逻辑。
  const [currentDir, setCurrentDir] = createSignal("")

  const joinPath = (dir: string, name: string) => (dir ? `${dir}/${name}` : name)
  const parentOf = (dir: string) => dir.split("/").slice(0, -1).join("/")

  // [论文助手定制] 列出当前目录条目：过滤 .git 等隐藏项，文件夹在前、按名称排序。
  const [entries] = createResource(
    () => [props.directory, currentDir()] as const,
    async ([directory, dir]) => {
      if (!directory) return []
      try {
        const res = await sdk().client.file.list({ directory, path: dir })
        if (res.error) return []
        return (res.data ?? [])
          .filter((node) => !node.name.startsWith("."))
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === "directory" ? -1 : 1
            return a.name.localeCompare(b.name, "zh-Hans-CN")
          })
      } catch {
        return []
      }
    },
  )

  // [论文助手定制] 面包屑：根目录 / 各级目录，点击可跳转。
  const crumbs = () => {
    const parts = currentDir().split("/").filter(Boolean)
    const items = [{ label: "根目录", dir: "" }]
    let acc = ""
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part
      items.push({ label: part, dir: acc })
    }
    return items
  }

  return (
    <Dialog title="插入文件" description="选择文件空间中的文件，插入到输入框" size="large">
      <div class="flex min-h-0 w-full flex-1 flex-col gap-1.5 px-2.5 pb-4">
        {/* [论文助手定制] 路径栏：面包屑 + 上一级，与文件空间面板一致。 */}
        <div class="flex shrink-0 items-center gap-1 rounded-[10px] bg-v2-background-bg-layer-01 p-1.5">
          <Icon name="folder" size="small" class="shrink-0 text-v2-text-text-faint" />
          <div class="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
            <For each={crumbs()}>
              {(crumb, index) => (
                <>
                  <button
                    type="button"
                    class="shrink-0 cursor-pointer whitespace-nowrap text-11-medium transition-colors hover:text-v2-text-text-base"
                    classList={{
                      "text-v2-text-text-base": index() === crumbs().length - 1,
                      "text-v2-text-text-faint": index() !== crumbs().length - 1,
                    }}
                    onClick={() => setCurrentDir(crumb.dir)}
                  >
                    {crumb.label}
                  </button>
                  <Show when={index() < crumbs().length - 1}>
                    <Icon name="chevron-right" size="small" class="shrink-0 text-v2-text-text-faint" />
                  </Show>
                </>
              )}
            </For>
          </div>
          <IconButton
            type="button"
            icon="arrow-up"
            size="small"
            variant="ghost"
            aria-label="上一级"
            disabled={!currentDir()}
            onClick={() => setCurrentDir(parentOf(currentDir()))}
          />
        </div>
        {/* [论文助手定制] 文件列表：文件夹进入子目录，文件点击即选中并关闭弹窗。 */}
        <div class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto rounded-[10px] bg-v2-background-bg-layer-01 p-1.5">
          <Show
            when={entries.loading}
            fallback={
              <Show
                when={entries() && entries()!.length > 0}
                fallback={<div class="px-2 py-2 text-12-regular text-v2-text-text-faint">空文件夹</div>}
              >
                <For each={entries()}>
                  {(node) => (
                    <button
                      type="button"
                      class="flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-v2-background-bg-base"
                      onClick={() => {
                        if (node.type === "directory") setCurrentDir(joinPath(currentDir(), node.name))
                        else props.onPick(joinPath(currentDir(), node.name), node.name)
                      }}
                    >
                      <Icon
                        name={node.type === "directory" ? "folder" : "open-file"}
                        size="small"
                        class="shrink-0 text-v2-text-text-faint"
                      />
                      <span class="min-w-0 flex-1 truncate text-12-regular text-v2-text-text-base">{node.name}</span>
                      <Show when={node.type === "file"}>
                        <span class="shrink-0 text-11-regular text-v2-text-text-faint">插入</span>
                      </Show>
                    </button>
                  )}
                </For>
              </Show>
            }
          >
            <div class="px-2 py-2 text-12-regular text-v2-text-text-faint">加载中…</div>
          </Show>
        </div>
      </div>
    </Dialog>
  )
}

// [论文助手定制] 「另存为独立文档」标题输入弹窗：独立会话的回复保存为 docs/<标题>.md。
// 标题默认「对话文档」，校验非空并去掉 / \ : * ? " < > | 等非法字符（避免路径逃逸或变成多级目录）。
function SaveAsDocDialog(props: { onSave: (title: string) => void }) {
  const dialog = useDialog()
  const [title, setTitle] = createSignal("对话文档")
  const [error, setError] = createSignal<string | undefined>(undefined)

  const sanitize = (value: string) => value.replace(/[\\/:*?"<>|]/g, "").trim()

  const submit = () => {
    const clean = sanitize(title())
    if (!clean) {
      setError("标题为空或只包含非法字符，请重新输入")
      return
    }
    props.onSave(clean)
    dialog.close()
  }

  return (
    <Dialog
      title="另存为独立文档"
      description="将这条回复保存为独立文档（docs/ 目录，.md），可在画布文稿下拉中查看与编辑"
      // [论文助手定制] fit：弹窗高度贴合表单内容，与新建弹窗视觉一致。
      fit
    >
      <div class="mx-auto flex w-[420px] max-w-full flex-col gap-3 px-2.5 pb-4">
        <TextField
          type="text"
          label="文档标题"
          placeholder="例如：研究背景综述"
          value={title()}
          autofocus
          onChange={(value) => {
            setTitle(value)
            setError(undefined)
          }}
          onKeyDown={(event: KeyboardEvent) => {
            if (event.key === "Enter") submit()
          }}
        />
        <Show when={error()}>
          <div class="text-13-regular text-icon-critical-base">{error()}</div>
        </Show>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => dialog.close()}>
            取消
          </Button>
          <Button type="button" variant="primary" disabled={!title().trim()} onClick={() => submit()}>
            保存
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

export function ThesisSessionView(props: { fixedSessionID?: string }) {
  const sdk = useSDK()
  const navigate = useNavigate()
  const dialog = useDialog()
  const sync = useSync()
  const local = useLocal()
  const serverSync = useServerSync()
  const { state, setStepSessionID, setStepResult } = useThesisWorkflow()
  // [论文助手定制] 文稿文件化：会话里「存为当前文稿」时同样落盘到项目根目录 <step>.md。
  const manuscript = useThesisManuscriptFile(sdk().directory)
  // [论文助手定制] 会话记录联动：显示的会话优先级 = 全屏页指定（fixedSessionID）>
  // 会话记录点选的会话（displaySessionID）> 当前板块专属会话。
  const sessionID = () =>
    props.fixedSessionID ?? state().displaySessionID ?? state().steps[state().activeStep].sessionID
  // [论文助手定制] 当前显示的会话属于哪个板块（普通会话/未归属返回 null）。
  const sessionStep = (): StepKey | null => {
    const id = sessionID()
    if (!id) return null
    return STEP_KEYS.find((step) => state().steps[step].sessionID === id) ?? null
  }
  const route = useSessionKey()

  // [论文助手定制] 复用主会话页的自动滚动 Hook：内容渲染完成后（ResizeObserver 在布局后触发）
  // 自动保持底部，用户上翻时暂停跟随，回到底部后恢复。这样每次切到「会话」视图都会定位到最底部，
  // 生成中的流式内容增长也不会把视图留在顶部。
  const autoScroll = createAutoScroll({ working: () => true, overflowAnchor: "none" })

  // [论文助手定制] 与主会话页一致的模型选择器（读取当前 agent 的配置模型，支持最近使用/回退）。
  const model = createPromptModelSelection({ agent: () => local.agent.current() })
  // [论文助手定制] 注册输入框快捷键/命令（模型选择、agent 循环等），与主会话页保持一致。
  useComposerCommands({ model })

  // [论文助手定制] 完整输入框控制器：agent/skill 列表、模型、会话信息都从这里取；
  // sessionKey 用工作区级 key（路由里没有会话 id），sessionID 直接取当前模块的专属会话。
  const controls = createPromptInputController({
    sessionKey: route.sessionKey,
    sessionID,
    queryOptions: serverSync().queryOptions,
    model,
  })

  // [论文助手定制] 完整会话输入框（PromptInputV2Composer）：
  // embedded 模式=复用当前模块的专属会话继续对话、发送后不跳转页面；
  // 首次发送（还没有专属会话）时自动创建，onSessionCreated 把新会话写回工作流状态。
  const input = usePromptInputV2Controller({
    get controls() {
      return controls()
    },
    embedded: true,
    // [论文助手定制] 会话归属：新会话写回「当前显示的会话所属板块」（普通会话时写回当前板块）。
    onSessionCreated: (id) => {
      if (props.fixedSessionID) return
      setStepSessionID(sessionStep() ?? state().activeStep, id)
    },
    onSubmit: () => autoScroll.resume(),
  })

  // [论文助手定制] 插入选中文件：以 opencode 原生文件引用方式加入输入框（file part），
  // 路径相对项目文件空间根目录（如 正文/摘要.md），发送时由 buildRequestParts 解析成
  // file://<项目目录>/<路径> 的真实附件，服务端读取文件内容给模型；
  // 编辑器里显示 @路径 彩色 mention，发送后消息里自动渲染成带图标的文件卡片。
  // 注意不能直接用 controller.addPart：它内部走 addMention，是为“手打 @ 再从建议里选”设计的，
  // 会从光标位置往前找最近一个 @ 并替换；连续添加第二个引用时会误匹配第一个 @ 导致插入失败。
  // 这里手动把新引用追加到末尾，并重算各 part 的 start/end 偏移（与 store 内部 withOffsets 一致）。
  const insertFile = (path: string, name: string) => {
    const mention = {
      type: "file" as const,
      path,
      content: `@${path}`,
      start: 0,
      end: 0,
      filename: name,
      mime: fileMime(name),
    }
    const current = input.parts()
    const length = current.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0)
    const next: PromptInputV2PersistedState["prompt"] = [
      ...current,
      mention,
      { type: "text", content: " ", start: 0, end: 0 },
    ]
    let offset = 0
    const withOffsets: PromptInputV2PersistedState["prompt"] = next.map((part) => {
      if (part.type === "image") return part
      const mapped = { ...part, start: offset, end: offset + part.content.length }
      offset = mapped.end
      return mapped
    })
    input.onInput(
      withOffsets.map((part) => ("content" in part ? part.content : "")).join(""),
      withOffsets,
      length + mention.content.length + 1,
    )
  }

  // [论文助手定制] 打开会话视图时确保该会话已同步（先拉历史消息，之后 SSE 增量继续写入）。
  createEffect(() => {
    const id = sessionID()
    if (!id) return
    void sync().session.sync(id).catch(() => {})
  })

  // [论文助手定制] 消息列表来自 session_message（normalize 成标准 Message[]）；parts 用 sync().data.part 拿流式增量。
  const normalized = createMemo(() => {
    const id = sessionID()
    if (!id) return { messages: [] as ReturnType<typeof normalizeSessionMessages>["messages"], parts: new Map() }
    return normalizeSessionMessages(id, sync().data.session_message[id] ?? [])
  })

  // [论文助手定制] 每次打开/切换会话视图时强制滚到底部。
  // 注意：必须用 onMount（非响应式），不能在 createEffect 里调 resume()——
  // resume() 会读取 autoScroll store 的 userScrolled，createEffect 会因此订阅它，
  // 用户一上翻（userScrolled 变 true）effect 就重跑 resume() 把视图拉回底部，导致无法上翻。
  onMount(() => {
    if (!sessionID()) return
    autoScroll.resume()
  })

  // [论文助手定制] 最后一条 assistant 消息：用于完成判定（非最后一条历史回复一律视为已完成，
  // 只有最后一条才需要等 finish/time.completed——它是当前正在流式输出的回复）。
  const lastAssistantId = createMemo(() => {
    const messages = normalized().messages
    const index = messages.findLastIndex((m) => m.role === "assistant")
    return index >= 0 ? messages[index]?.id : undefined
  })

  // [论文助手定制] 提取某条助手消息的纯文本（读流式 part store，与生成器取回复文本的方式一致）。
  const assistantText = (messageId: string) => {
    const parts = sync().data.part[messageId] ?? []
    return parts
      .filter((part) => part.type === "text" && "text" in part)
      .map((part) => (part as { text: string }).text)
      .join("")
      .trim()
  }

  // [论文助手定制] 输出路由（三个通道，不再自动猜测）：
  // 1. 配置面板「生成草稿」= 文档通道：回复由各板块的生成流程落盘到画布（如 step-writing 的
  //    manuscript.save + setStepResult），会话视图不参与。
  // 2. 选区 AI 改写 = 编辑通道：回复只替换选中文本（thesis-workflow-ui 的 askSuggestion，
  //    编辑器原地替换或文本级回退落盘），不会整篇覆盖画布。
  // 3. 本视图的自由对话 = 聊天通道：回复只留在会话记录里，要进画布必须手动点该条消息的
  //    「存为当前文稿」（saveAsResult）。
  // 以前这里有一个「最后一条 assistant 回复完成就自动存为文稿」的 effect，导致
  // 自由提问、选区改写的回复都会被当成整篇文稿覆盖画布；现已删除，改为按通道显式路由。

  // [论文助手定制] 采纳回复：板块专属会话存为当前步骤的文稿；独立会话另存为独立文档（docs/<标题>.md）。
  const saveAsResult = async (messageId: string) => {
    const step = sessionStep()
    const text = assistantText(messageId)
    if (!text) {
      showToast({ variant: "error", icon: "circle-x", title: "这条回复还没有文本内容" })
      return
    }
    // [论文助手定制] 按归属分流：板块专属会话 → 存为当前步骤文稿（覆盖画布 <step>.md）；
    // 独立会话 → 弹标题输入框，另存为独立文档 docs/<标题>.md（复用 thesisWriteFile 落盘）。
    if (step) {
      // [论文助手定制] 先落盘再更新 result：文稿视图重读文件时能读到新内容。
      await manuscript.save(step, text)
      setStepResult(step, text)
      showToast({ variant: "success", icon: "circle-check", title: "已存为当前步骤文稿" })
      return
    }
    dialog.show(() => (
      <SaveAsDocDialog
        onSave={(title) => {
          void (async () => {
            await manuscript.saveFile(`docs/${title}.md`, text)
            showToast({ variant: "success", icon: "circle-check", title: `已存为独立文档「${title}」` })
          })()
        }}
      />
    ))
  }

  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden">
      <div class="flex shrink-0 items-center justify-between gap-2 border-b border-v2-border-border-base px-3 py-2">
        {/* [论文助手定制] 头部显示会话归属：板块专属会话显示板块名，会话记录点选的普通会话显示「独立会话」。 */}
        <span class="min-w-0 truncate text-12-regular text-v2-text-text-faint">
          {props.fixedSessionID
            ? "全屏会话 · 可继续对话修改"
            : sessionStep()
              ? `${STEP_LABELS[sessionStep()!]} · 专属会话，可继续对话修改`
              : "会话记录 · 独立会话，可继续对话"}
        </span>
        {/* [论文助手定制] 全屏按钮：打开该会话的完整会话页（与点击会话记录原本进入的全局会话页一致）。 */}
        <Show when={!props.fixedSessionID && sessionID()}>
          <button
            type="button"
            data-action="thesis-session-fullscreen"
            class="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-12-medium text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
            onClick={() => navigate(legacySessionHref(sdk().directory, sessionID()!))}
          >
            <Icon name="chevron-double-right" size="small" />
            全屏
          </button>
        </Show>
      </div>
      <div ref={autoScroll.scrollRef} onScroll={autoScroll.handleScroll} class="min-h-0 flex-1 overflow-y-auto">
        <Show
          when={normalized().messages.length > 0}
          fallback={
            <div class="flex h-full items-center justify-center px-6 text-center text-12-regular text-v2-text-text-faint">
              {sessionID()
                ? "会话已创建，等待生成内容…"
                : "还没有会话，可以在下方输入内容直接开始对话，或先在左侧表单里「生成」。"}
            </div>
          }
        >
          <div ref={autoScroll.contentRef} class="flex flex-col">
            <For each={normalized().messages}>
              {(message) => {
                // [论文助手定制] 类型收窄：只有助手消息才有 finish/error，用于「存为当前文稿」按钮。
                const assistant = message.role === "assistant" ? (message as AssistantMessage) : undefined
                // [论文助手定制] 完成判定：该后端消息完成可能只带 time.completed（没有 finish），两个都认；
                // 且只对「最后一条 assistant」做流式完成判定——历史回复（非最后一条）一律视为已完成，
                // 否则个别协议不写 finish/time.completed 时，最后一条的按钮会永远禁用。
                const isLastAssistant = !!assistant && assistant.id === lastAssistantId()
                const done =
                  !!assistant && (!isLastAssistant || !!assistant.finish || !!assistant.time.completed)
                return (
                  <div class="px-4 py-2 md:px-5">
                    {/* [论文助手定制] 助手消息完成且无错误时提供「保存」按钮：
                        板块专属会话 = 存为当前文稿；独立会话 = 存为独立文档（不再报「无法存为文稿」）。 */}
                    <Show when={assistant && !assistant.error}>
                      <div class="flex items-center justify-end pb-1">
                        <button
                          type="button"
                          data-action="save-message-as-result"
                          class="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-11-medium text-v2-text-text-faint transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
                          classList={{ "cursor-default opacity-40": !done }}
                          disabled={!done}
                          onClick={() => void saveAsResult(assistant!.id)}
                        >
                          <Icon name="circle-check" size="small" />
                          {done ? (sessionStep() ? "存为当前文稿" : "存为独立文档") : "生成中…"}
                        </button>
                      </div>
                    </Show>
                    <Message message={message} parts={sync().data.part[message.id] ?? []} useV2Actions />
                  </div>
                )
              }}
            </For>
          </div>
        </Show>
      </div>
      {/* [论文助手定制] 底部完整会话输入框：与主会话页同款（模型选择、skill 选择、@引用/附件、
          发送/停止）；embedded 模式复用当前模块专属会话、发送后不跳转。 */}
      <div class="shrink-0 border-t border-v2-border-border-base p-2">
        {/* [论文助手定制] 「插入文件」按钮：打开文件选择弹窗，从文件空间选任意文件，
          以原生文件引用方式插入输入框（带图标，路径相对项目文件空间）。 */}
        <PromptInputV2Composer
          controller={input}
          borderUnderlay
          controlsSlot={
            <TooltipV2 placement="top" value="插入文件">
              <IconButtonV2
                type="button"
                icon={<IconV2 name="folder-add-left" />}
                variant="ghost-muted"
                size="large"
                aria-label="插入文件"
                onClick={() =>
                  dialog.show(() => (
                    <FilePickerDialog directory={sdk().directory} onPick={(path, name) => insertFile(path, name)} />
                  ))
                }
              />
            </TooltipV2>
          }
        />
      </div>
    </div>
  )
}
