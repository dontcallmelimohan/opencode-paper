// [论文助手定制] 论文工作台各步骤共用的布局组件：
// 左侧“输入表单” + 右侧“产物面板”，产物用 Markdown 渲染。
import { Button } from "@opencode-ai/ui/button"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { CheckboxV2 } from "@opencode-ai/ui/v2/checkbox-v2"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { PromptInputV2SkillsMenu } from "@opencode-ai/session-ui/v2/prompt-input"
import { createEffect, createMemo, createResource, createSignal, For, Show, type JSX } from "solid-js"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { MANUSCRIPT_FILENAMES, useThesisManuscriptFile, type ManuscriptStep } from "./thesis-manuscript-file"
import { downloadBlob } from "./thesis-manuscript-preview"
import { usePersistentWidth } from "./thesis-panel-layout"
import type { InputSource, StepKey, StepStatus } from "./thesis-workflow-store"
import { useThesisWorkflow } from "./thesis-workflow-store"
import { ThesisSessionView } from "./thesis-session-view"
import { resolveMarkdownImages } from "./thesis-assets"
import { waitForAssistantReply } from "./thesis-generator"
import { ThesisEditor } from "./thesis-editor"
import type { ThesisEditorApi, ThesisEditorSelection } from "./thesis-editor"
import "./thesis-editor.css"
import { buildPlainDoc } from "./thesis-md-text"
import { showToast } from "@/utils/toast"

// [论文助手定制] 生成提示词里的工具约束文本：随配置面板「生成时允许使用工具」开关变化。
// 开启时允许模型按需调用工具（脚本型 Skill 需要执行脚本/读文件）；
// 关闭时严禁调用任何工具，保证纯文本流式输出（默认）。
export const promptToolRestriction = (useTools: boolean): string =>
  useTools
    ? "允许在必要时调用工具（如读取文件、执行脚本）完成任务，但工具调用本身不要以 <tool_calls> 等 XML 形式出现在最终结果中；"
    : "严禁调用任何工具、skill、文件读取或外部命令，不要输出 <tool_calls> 等 XML 标记；"

export function StepLayout(props: {
  form: JSX.Element
  product: JSX.Element
  // [论文助手定制] 配置面板左侧列形态（弱化配置，不遮挡文稿/会话界面）：
  // collapsed=false 时左侧为可拖拽表单列（与右侧产物 flex-1 并排，无 Portal/fixed 浮层遮罩）；
  // collapsed=true 时左侧收为窄轨（约 w-11），内部 StepFormPanel 显示收起齿轮点击展开。
  collapsed?: boolean
  onExpand?: () => void
}) {
  // [论文助手定制] 可拖拽布局：左侧「输入表单」宽度可拖拽调整（默认 340，范围 240~560，
  // localStorage 记住），右侧「产物」面板自动占满剩余空间。
  const formWidth = usePersistentWidth("thesis-workbench.formWidth", 340)
  return (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-2 md:flex-row">
      <Show
        when={!props.collapsed}
        fallback={null}
      >
        <div class="relative flex w-full shrink-0 md:w-auto" style={{ width: `min(${formWidth.width()}px, 100%)` }}>
          {/* [论文助手定制] 修复滚动：内层必须是 flex-1 + min-h-0 + overflow-y-auto，
              否则高度跟随内容（auto）撑开，overflow-y-auto 永不触发，配置面板就无法上下滚动。 */}
          <div class="min-h-0 flex-1 overflow-y-auto">{props.form}</div>
          <ResizeHandle
            direction="horizontal"
            edge="end"
            size={formWidth.width()}
            min={240}
            max={560}
            onResize={formWidth.setWidth}
          />
        </div>
      </Show>
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">{props.product}</div>
    </div>
  )
}

export function StepFormPanel(props: {
  // [论文助手定制] 方案 B：stepLabel 改为可选（四个模块并列，不再标注 Step N）。
  stepLabel?: string
  title: string
  subtitle?: string
  children: JSX.Element
  footer?: JSX.Element
  collapsed?: boolean
  collapsedSummary?: string
}) {
  return (
    <div class="flex h-full min-h-0 flex-col gap-3 overflow-y-auto rounded-[10px] bg-v2-background-bg-base p-3 shadow-[var(--v2-elevation-raised)]">
      {/* [论文助手定制] 配置面板头部只保留标题/副标题；
          打开/收起配置面板的按钮已移到右侧产物面板标题栏（StepProductPanel），
          否则面板收起后按钮也跟着消失、配置将无法再展开。 */}
      <div>
        <Show when={props.stepLabel}>
          <div class="text-11-regular text-v2-text-text-accent">{props.stepLabel}</div>
        </Show>
        <div class="text-14-medium text-v2-text-text-base">{props.title}</div>
        <Show when={props.subtitle}>
          <div class="text-12-regular text-v2-text-text-faint">{props.subtitle}</div>
        </Show>
      </div>
      <Show
        when={!props.collapsed}
        fallback={null}
      >
        {/* [论文助手定制] 修复按钮重叠：配置内容超高时必须在自己区域内滚动（overflow-y-auto），
            否则内容会溢出到下方 footer（生成/下一步按钮）区域，视觉上与按钮重叠。 */}
        <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">{props.children}</div>
        <Show when={props.footer}>{props.footer}</Show>
      </Show>
    </div>
  )
}

