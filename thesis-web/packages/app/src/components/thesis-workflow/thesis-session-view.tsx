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
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { createAutoScroll } from "@opencode-ai/ui/hooks"
import { createEffect, createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import type { AssistantMessage } from "@opencode-ai/sdk/v2"
import type { Prompt } from "@/context/prompt"
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
import { MANUSCRIPT_FILENAMES, useThesisManuscriptFile } from "./thesis-manuscript-file"
import { useThesisWorkflow, type StepKey } from "./thesis-workflow-store"
import { ThesisSessionTimeline } from "./thesis-session-timeline"
import { useThesisFigureActions } from "./thesis-figure-actions"
import { ThesisFigurePanel } from "./thesis-figure-panel"
import { parseFigures } from "./thesis-assets"

// [论文助手定制] 板块标识（会话记录/会话视图共用）：用于把会话 ID 映射回所属板块。
const STEP_KEYS: StepKey[] = ["outline", "writing", "formatting", "review"]
const STEP_LABELS: Record<StepKey, string> = {
  outline: "提纲助手",
  writing: "辅助写作",
  formatting: "论文排版",
  review: "论文评审",
}
// [论文助手定制] 板块 → 固定 Agent 映射（与后端 thesis-agents.ts 初始化的 agent 文件名一致）。
// 板块会话发送时强制使用该 agent（角色/权限绑定板块），用户在会话里仍可按需 @skill 追加方法。
const STEP_AGENTS: Record<StepKey, string> = {
  outline: "提纲助手",
  writing: "辅助写作",
  formatting: "论文排版",
  review: "论文评审",
}
type CanvasApplyMode = "replace" | "append" | "scratch"

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
    // [论文助手定制] dotx 模板类型：docx/dotx 属于二进制文档，模型 Provider 不直接支持
    // （后端 message-v2 会把不支持的二进制附件转成文字说明，模型可用工具按路径读取），
    // 这里给准确 MIME 用于消息卡片展示与工具读取。
    dotx: "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
    dot: "application/msword",
    // [论文助手定制] tex 模板/源稿用 text/* MIME：模型 Provider（openai-compatible）的 file part
    // 只支持 image/pdf/text，application/x-tex 会被拒绝导致整轮中断；text/x-tex 按纯文本附加。
    tex: "text/x-tex",
    latex: "text/x-tex",
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
// 写作配置「参考提纲」选择也复用此弹窗（title 可自定义）。
export function FilePickerDialog(props: {
  directory: string
  onPick: (path: string, name: string) => void
  title?: string
}) {
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
    <Dialog title={props.title ?? "插入文件"} description="选择文件空间中的文件，插入到输入框" size="large">
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

export function ThesisSessionView(props: {
  fixedSessionID?: string
  // [论文助手定制] 配置面板弱化（第二轮）：当前板块标识 + 配置浮窗开合状态 + 开合回调，
  // 由 StepProductPanel 透传；控制输入框底栏「配置/插图」图标的显示与浮窗开关。
  step?: StepKey
  configOpen?: boolean
  onSetConfigOpen?: (next: boolean) => void
}) {
  const sdk = useSDK()
  const navigate = useNavigate()
  const dialog = useDialog()
  const sync = useSync()
  const local = useLocal()
  const serverSync = useServerSync()
  const { state, updateInput, setStepSessionID, setStepResult, setCurrentArtifact, markTurn, ensureArtifactForStep, ensureScratchArtifact, upsertArtifact, registerSessionInsertFile } = useThesisWorkflow()
  // [论文助手定制] 文稿文件化：会话里「存为当前文稿」时同样落盘到项目根目录 <step>.md。
  const manuscript = useThesisManuscriptFile(sdk().directory)
  // [论文助手定制] 插图动作（writing）：输入框底栏「插图」浮窗复用，插资料图/改图注/删图统一落盘。
  const { insertMaterialFigure, renameFigure, removeFigureFromManuscript } = useThesisFigureActions()
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
  const isLocalSession = createMemo(() => {
    const id = sessionID()
    return !!id && state().localSessionIDs.includes(id)
  })
  // [论文助手定制] 会话归属兜底：侧边栏「会话记录/新会话」点开的会话若未归属任何板块
  // （独立会话，displaySessionID 优先显示），打开时立即归属到当前板块——这样切回「文稿」
  // 再切到「会话」仍是这条会话，而不是回到「还没有会话」；局部会话（选区改写）不归属，
  // 保持在侧边栏单独折叠展示。
  createEffect(() => {
    if (props.fixedSessionID) return
    const id = state().displaySessionID
    if (!id || state().localSessionIDs.includes(id)) return
    const bound = STEP_KEYS.some((step) => state().steps[step].sessionID === id)
    if (!bound) setStepSessionID(state().activeStep, id)
  })
  // [论文助手定制] 配置图标四个板块都显示（outline/writing/formatting/review）：
  // 点击弹出对应配置浮窗（Outline/Writing/Formatting/ReviewConfigForm），配置面板已全部浮窗化。
  const configStep = createMemo(() => props.step)
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
  // [论文助手定制] 板块固定 agent：会话归属板块时，发送与展示都强制用该板块的 agent（见 STEP_AGENTS），
  // 忽略输入框的全局 agent 选择；agent 尚未就绪（后端未初始化）时回退全局选择，避免发送失败。
  const boardAgentName = createMemo(() => {
    // props.step = 当前板块面板；用它的原因：板块专属会话还没创建时 sessionStep() 为 null，
    // 但第一轮发送就该用板块 agent（否则首个会话会退回全局 agent，行为不一致）。
    const step = props.step ?? sessionStep()
    if (!step) return undefined
    const name = STEP_AGENTS[step]
    const available = controls().agents.available as Array<{ name?: string }> | undefined
    return available?.some((agent) => agent.name === name) ? name : undefined
  })
  const boardControls = createMemo(() => {
    const base = controls()
    const fixed = boardAgentName()
    if (!fixed) return base
    return { ...base, agents: { ...base.agents, current: fixed } }
  })

  // [论文助手定制] 完整会话输入框（PromptInputV2Composer）：
  // embedded 模式=复用当前模块的专属会话继续对话、发送后不跳转页面；
  // 首次发送（还没有专属会话）时自动创建，onSessionCreated 把新会话写回工作流状态。
  const input = usePromptInputV2Controller({
    get controls() {
      return boardControls()
    },
    embedded: true,
    // [论文助手定制] 固定板块 agent：发送时强制使用该板块的角色。
    fixedAgent: boardAgentName,
    // [论文助手定制] 会话归属：新会话写回「当前显示的会话所属板块」（普通会话时写回当前板块）。
    onSessionCreated: (id) => {
      if (props.fixedSessionID) return
      setStepSessionID(sessionStep() ?? state().activeStep, id)
    },
    onSubmit: () => {
      const id = sessionID()
      if (id) markTurn(id, { target: "chat" })
      autoScroll.resume()
      // [论文助手定制] 配置面板弱化（第二轮）：发送即生成——发送时自动关闭配置浮窗（四个板块统一）。
      if (props.step) props.onSetConfigOpen?.(false)
    },
    // [论文助手定制] 配置不再注入会话文本：配置唯一交付方式为落盘 config/论文主题.md（见 thesis-config-forms），
    // 由「提纲助手」等 Skill 直接读取；故 promptTransform 透传，不追加任何配置段。
    promptTransform: (prompt: Prompt) => prompt,
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

  // [论文助手定制] 把输入框 @ 引用能力注册到 workflow store，供配置浮窗「同步到文件空间」按钮调用：
  // 保存 config/论文主题.md 后把该文件追加为输入框引用，让 Skill 必须看到配置文件。
  createEffect(() => {
    registerSessionInsertFile(insertFile)
    onCleanup(() => registerSessionInsertFile(undefined))
  })

  // [论文助手定制] 打开会话视图时确保该会话已同步（先拉历史消息，之后 SSE 增量继续写入）。
  createEffect(() => {
    const id = sessionID()
    if (!id) return
    void sync().session.sync(id).catch(() => {})
  })

  // [论文助手定制] 会话是否已有消息：只用于空态判定（消息列表由 ThesisSessionTimeline 直接渲染，
  // 与全屏会话页同源读取 sync 数据，保证报错/diff/重试/思考过程显示一致）。
  const hasMessages = createMemo(() => {
    const id = sessionID()
    if (!id) return false
    return (sync().data.message[id] ?? []).length > 0
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
    const id = sessionID()
    if (!id) return undefined
    const messages = sync().data.message[id] ?? []
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

  const currentStepText = (step: StepKey) => state().steps[step].result?.trim() ?? ""
  const defaultApplyMode = (step: StepKey | null): CanvasApplyMode => {
    if (!step) return "scratch"
    return currentStepText(step) ? "append" : "replace"
  }
  const defaultApplyLabel = (step: StepKey | null) => {
    if (!step) return "另存为文档"
    return defaultApplyMode(step) === "append" ? "追加到画布" : "替换画布"
  }

  const saveScratchDocument = (text: string) => {
    dialog.show(() => (
      <SaveAsDocDialog
        onSave={(title) => {
          void (async () => {
            const artifact = ensureScratchArtifact(title, sessionID())
            await manuscript.saveFile(`docs/${title}.md`, text)
            const nextArtifact: ReturnType<typeof ensureScratchArtifact> = {
              ...artifact,
              title,
              fileName: `${title}.md`,
              kind: "scratch",
              sessionID: sessionID(),
              updatedAt: Date.now(),
            }
            upsertArtifact(nextArtifact)
            setCurrentArtifact(nextArtifact.id)
            showToast({ variant: "success", icon: "circle-check", title: `已另存到画布「${title}」` })
          })()
        }}
      />
    ))
  }

  // [论文助手定制] 采纳回复：板块专属会话支持替换 / 追加 / 另存，独立会话默认另存为独立文档。
  // 单一「覆盖当前文稿」太容易把自由对话误当正文写入；这里把写作动作显式化。
  const applyMessageToCanvas = async (messageId: string, mode: CanvasApplyMode = defaultApplyMode(sessionStep())) => {
    const step = sessionStep()
    const text = assistantText(messageId)
    if (!text) {
      showToast({ variant: "error", icon: "circle-x", title: "这条回复还没有文本内容" })
      return
    }
    if (!step || mode === "scratch") {
      saveScratchDocument(text)
      return
    }

    const nextText = mode === "append" && currentStepText(step)
      ? `${currentStepText(step)}\n\n${text}`
      : text
    if (mode === "replace" || mode === "append") {
      const artifact = ensureArtifactForStep(step)
      upsertArtifact({ ...artifact, title: STEP_LABELS[step], fileName: MANUSCRIPT_FILENAMES[step], kind: "step", step, sessionID: sessionID(), updatedAt: Date.now() })
      await manuscript.save(step, nextText)
      setStepResult(step, nextText)
      setCurrentArtifact(artifact.id)
      showToast({
        variant: "success",
        icon: "circle-check",
        title: mode === "append" ? "已追加到画布" : "已替换画布",
      })
      return
    }
  }

  // [论文助手定制] 自动采纳（板块会话）：提纲/排版/评审的回复完成后自动写入对应文稿（写作保留手动确认）。
  // 只在「当前板块的专属会话」且未打开会话记录时生效，避免把历史回复/自由提问误写进画布；
  // 采用「替换」语义——该板块的产物始终是最近一轮完整回复。手动「采纳到画布」按钮仍保留可修正。
  const AUTO_APPLY_STEPS: StepKey[] = ["outline", "formatting", "review"]
  const autoApplied = new Set<string>()
  createEffect(() => {
    const step = sessionStep()
    const id = sessionID()
    if (props.fixedSessionID || state().displaySessionID) return
    if (!step || !AUTO_APPLY_STEPS.includes(step)) return
    if (!id) return
    const messages = sync().data.message[id] ?? []
    const last = messages[messages.length - 1]
    if (!last || last.role !== "assistant") return
    if (!(last.finish || last.time.completed)) return
    if (autoApplied.has(last.id)) return
    if (!assistantText(last.id)) return
    autoApplied.add(last.id)
    void applyMessageToCanvas(last.id, "replace")
  })

  // [论文助手定制] 「采纳到画布」动作（时间线组件在每轮末尾渲染）：
  // 完成判定与原来一致——最后一条 assistant 需 finish/time.completed，历史回复一律视为已完成；
  // 带错误的消息不提供采纳动作（错误卡片由时间线组件渲染）。
  const renderApplyActions = (assistant: AssistantMessage) => {
    const isLastAssistant = assistant.id === lastAssistantId()
    const done = !isLastAssistant || !!assistant.finish || !!assistant.time.completed
    return (
      <Show when={!assistant.error}>
        <div class="flex items-center justify-end pb-1">
          <div class="flex overflow-hidden rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01">
            <button
              type="button"
              data-action="save-message-as-result"
              class="flex cursor-pointer items-center gap-1 px-2 py-1 text-11-medium text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base disabled:cursor-default disabled:opacity-40"
              disabled={!done}
              onClick={() => void applyMessageToCanvas(assistant.id)}
            >
              <Icon name="circle-check" size="small" />
              {done ? defaultApplyLabel(sessionStep()) : "生成中…"}
            </button>
            <MenuV2 modal={false} placement="bottom-end" gutter={4}>
              <MenuV2.Trigger
                as="button"
                type="button"
                aria-label="更多应用方式"
                disabled={!done}
                class="flex h-6 w-6 cursor-pointer items-center justify-center border-l border-v2-border-border-muted text-v2-text-text-faint transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base disabled:cursor-default disabled:opacity-40"
              >
                <IconV2 name="chevron-down" size="small" />
              </MenuV2.Trigger>
              <MenuV2.Portal>
                <MenuV2.Content class="w-[184px]">
                  <Show when={sessionStep()}>
                    <MenuV2.Item onSelect={() => void applyMessageToCanvas(assistant.id, "append")}>
                      <Icon name="plus-small" size="small" />
                      追加到当前画布
                    </MenuV2.Item>
                    <MenuV2.Item onSelect={() => void applyMessageToCanvas(assistant.id, "replace")}>
                      <Icon name="circle-check" size="small" />
                      替换当前画布
                    </MenuV2.Item>
                    <MenuV2.Separator />
                  </Show>
                  <MenuV2.Item onSelect={() => void applyMessageToCanvas(assistant.id, "scratch")}>
                    <Icon name="open-file" size="small" />
                    另存为新文档
                  </MenuV2.Item>
                </MenuV2.Content>
              </MenuV2.Portal>
            </MenuV2>
          </div>
        </div>
      </Show>
    )
  }

  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden">
      <div class="flex shrink-0 items-center justify-between gap-2 border-b border-v2-border-border-base px-3 py-2">
        {/* [论文助手定制] 头部显示会话归属：板块专属会话显示板块名，会话记录点选的普通会话显示「独立会话」。 */}
        <span class="min-w-0 truncate text-12-regular text-v2-text-text-faint">
          {props.fixedSessionID
            ? isLocalSession()
              ? "局部会话 · 选区改写记录"
              : "全屏会话 · 可继续对话修改"
            : isLocalSession()
              ? "局部会话 · 选区改写记录"
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
          when={hasMessages()}
          fallback={
            <div class="flex h-full items-center justify-center px-6 text-center text-12-regular text-v2-text-text-faint">
              {sessionID()
                ? "会话已创建，等待生成内容…"
                : "还没有会话，可以在下方输入内容直接开始对话，或先在左侧表单里「生成」。"}
            </div>
          }
        >
          {/* [论文助手定制] 与全屏会话页一致的时间线渲染：用户消息 / 助手片段（含思考过程）/
              错误卡片 / diff 摘要 / 重试 / 中断分隔都可见；「采纳到画布」动作在每轮末尾渲染。 */}
          <ThesisSessionTimeline
            sessionID={sessionID()!}
            contentRef={(el) => autoScroll.contentRef(el)}
            renderApplyActions={renderApplyActions}
          />
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
            <>
              {/* [论文助手定制]「配置」图标（四个板块显示）：点击切换配置浮窗
                  （step 文件的 effect 监听 configOpen 弹对应 ConfigForm）。
                  配置不再以「方块」形式附加到消息，而是写入文件空间固定配置文件由 Skill 读取。 */}
              <Show when={configStep() !== undefined}>
                <TooltipV2 placement="top" value="配置">
                  <IconButtonV2
                    type="button"
                    icon={<IconV2 name="settings-gear" />}
                    variant="ghost"
                    size="large"
                    aria-label="配置"
                    onClick={() => props.onSetConfigOpen?.(!props.configOpen)}
                  />
                </TooltipV2>
              </Show>
              {/* [论文助手定制] 配置面板弱化（第二轮）：「插图」图标（仅 writing 显示）——
                  弹出插图管理浮窗（复用 ThesisFigurePanel，插资料图/改图注/删图，改动落盘到 全文稿.md）。 */}
              <Show when={props.step === "writing"}>
                <TooltipV2 placement="top" value="插图">
                  <IconButtonV2
                    type="button"
                    icon={<Icon name="photo" />}
                    variant="ghost-muted"
                    size="large"
                    aria-label="插图"
                    onClick={() =>
                      dialog.show(() => (
                        <ThesisFigurePanel
                          directory={sdk().directory}
                          figures={parseFigures(state().steps.writing.result ?? "")}
                          busy={false}
                          onInsertMaterial={insertMaterialFigure}
                          onRename={renameFigure}
                          onRemove={removeFigureFromManuscript}
                        />
                      ))
                    }
                  />
                </TooltipV2>
              </Show>
              {/* [论文助手定制] 「插入文件」按钮：打开文件选择弹窗，从文件空间选任意文件，
                以原生文件引用方式插入输入框（带图标，路径相对项目文件空间）。 */}
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
            </>
          }
        />
      </div>
    </div>
  )
}