// [论文助手定制] 配置面板共用的「选择 Skill」区块：
// 直接复用会话输入框同一个 PromptInputV2SkillsMenu（sparkles 按钮 + 弹窗多选），
// 不自己画勾选框，这样以后添加新 Skill 会自动出现在同一个列表里，无需改代码。
// Skill 来源与会话输入框一致：sync().data.agent 里 native === false 且未隐藏的即自定义 Skill。
// 勾选结果写入该步骤 input.skills；生成时 thesis-generator 把选中 Skill 的 SKILL.md 指令随提示词一起注入。
export function ThesisSkillPicker(props: { step: StepKey; hideTools?: boolean }) {
  const sync = useSync()
  const { state, updateInput } = useThesisWorkflow()
  const selected = () => state().steps[props.step].input.skills
  // [论文助手定制] 工具开关状态：是否允许模型在本步生成时调用工具。
  const useTools = () => state().steps[props.step].input.useTools
  const options = () =>
    sync()
      .data.agent.filter((agent) => !agent.hidden && agent.native === false)
      .map((agent) => ({ id: agent.name, label: agent.name }))
  const toggle = (name: string) => {
    const current = selected()
    updateInput(props.step, {
      skills: current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    })
  }
  return (
    // [论文助手定制] data-action 便于自动化定位该区块（与代码库其它可交互区块的约定一致）。
    <section data-action="thesis-skill-picker" class="flex flex-col gap-1.5 rounded-md bg-v2-background-bg-layer-01 px-2.5 py-2">
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0 flex flex-col gap-0.5">
          <div class="text-12-medium text-v2-text-text-base">选择 Skill（可多选）</div>
          <Show
            when={selected().length > 0}
            fallback={<div class="truncate text-11-regular text-v2-text-text-faint">生成时按选中 Skill 的指令执行</div>}
          >
            <div class="truncate text-11-regular text-v2-text-text-faint">已选：{selected().join("、")}</div>
          </Show>
        </div>
        <PromptInputV2SkillsMenu
          title="选择技能"
          emptyLabel="暂无 Skill，可到主页「Skill 管理」添加"
          confirmLabel="完成"
          options={options}
          selected={selected}
          onToggle={toggle}
        />
      </div>
      {/* [论文助手定制] 工具开关：默认关闭（tools: {"*": false}，纯文本流式输出）；
          开启后生成时不传 tools（用 agent 默认工具集），适合需要执行脚本/读文件的 Skill，
          代价是模型可能先做多轮工具调用、文稿不会立刻流式出现。
          hideTools=true（论文排版）时隐藏：排版模块固定走真实文件链路、始终放行工具，
          开关已无意义，避免误导用户。 */}
      <Show when={!props.hideTools}>
        <div class="flex items-center justify-between gap-2 rounded-md border border-v2-border-border-base px-2 py-1.5">
          <div class="min-w-0 flex flex-col gap-0.5">
            <div class="text-12-medium text-v2-text-text-base">生成时允许使用工具</div>
            <div class="truncate text-11-regular text-v2-text-text-faint">
              {useTools() ? "已开启：模型可调用工具（适合需脚本的 Skill），输出会变慢" : "关闭：纯文本流式输出，适合常规写作"}
            </div>
          </div>
          <CheckboxV2
            label="生成时允许使用工具"
            hideLabel
            checked={useTools()}
            onChange={(value) => updateInput(props.step, { useTools: value })}
          />
        </div>
      </Show>
    </section>
  )
}

// [论文助手定制] 段落级 AI 建议的指令 prompt 模板：按类型生成「只输出处理后的段落本身」的提示词。
const SUGGESTION_PROMPTS: Record<string, (text: string) => string> = {
  rewrite: (t) =>
    `请对下面这段论文文稿进行改写，保持原意与学术语气，提升表达质量。只输出改写后的段落本身，不要任何解释、标题或前后缀。\n\n${t}`,
  expand: (t) =>
    `请扩写下面这段论文文稿，补充细节、论据与展开论述，使其更充实，保持学术语气。只输出扩写后的段落本身，不要任何解释。\n\n${t}`,
  polish: (t) =>
    `请润色下面这段论文文稿，修正语病、优化用词与句式，保持原意与学术语气。只输出润色后的段落本身，不要任何解释。\n\n${t}`,
  shorten: (t) =>
    `请将下面这段论文文稿压缩得更精炼，保留核心信息与论点，保持学术语气。只输出压缩后的段落本身，不要任何解释。\n\n${t}`,
}

// [论文助手定制] 选区改写剥离会话：模块级唯一「编辑 session」，不写任何板块的 sessionID。
// 复用工作区首次创建的独立 session，后续改写请求都走它，避免改写消息混入板块会话的对话流
// （板块会话只承载「生成」相关轮次，选区改写是独立编辑操作，本不该出现在会话记录里）。
let editSessionID: string | null = null

export function StepProductPanel(props: {
  title: string
  status: StepStatus
  progressText?: string
  result?: string
  emptyHint: string
  footer?: JSX.Element
  // [论文助手定制] 可选导出回调：有产物文本且传了回调时，标题栏显示对应导出按钮（Word/PDF）。
  onExportDocx?: () => void
  onExportPdf?: () => void
  // [论文助手定制] 可选自定义产物渲染（如评审报告的结构化展示），默认 Markdown。
  render?: (result: string) => JSX.Element
  // [论文助手定制] 标题栏动作插槽：与状态徽章同一行右侧区渲染（各 step 传入「生成/重新生成」主按钮 +「配置」按钮）。
  titleActions?: JSX.Element
  // [论文助手定制] 文稿文件化：传入步骤名与项目目录后，完成态从项目根目录「<step>.md」文件读取渲染，
  // 生成中仍用流式 progress 实时显示；文件缺失时回退显示 result（与文件内容一致）。
  manuscript?: { directory: string; step: ManuscriptStep }
  // [论文助手定制] 配置面板开合状态 + 切换回调：按钮放在产物标题栏（文稿界面），
  // 而不是配置面板自身头部——面板收起后按钮依然可见，随时可以再展开配置。
  configOpen?: boolean
  onToggleConfig?: () => void
}) {
  // [论文助手定制] 产物区域顶部加「文稿 / 会话」切换：会话视图在同一个位置显示会话聊天记录，
  // 生成过程中可以来回切换看“文稿进度”和“对话过程”。
  // 视图状态放到 workflow store（productView），侧边栏「会话记录」点击后能直接切到右侧会话界面。
  const { state, setProductView, setDisplaySession, setStepResult, setCurrentArtifact, markTurn, consumeTurn } = useThesisWorkflow()
  const sdk = useSDK()
  const sync = useSync()
  // [论文助手定制] 文稿文件化：编辑保存 / 接受建议时落盘到项目根目录 <step>.md（与「存为当前文稿」同一链路）。
  const manuscript = useThesisManuscriptFile(props.manuscript?.directory ?? sdk().directory)
  const view = () => state().productView

  // [论文助手定制] 文稿文件切换：默认查看本板块文稿文件（提纲.md 等），
  // 也可以切到文件空间里其它 .md/.txt 文本文件查看内容。
  const [viewPath, setViewPath] = createSignal<string | null>(null)
  // [论文助手定制] 导出下拉菜单展开状态（统一「导出」按钮：md / word / pdf 三种格式）。
  const [exportMenuOpen, setExportMenuOpen] = createSignal(false)
  const artifactOptions = () =>
    state().artifacts.filter((artifact) => artifact.kind === "scratch" || (props.manuscript && artifact.kind === "step" && artifact.step === props.manuscript.step))
  const currentArtifact = () => {
    const selected = state().currentArtifactID
    if (!selected) return null
    return state().artifacts.find((artifact) => artifact.id === selected) ?? null
  }
  const currentPath = () => {
    const selectedArtifact = currentArtifact()
    if (selectedArtifact?.kind === "scratch") return `docs/${selectedArtifact.fileName}`
    if (selectedArtifact?.kind === "step" && selectedArtifact.step && selectedArtifact.fileName) return selectedArtifact.fileName
    return viewPath() ?? (props.manuscript ? MANUSCRIPT_FILENAMES[props.manuscript.step] : null)
  }
  // [论文助手定制] 独立文档落盘版本号：docs/ 独立文档 saveFile 成功后 bump，并入 fileContent source，
  // 保证独立文档编辑落盘后文稿视图自动重读文件（独立文档没有对应的 step updatedAt）。
  const [docsVersion, setDocsVersion] = createSignal(0)

  // [论文助手定制] 文件下拉条目：合并根目录与 docs/ 目录下的 .md/.txt 文本文件；
  // docs/ 下视为独立文档（independent），下拉展示加 [独立] 前缀，落盘路径保持 docs/<原名>。
  type TextFileEntry = { name: string; path: string; independent: boolean }
  const [textFiles] = createResource(
    () => props.manuscript?.directory ?? null,
    async (directory) => {
      if (!directory) return []
      try {
        // [论文助手定制] 并行列根目录与 docs/（独立文档目录，可能不存在，list 报错按空处理）。
        const [rootRes, docsRes] = await Promise.all([
          sdk().client.file.list({ directory, path: "" }),
          sdk().client.file.list({ directory, path: "docs" }),
        ])
        const toEntry = (node: { name: string }, independent: boolean): TextFileEntry => ({
          name: node.name,
          path: independent ? `docs/${node.name}` : node.name,
          independent,
        })
        const root = (rootRes.data ?? [])
          .filter((node) => node.type === "file" && /\.(md|txt)$/i.test(node.name))
          .map((node) => toEntry(node, false))
        const docs = (docsRes.data ?? [])
          .filter((node) => node.type === "file" && /\.(md|txt)$/i.test(node.name))
          .map((node) => toEntry(node, true))
        return [...root, ...docs].sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))
      } catch {
        return []
      }
    },
  )

  // [论文助手定制] 可编辑路径判定：切到根目录其它 .md/.txt（viewPath 非 docs/）保持只读；
  // 本板块默认文稿（提纲.md 等）或 docs/ 独立文档可进入 Milkdown 编辑器（渲染即编辑）。
  const editablePath = () => {
    if (viewPath()) return viewPath()!.startsWith("docs/") ? viewPath() : null
    return props.manuscript ? MANUSCRIPT_FILENAMES[props.manuscript.step] : null
  }

  // [论文助手定制] 豆包式「自动切到文稿输出」：一次生成中，模型正文（progress）第一次出现时，
  // 如果当前停在「会话」视图，自动切回「文稿」视图，让正文像豆包一样自动落到文稿画布里。
  // 只自动切一次（生成期间用户仍可手动切到会话看对话过程，不会被反复抢走）；下一次生成开始会重置。
  let autoSwitched = false
  createEffect(() => {
    const hasText = (props.progressText ?? "").trim().length > 0
    if (props.status === "generating") {
      if (hasText && view() === "session" && !autoSwitched) {
        autoSwitched = true
        setProductView("document")
        setDisplaySession(null)
      }
    } else {
      autoSwitched = false
    }
  })

  // [论文助手定制] 完成态读文件：source 里带上 updatedAt，落盘（setStepResult 更新 updatedAt）后自动重读，
  // 保证「文稿=文件内容」；文件还没写或读失败时返回 undefined，由渲染处回退 result。
  const [fileContent] = createResource(
    () =>
      props.manuscript && props.status === "done" && currentPath()
        ? `${props.manuscript.directory}\u0000${currentPath()}\u0000${state().steps[props.manuscript.step].updatedAt ?? 0}\u0000${docsVersion()}`
        : undefined,
    async () => {
      const target = props.manuscript
      const path = currentPath()
      if (!target || !path) return undefined
      const res = await sdk().client.file.read({
        directory: target.directory,
        // [论文助手定制] 文件空间合并后文稿在项目根目录（与后端落盘一致）；查看其它文件时按选中路径读。
        path,
      })
      if (res.error || res.data?.type !== "text") return undefined
      return res.data.content
    },
  )

  // [论文助手定制] 文稿正文源：生成中 = result + 流式 progress；完成且有文件 = 文件内容（缺失时回退 result）。
  const manuscriptText = () => {
    if (props.manuscript && props.status === "done") return fileContent() ?? props.result ?? ""
    return [props.result, props.progressText].filter(Boolean).join("\n\n")
  }

  // [论文助手定制] 稳定 cacheKey：生成中固定用「板块名」前缀（Markdown 组件按 key 做增量更新缓存，
  // key 稳定才能复用已渲染块、只更新新增内容，避免每帧全量重解析）；
  // 完成态按全文哈希（内容变了才换 key，保证最终态精确渲染）。
  const stableCacheKey = () => {
    const tag = props.manuscript?.step ?? props.title
    if (props.status === "generating") return `thesis-streaming:${tag}`
    const text = manuscriptText()
    let h = 5381
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
    return `thesis-done:${tag}:${h >>> 0}`
  }

  // [论文助手定制] 导出 Markdown：把当前板块产物文本下载为 .md 文件（与 docx/pdf 导出并存）。
  const exportMarkdown = () => {
    const text = props.result ?? ""
    if (!text.trim()) return
    const name = props.manuscript ? MANUSCRIPT_FILENAMES[props.manuscript.step] : "文稿.md"
    downloadBlob(new Blob([text], { type: "text/markdown;charset=utf-8" }), name)
  }

  // [论文助手定制] 渲染即编辑：无编辑/查看切换，完成态默认直接进入 Milkdown 编辑器。
  // draft 保存编辑器当前内容（Milkdown listener 同步），用于防抖自动保存 / 手动保存。
  const [draft, setDraft] = createSignal<string>("")
  // [论文助手定制] 防抖自动保存：内容变化后 1s 内静默落盘。
  let autoSaveTimer: ReturnType<typeof setTimeout> | undefined
  // [论文助手定制] 保存状态提示：持久化成功后短暂显示「已保存」。
  const [savedAt, setSavedAt] = createSignal(0)
  let savedTimer: ReturnType<typeof setTimeout> | undefined
  // [论文助手定制] 段落级 AI 建议：基于 Milkdown 编辑器选区（ProseMirror doc position）的
  // 改写/扩写/润色/缩短。editorApiRef 供操作条按钮调用编辑器命令（replace/undo/redo）。
  // 选区附带视口坐标（ThesisEditor 在 mouseup/keyup 兜底上报），换算为容器内容坐标后定位悬浮工具栏。
  const [editorSelection, setEditorSelection] = createSignal<ThesisEditorSelection | null>(null)
  // 悬浮工具栏锚点：选区清除后（如点击悬浮按钮失焦）仍保留上次坐标，避免 custom/suggesting 层跳动。
  const [floatAnchor, setFloatAnchor] = createSignal<{ x: number; y: number } | null>(null)
  let editorBoxRef: HTMLDivElement | undefined
  // 悬浮工具栏几何常量（与 JSX 样式保持一致）。
  const TOOLBAR_GAP = 6
  const TOOLBAR_H = 36

  // [论文助手定制] 选区上报处理：把 ThesisEditor 上报的视口坐标换算为编辑器滚动容器的内容坐标
  // （absolute 定位跟随内容滚动，需叠加 scroll 偏移），并做空间翻转与水平 clamp，产出悬浮锚点。
  const handleSelection = (sel: ThesisEditorSelection | null) => {
    if (!sel) {
      setEditorSelection(null)
      return
    }
    if (editorBoxRef) {
      const rect = editorBoxRef.getBoundingClientRect()
      const scrollLeft = editorBoxRef.scrollLeft ?? 0
      const scrollTop = editorBoxRef.scrollTop ?? 0
      const x0 = sel.left - rect.left + scrollLeft
      const clientBottom = sel.bottom - rect.top
      // 选区下方空间不足时翻转到上方。absolute 定位相对滚动容器内容原点（未滚动），
      // 需叠加 scrollTop 才能在滚动后仍贴住选区（视口坐标 → 内容坐标）。
      const flip = clientBottom + TOOLBAR_GAP + TOOLBAR_H > rect.height
      const top = flip
        ? sel.top - rect.top + scrollTop - TOOLBAR_H - TOOLBAR_GAP
        : sel.bottom - rect.top + scrollTop + TOOLBAR_GAP
      // 水平 clamp，避免超出容器可视宽度（custom 输入框更宽，留更大余量）。
      const maxX = Math.max(8, (rect.width || 0) - 460)
      const x = Math.min(Math.max(x0, 8), maxX)
      setFloatAnchor({ x, y: Math.max(top, 8) })
    }
    setEditorSelection(sel)
  }
  const editorApiRef: { current: ThesisEditorApi | undefined } = { current: undefined }
  // historyVersion 只用于驱动撤销/重做按钮禁用态刷新（Solid 不追踪非信号引用变化）。
  const [historyVersion, setHistoryVersion] = createSignal(0)
  // [论文助手定制] 撤销/重做按钮可用态：Solid 不会追踪 editorApiRef.current（普通对象引用），
  // 所以用 historyVersion 作响应式依赖——编辑器就绪、每次编辑/替换/撤销/重做都会 bump 版本号，
  // 触发这两个 memo 重算，按钮禁用态才能实时刷新（否则首次渲染后永远停在初始 disabled 状态）。
  const canUndo = createMemo(() => {
    historyVersion()
    return editorApiRef.current?.canUndo() ?? false
  })
  const canRedo = createMemo(() => {
    historyVersion()
    return editorApiRef.current?.canRedo() ?? false
  })
  const [suggesting, setSuggesting] = createSignal(false)
  const [suggestError, setSuggestError] = createSignal<string | null>(null)
  // [论文助手定制] 撤销浮条：AI 替换完成后短暂显示，点击「撤销」走编辑器 history 回退。
  const [lastReplace, setLastReplace] = createSignal<{ text: string } | null>(null)
  let replaceTimer: ReturnType<typeof setTimeout> | undefined
  // [论文助手定制] 改写/润色的「具体要求」输入框：展开时记录目标操作与用户输入的具体指令，
  // 确认后并入发送给模型的 prompt（扩写/缩短仍是一键直发）。
  const [custom, setCustom] = createSignal<{ kind: "rewrite" | "polish"; prompt: string } | null>(null)
  const [customRef, setCustomRef] = createSignal<HTMLInputElement | undefined>(undefined)

  // [论文助手定制] 清理选区与建议状态（生成中 / 无文稿 / 查看其它文件时调用）。
  // 同时清空草稿与自动保存定时器：避免跨板块/跨文件残留旧草稿导致切走时误保存覆盖文件。
  const resetSuggestionState = () => {
    setEditorSelection(null)
    setFloatAnchor(null)
    setSuggestError(null)
    setCustom(null)
    setLastReplace(null)
    setDraft("")
    clearTimeout(replaceTimer)
    clearTimeout(autoSaveTimer)
  }

  // [论文助手定制] 渲染即编辑重置保护：生成中 / 无可编辑路径 / 查看只读文件（根目录其它 .md/.txt）时
  // 清理选区与建议状态（编辑器随之卸载/暂停，避免残留选中态与撤销浮条导致画布不同步）。
  // 注意：切换到「会话」视图（view 变化）不重置——建议生成期间用户切到会话看输出、
  // 再切回文稿还要能继续「接受/放弃」，清掉会导致画布无法同步更新。
  createEffect(() => {
    if (props.status !== "done" || currentPath() !== editablePath()) {
      resetSuggestionState()
    }
  })

  // [论文助手定制] 编辑内容变化：同步草稿（Milkdown listener 回调）；
  // 每次内容变化 bump 撤销/重做按钮态，并防抖自动保存到文稿文件。
  const handleEditorChange = (markdown: string) => {
    setDraft(markdown)
    setHistoryVersion((v) => v + 1)
    clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(() => void persistDraft({ silent: true }), 1000)
  }

  // [论文助手定制] 离开「文稿」视图（切到会话/其它板块）时，把防抖窗口内未落盘的草稿立即保存，
  // 避免最后 1s 内的改动丢失。
  createEffect(() => {
    if (view() !== "document" && draft() && draft() !== manuscriptText()) {
      void persistDraft({ silent: true })
    }
  })

  // [论文助手定制] 落盘统一入口：按当前可编辑路径分流——
  // docs/ 独立文档走 saveFile（不 setStepResult，bump docsVersion 触发 fileContent 重读）；
  // 板块默认文稿走 manuscript.save + setStepResult（updatedAt 变化触发 fileContent 重读）。
  const saveCurrent = async (text: string) => {
    const path = editablePath()
    if (!path) return
    if (path.startsWith("docs/")) {
      await manuscript.saveFile(path, text)
      setDocsVersion((v) => v + 1)
    } else {
      const step = props.manuscript?.step
      if (!step) return
      await manuscript.save(step, text)
      setStepResult(step, text)
    }
  }

  // [论文助手定制] 保存草稿：写盘到当前文稿文件（板块文稿或 docs/ 独立文档）+ 更新 store
  // （板块文稿 updatedAt / 独立文档 docsVersion 变化后 fileContent 自动重读）。
  // silent 用于自动保存（内容为空时静默跳过不打断编辑）；手动保存时给出 toast 与「已保存」提示。
  const persistDraft = async (opts?: { silent?: boolean }) => {
    const text = draft().trim()
    if (!text) {
      if (!opts?.silent) showToast({ variant: "error", icon: "circle-x", title: "文稿内容为空" })
      return
    }
    await saveCurrent(text)
    setSavedAt(Date.now())
    clearTimeout(savedTimer)
    savedTimer = setTimeout(() => setSavedAt(0), 1500)
    if (!opts?.silent) showToast({ variant: "success", icon: "circle-check", title: "文稿已保存" })
  }

  // [论文助手定制] 段落级 AI 建议：作为独立编辑操作走独立编辑 session（editSessionID，
  // 首次自动创建，之后复用），不读不写任何板块 sessionID，不进板块会话的对话流。
  // customPrompt（可选）：改写/润色时用户在输入框填的具体要求，并入指令一起发给模型。
  const askSuggestion = async (
    kind: "rewrite" | "expand" | "polish" | "shorten",
    customPrompt?: string,
  ) => {
    const sel = editorSelection()
    const step = props.manuscript?.step
    if (!sel || !step) return
    setSuggesting(true)
    setSuggestError(null)
    setCustom(null)
    try {
      // [论文助手定制] 指令 = 预设模板（只输出处理后的段落本身）+ 用户可选的具体要求。
      const instruction = customPrompt?.trim()
        ? `${SUGGESTION_PROMPTS[kind](sel.text)}\n\n额外要求：${customPrompt.trim()}`
        : SUGGESTION_PROMPTS[kind](sel.text)
      // [论文助手定制] 选区改写剥离会话：复用模块级 editSessionID（首次自动创建），
      // 不读不写任何板块的 sessionID——改写是独立编辑操作，不进板块会话的对话流。
      if (!editSessionID) {
        const created = await sdk().api.session.create({ location: { directory: sdk().directory } })
        editSessionID = created.id
      }
      // [论文助手定制] 主动 sync：工作台没打开会话页时，必须 sync 后 SSE 事件才会写入 store，
      // waitForAssistantReply 轮询才能读到回复（与 thesis-generator 一致）。
      await sync().session.sync(editSessionID).catch(() => {})
      const before = (sync().data.session_message[editSessionID] ?? []).length
      markTurn(editSessionID, { target: "selection", artifactID: state().currentArtifactID ?? undefined, selection: sel.text })
      const res = await sdk().client.session.promptAsync({
        sessionID: editSessionID,
        directory: sdk().directory,
        parts: [{ type: "text", text: instruction }],
      })
      if (res.error) throw res.error
      const text = (await waitForAssistantReply(sync, editSessionID, before)).trim()
      consumeTurn(editSessionID)
      if (!text) {
        setSuggestError("模型未返回有效建议，请重试")
        return
      }
      // [论文助手定制] 原地替换：优先交给 Milkdown 编辑器执行（替换选区 + 淡黄高亮 + 撤销浮条），
      // 不展示确认面板，靠 history 撤销兜底。
      // 传入点击时捕获的选区（sel.from/to/text）而不是替换执行时的实时选区：AI 等待期间
      // 选区可能漂移成全选/整篇，用实时选区会把整篇文档替换成改写片段（历史 bug）。
      // 编辑器未就绪（等待期间切到会话视图等导致卸载/重建中）或捕获选区校验失败时，
      // 回退为 Markdown 文本级替换并直接落盘（applySuggestionToManuscript），
      // 保证“会话有输出、画布也同步更新”。
      const api = editorApiRef.current
      if (api && api.replace(text, { from: sel.from, to: sel.to, text: sel.text })) {
        setHistoryVersion((v) => v + 1)
        return
      }
      if (applySuggestionToManuscript(sel.text, text)) {
        showToast({ variant: "success", icon: "circle-check", title: "AI 改写已应用并保存到文稿" })
        return
      }
      setSuggestError("编辑器尚未就绪，且无法自动定位选中文本，请重试")
    } catch (error) {
      setSuggestError(error instanceof Error ? error.message : "请求失败，请重试")
    } finally {
      setSuggesting(false)
    }
  }

  // [论文助手定制] 编辑器不可用时的回退应用：把选中的原文在文稿内容里做文本级替换并落盘。
  // 源取「当前草稿（优先）或文稿文件内容」；替换成功后同步 store（updatedAt 变化触发
  // fileContent 重读），画布与文件空间都会更新，编辑器重建后显示的也是新内容。
  const applySuggestionToManuscript = (selected: string, replacement: string): boolean => {
    const step = props.manuscript?.step
    if (!step || !selected.trim()) return false
    const source = draft() || manuscriptText()
    // [论文助手定制] 先按原样匹配（最常见：选中的就是 Markdown 里的普通文字）；
    // 匹配不到时用「纯文本偏移映射」定位（选中文字在 Markdown 里可能带 #、**、` 等标记），
    // 并把区间向外扩展到紧邻的标记字符，避免替换后残留 ** 或 ` 等半截标记。
    const exact = source.indexOf(selected)
    let start: number
    let end: number
    if (exact !== -1) {
      start = exact
      end = exact + selected.length
    } else {
      const { plain, map } = buildPlainDoc(source)
      const plainIndex = plain.indexOf(selected)
      if (plainIndex === -1) return false
      start = map[plainIndex]!
      end = map[plainIndex + selected.length - 1]! + 1
      while (start > 0 && /[*#`~]/.test(source[start - 1])) start -= 1
      while (end < source.length && /[*#`~]/.test(source[end])) end += 1
    }
    const next = source.slice(0, start) + replacement + source.slice(end)
    setDraft(next)
    // [论文助手定制] 统一走 saveCurrent：独立文档（docs/）落回原文件，板块文稿落盘并同步 store。
    void saveCurrent(next)
    return true
  }

  // [论文助手定制] 改写/润色具体要求输入框展开时自动聚焦，可直接打字回车提交。
  createEffect(() => {
    if (custom()) customRef()?.focus()
  })

  // [论文助手定制] 撤销 / 重做：走 Milkdown 的 prosemirror-history（与编辑器内 Cmd/Ctrl+Z 同一栈）。
  const undoReplace = () => {
    editorApiRef.current?.undo()
    setHistoryVersion((v) => v + 1)
    setLastReplace(null)
    clearTimeout(replaceTimer)
  }
  const redoReplace = () => {
    editorApiRef.current?.redo()
    setHistoryVersion((v) => v + 1)
  }

  // [论文助手定制] 插图渲染：把文稿里的 asset:// 引用与本地相对路径图片统一解析成本机 data URL
  // （复用 thesis-assets 的 resolveMarkdownImages）；文稿文件保存在项目根目录，
  // 相对路径图片以根目录为基准；解析异步完成前先用原文渲染（alt 兜底），避免预览出现空图。
  // 性能优化：仅「完成态」触发一次异步插图解析（生成中文本每帧都在变，解析结果立刻过期，
  // 纯属浪费；生成中直接显示原文 + alt 占位即可），完成态固定后解析一次稳定渲染。
  // 竞态保护：done 态文本连续变化时用版本号丢弃过期的异步解析结果，避免显示旧内容。
  const [resolvedText, setResolvedText] = createSignal<string | undefined>(undefined)
  let resolveVersion = 0
  createEffect(() => {
    const text = manuscriptText()
    const directory = props.manuscript?.directory
    setResolvedText(text)
    if (!text || !directory) return
    if (props.status !== "done") return
    const version = ++resolveVersion
    void resolveMarkdownImages(sdk(), directory, "", text).then((next) => {
      if (version === resolveVersion && next !== text) setResolvedText(next)
    })
  })

  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-[10px] bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]">
      <div class="flex shrink-0 items-center gap-2 px-3 py-2">
        <span class="text-13-medium text-v2-text-text-base">{props.title}</span>
        <span class="ml-auto">
          <Show
            when={props.status === "done"}
            fallback={
              <Show
                when={props.status === "generating"}
                fallback={<span class="rounded-full bg-v2-background-bg-layer-01 px-2 py-0.5 text-10-medium text-v2-text-text-faint">待生成</span>}
              >
                <span class="rounded-full bg-v2-state-bg-info px-2 py-0.5 text-10-medium text-v2-text-text-accent">生成中…</span>
              </Show>
            }
          >
            <span class="flex items-center gap-1 rounded-full bg-v2-state-bg-info px-2 py-0.5 text-10-medium text-v2-text-text-accent">
              <Icon name="circle-check" size="small" /> 已完成
            </span>
          </Show>
        </span>
        {/* [论文助手定制] 标题栏动作插槽：与状态徽章同一行右侧区，保持 shrink-0。
            各 step 传「生成/重新生成」主按钮 +「配置」按钮（配置面板浮窗化的高频入口）。 */}
        <Show when={props.titleActions}>
          <div class="flex shrink-0 items-center gap-2">{props.titleActions}</div>
        </Show>
        {/* [论文助手定制] 统一「导出」下拉：Markdown（下载）/ Word / PDF（走各板块导出回调）。 */}
        <Show when={(props.onExportDocx || props.onExportPdf) && props.result && props.status === "done"}>
          <DropdownMenu
            gutter={4}
            placement="bottom-end"
            open={exportMenuOpen()}
            onOpenChange={(open) => setExportMenuOpen(open)}
          >
            <DropdownMenu.Trigger
              as={Button}
              type="button"
              variant="secondary"
              size="small"
              icon="download"
              aria-label="导出"
            >
              导出
              <Icon name="chevron-down" size="small" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content style={{ "min-width": "140px" }}>
                <DropdownMenu.Item onSelect={() => exportMarkdown()}>
                  <DropdownMenu.ItemLabel>Markdown（.md）</DropdownMenu.ItemLabel>
                </DropdownMenu.Item>
                <Show when={props.onExportDocx}>
                  <DropdownMenu.Item onSelect={() => props.onExportDocx?.()}>
                    <DropdownMenu.ItemLabel>Word（.docx）</DropdownMenu.ItemLabel>
                  </DropdownMenu.Item>
                </Show>
                <Show when={props.onExportPdf}>
                  <DropdownMenu.Item onSelect={() => props.onExportPdf?.()}>
                    <DropdownMenu.ItemLabel>PDF</DropdownMenu.ItemLabel>
                  </DropdownMenu.Item>
                </Show>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu>
        </Show>
        {/* [论文助手定制] 文稿文件切换：默认当前板块文稿文件（提纲.md 等），
            可切换到文件空间里其它 .md/.txt 文本文件查看内容（docs/ 独立文档可编辑，其余只读）。
            编辑态隐藏。 */}
        <Show when={artifactOptions().length > 0}>
          <select
            class="h-7 w-44 shrink-0 rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-1.5 text-11-regular text-v2-text-text-base focus:outline-none"
            value={state().currentArtifactID ?? ""}
            onChange={(event) => {
              const next = event.currentTarget.value || null
              setCurrentArtifact(next)
              setViewPath(null)
            }}
          >
            <For each={artifactOptions()}>
              {(artifact) => (
                <option value={artifact.id}>
                  {artifact.kind === "scratch" ? `[独立] ${artifact.title}` : artifact.title}
                </option>
              )}
            </For>
          </select>
        </Show>
        <Show when={props.manuscript && textFiles() && textFiles()!.length > 0}>
          <select
            class="h-7 w-44 shrink-0 rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-1.5 text-11-regular text-v2-text-text-base focus:outline-none"
            value={viewPath() ?? currentPath() ?? ""}
            onChange={(event) => {
              setViewPath(event.currentTarget.value || null)
              if (state().currentArtifactID) setCurrentArtifact(null)
            }}
          >
            <For each={textFiles()}>
              {(node) => (
                <option value={node.path}>
                  {node.independent ? `[独立] ${node.name}` : node.name}
                </option>
              )}
            </For>
          </select>
        </Show>
        {/* [论文助手定制] 渲染即编辑：不再有「编辑」按钮——完成态默认就是 Milkdown 编辑器，
            选中文字直接出 AI 操作条；文件切换（查看文件空间其它文本）时切换为只读渲染。 */}
        {/* [论文助手定制] 文稿 / 会话切换按钮；没有会话前「会话」不可点。 */}
        <div class="flex shrink-0 items-center gap-0.5 rounded-md bg-v2-background-bg-layer-01 p-0.5">
          <button
            type="button"
            class="cursor-pointer rounded px-2 py-1 text-12-medium transition-colors"
            classList={{
              "bg-v2-background-bg-base text-v2-text-text-accent shadow-[var(--v2-elevation-raised)]": view() === "document",
              "text-v2-text-text-muted hover:text-v2-text-text-base": view() !== "document",
            }}
            onClick={() => {
              setProductView("document")
              setDisplaySession(null)
            }}
          >
            文稿
          </button>
          <button
            type="button"
            class="cursor-pointer rounded px-2 py-1 text-12-medium transition-colors"
            classList={{
              "bg-v2-background-bg-base text-v2-text-text-accent shadow-[var(--v2-elevation-raised)]": view() === "session",
              "text-v2-text-text-muted hover:text-v2-text-text-base": view() !== "session",
            }}
            onClick={() => {
              setProductView("session")
              setDisplaySession(null)
            }}
          >
            会话
          </button>
        </div>
        {/* [论文助手定制] 配置入口已移到侧边栏顶部，不再在产物标题栏重复出现；
            这样配置始终与左侧面板的层级一致，且收起状态不再留下额外占位。 */}
      </div>
      <Show
        when={view() !== "session"}
        fallback={<div class="min-h-0 flex-1 overflow-hidden"><ThesisSessionView /></div>}
      >
        <div class="min-h-0 flex-1 overflow-y-auto">
          {/* [论文助手定制] 渲染即编辑：完成态且当前路径可编辑（本板块默认文稿 或 docs/ 独立文档）、
              且该板块未用自定义渲染（render）时，直接渲染 Milkdown 编辑器（无编辑/查看切换，
              选中文字即出 AI 操作条）；否则走原有 Markdown / 自定义渲染逻辑（原逻辑整体保留，
              根目录其它 .md/.txt 只读渲染）。 */}
          <Show
            when={props.status === "done" && editablePath() && !props.render}
            fallback={
              <Show
                when={props.status !== "idle"}
                fallback={
                  <div class="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                    <Icon name="pencil-line" size="large" class="text-v2-text-text-faint" />
                    <div class="text-12-regular text-v2-text-text-faint">{props.emptyHint}</div>
                  </div>
                }
              >
                {/* [论文助手定制] 生成中且还没有任何文本：显示“等待输出”占位（不再是全屏“模型生成中请稍候”转圈），
                    模型正文一出现就会走下面的 Markdown 流式渲染，看起来就像自动落到文稿画布。 */}
                <Show
                  when={props.status === "generating" && !manuscriptText()}
                  fallback={
                    <div class="mx-auto w-full max-w-3xl px-5 py-5">
                      <Show when={props.render} fallback={
                        <>
                          {/* [论文助手定制] 边生成边显示：result（上次完成的全文）+ progress（本次正在生成的文本）拼接渲染；
                              生成中 streaming=true（Markdown 增量渲染，只解析新增块）+ 稳定 cacheKey（复用已渲染块），
                              避免每帧全量重解析卡顿；完成态再解析 asset:// 插图为本机 data URL。 */}
                          <Markdown
                            text={resolvedText() ?? manuscriptText()}
                            cacheKey={stableCacheKey()}
                            streaming={props.status === "generating"}
                            class="thesis-markdown-preview"
                            style={{ "font-size": "15px", "line-height": "1.8" }}
                          />
                        </>
                      }>
                        {props.render!(manuscriptText())}
                      </Show>
                    </div>
                  }
                >
                  <div class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                    <span class="size-3 animate-spin rounded-full border-2 border-v2-border-border-focus border-t-transparent" />
                    <div class="text-12-regular text-v2-text-text-faint">
                      模型正在输出…
                    </div>
                  </div>
                </Show>
              </Show>
            }
          >
            <div class="mx-auto flex h-full w-full max-w-3xl flex-col px-5 py-4">
              {/* [论文助手定制] Milkdown 编辑器：WYSIWYG「渲染即编辑」，无外框、内容铺满。
                  作为悬浮工具栏的定位容器（relative），选区坐标换算后以 absolute 定位弹出。 */}
              <div ref={editorBoxRef} class="thesis-editor-root relative min-h-0 flex-1 overflow-y-auto">
                <ThesisEditor
                  initialMd={manuscriptText()}
                  onMdChange={handleEditorChange}
                  onSelectionChange={handleSelection}
                  onReady={() => setHistoryVersion((v) => v + 1)}
                  onReplaced={(rec) => {
                    setLastReplace({ text: rec.text })
                    clearTimeout(replaceTimer)
                    replaceTimer = setTimeout(() => setLastReplace(null), 5000)
                  }}
                  apiRef={editorApiRef}
                />
                {/* [论文助手定制] 悬浮 AI 工具栏：选中文本后在选区附近弹出（豆包范式，位于选区下方，
                    空间不足时翻转到上方）。改写/润色展开「具体要求」输入框，扩写/缩短一键直发；
                    建议生成中 / 出错同样在本浮层反馈，不占用底部操作区。 */}
                <Show when={editorSelection() && !custom() && !suggesting()}>
                  <div
                    class="absolute z-50 flex items-center gap-0.5 rounded-[10px] border border-v2-border-border-base bg-v2-background-bg-layer-02 px-1.5 py-1 shadow-[0_6px_20px_rgba(0,0,0,0.14)]"
                    style={{ left: `${floatAnchor()?.x ?? 8}px`, top: `${floatAnchor()?.y ?? 8}px` }}
                  >
                    <Button type="button" variant="ghost" size="small" onClick={() => setCustom({ kind: "rewrite", prompt: "" })}>
                      改写
                    </Button>
                    <Button type="button" variant="ghost" size="small" onClick={() => void askSuggestion("expand")}>
                      扩写
                    </Button>
                    <Button type="button" variant="ghost" size="small" onClick={() => setCustom({ kind: "polish", prompt: "" })}>
                      润色
                    </Button>
                    <Button type="button" variant="ghost" size="small" onClick={() => void askSuggestion("shorten")}>
                      缩短
                    </Button>
                  </div>
                </Show>
                {/* [论文助手定制] 改写/润色的「具体要求」输入框（悬浮）：输入后回车或点「生成」提交，并入指令发给模型。 */}
                <Show when={custom()}>
                  <div
                    class="absolute z-50 flex items-center gap-1.5 rounded-[10px] border border-v2-border-border-base bg-v2-background-bg-layer-02 px-2 py-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.14)]"
                    style={{ left: `${floatAnchor()?.x ?? 8}px`, top: `${floatAnchor()?.y ?? 8}px` }}
                  >
                    <input
                      ref={(el) => setCustomRef(el)}
                      value={custom()!.prompt}
                      onInput={(e) => setCustom({ kind: custom()!.kind, prompt: e.currentTarget.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const c = custom()!
                          void askSuggestion(c.kind, c.prompt)
                        }
                      }}
                      placeholder={
                        custom()!.kind === "rewrite"
                          ? "输入改写要求，如：改成更口语化的表达"
                          : "输入润色要求，如：语气更正式、精简重复表述"
                      }
                      class="h-8 w-72 shrink-0 rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-12-regular text-v2-text-text-base placeholder:text-v2-text-text-faint focus:outline-none"
                    />
                    <Button
                      type="button"
                      variant="primary"
                      size="small"
                      onClick={() => {
                        const c = custom()!
                        void askSuggestion(c.kind, c.prompt)
                      }}
                    >
                      生成
                    </Button>
                    <Button type="button" variant="ghost" size="small" onClick={() => setCustom(null)}>
                      取消
                    </Button>
                  </div>
                </Show>
                <Show when={suggesting()}>
                  <div
                    class="absolute z-50 flex items-center gap-1.5 rounded-[10px] border border-v2-border-border-base bg-v2-background-bg-layer-02 px-3 py-1.5 text-12-regular text-v2-text-text-faint shadow-[0_6px_20px_rgba(0,0,0,0.14)]"
                    style={{ left: `${floatAnchor()?.x ?? 8}px`, top: `${floatAnchor()?.y ?? 8}px` }}
                  >
                    <span class="size-3 animate-spin rounded-full border-2 border-v2-border-border-focus border-t-transparent" />
                    AI编辑中…
                  </div>
                </Show>
                <Show when={suggestError()}>
                  <div
                    class="absolute z-50 flex max-w-[min(420px,100%)] items-center gap-2 rounded-[10px] border border-v2-border-border-error bg-v2-background-bg-layer-02 px-3 py-1.5 text-12-regular text-v2-text-text-error shadow-[0_6px_20px_rgba(0,0,0,0.14)]"
                    style={{ left: `${floatAnchor()?.x ?? 8}px`, top: `${floatAnchor()?.y ?? 8}px` }}
                  >
                    <span class="truncate">{suggestError()}</span>
                    <Button type="button" variant="ghost" size="small" onClick={() => setSuggestError(null)}>
                      关闭
                    </Button>
                  </div>
                </Show>
              </div>
              {/* [论文助手定制] 撤销浮条：AI 替换完成后短暂显示，可点「撤销」或按 Cmd/Ctrl+Z 回退。 */}
              <Show when={lastReplace()}>
                <div class="mt-2 flex shrink-0 items-center gap-2 rounded-[10px] border border-v2-border-border-base bg-v2-background-bg-layer-01 px-3 py-2">
                  <span class="min-w-0 flex-1 truncate text-12-regular text-v2-text-text-base">
                    已用 AI 改写选中文本
                  </span>
                  <Button type="button" variant="primary" size="small" onClick={() => undoReplace()}>
                    撤销
                  </Button>
                </div>
              </Show>
              <div class="mt-2 flex shrink-0 items-center gap-2">
                {/* [论文助手定制] 撤销 / 重做按钮：常驻显示，无可撤销/重做记录时禁用。
                    撤销 = ⬅ 弯曲箭头（arrow-undo-down），重做 = 同一图标水平镜像。
                    对应快捷键 Cmd/Ctrl+Z 与 Cmd/Ctrl+Shift+Z（或 Cmd/Ctrl+Y），
                    与编辑器内 prosemirror-history 共用同一栈。 */}
                <div class="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="small"
                    disabled={!canUndo()}
                    onClick={() => undoReplace()}
                    title="撤销 (Cmd/Ctrl+Z)"
                  >
                    <Icon name="arrow-undo-down" size="small" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="small"
                    disabled={!canRedo()}
                    onClick={() => redoReplace()}
                    title="重做 (Cmd/Ctrl+Shift+Z)"
                  >
                    <Icon name="arrow-undo-down" size="small" class="scale-x-[-1]" />
                  </Button>
                </div>
                {/* [论文助手定制] 右侧：已保存状态 + 手动保存按钮（内容也会 1s 防抖自动保存）。 */}
                <div class="ml-auto flex items-center gap-2">
                  <Show when={savedAt()}>
                    <span class="text-11-regular text-v2-text-text-faint">已保存</span>
                  </Show>
                  <Button type="button" variant="primary" size="small" onClick={() => void persistDraft()}>
                    保存
                  </Button>
                </div>
              </div>
            </div>
          </Show>
        </div>
        <Show when={props.footer}>
          <div class="flex shrink-0 items-center justify-end gap-2 border-t border-v2-border-border-base px-3 py-2">{props.footer}</div>
        </Show>
      </Show>
    </div>
  )
}

// [论文助手定制] 方案 B（去线性化）：输入材料来源选择（auto / manual / none），
// 写作 / 排版 / 评审 三个下游模块共用。不再强制依赖前一步产物：
// - auto：自动引用其他模块的产物（有则用，没有则在提示词里提示）；
// - manual：手动粘贴内容；
// - none：不用（按通用模板生成）。
export function InputSourceSelect(props: {
  label: string
  value: InputSource
  onChange: (value: InputSource) => void
  autoLabel: string
  manualLabel: string
  noneLabel: string
  // [论文助手定制] 是否显示「从文件空间选择文件」选项（排版模块用）+ 对应文案。
  showFile?: boolean
  fileLabel?: string
}) {
  return (
    <section data-action="thesis-input-source" class="flex flex-col gap-1.5">
      <div class="text-12-medium text-v2-text-text-base">{props.label}</div>
      <select
        class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value as InputSource)}
      >
        <option value="auto">{props.autoLabel}</option>
        <option value="manual">{props.manualLabel}</option>
        <Show when={props.showFile}>
          <option value="file">{props.fileLabel ?? "从文件空间选择文件"}</option>
        </Show>
        <option value="none">{props.noneLabel}</option>
      </select>
    </section>
  )
}
