// [论文助手定制] 论文工作台各步骤共用的布局组件：
// 左侧“输入表单” + 右侧“产物面板”，产物用 Markdown 渲染。
import { Button } from "@opencode-ai/ui/button"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { CheckboxV2 } from "@opencode-ai/ui/v2/checkbox-v2"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { PromptInputV2SkillsMenu } from "@opencode-ai/session-ui/v2/prompt-input"
import { createEffect, createResource, createSignal, For, Show, type JSX } from "solid-js"
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
import { showToast } from "@/utils/toast"

// [论文助手定制] 生成提示词里的工具约束文本：随配置面板「生成时允许使用工具」开关变化。
// 开启时允许模型按需调用工具（脚本型 Skill 需要执行脚本/读文件）；
// 关闭时严禁调用任何工具，保证纯文本流式输出（默认）。
export const promptToolRestriction = (useTools: boolean): string =>
  useTools
    ? "允许在必要时调用工具（如读取文件、执行脚本）完成任务，但工具调用本身不要以 <tool_calls> 等 XML 形式出现在最终结果中；"
    : "严禁调用任何工具、skill、文件读取或外部命令，不要输出 <tool_calls> 等 XML 标记；"

export function StepLayout(props: { form: JSX.Element; product: JSX.Element }) {
  // [论文助手定制] 可拖拽布局：左侧「输入表单」宽度可拖拽调整（默认 340，范围 240~560，
  // localStorage 记住），右侧「产物」面板自动占满剩余空间。
  const formWidth = usePersistentWidth("thesis-workbench.formWidth", 340)
  return (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-2 md:flex-row">
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
}) {
  return (
    <div class="flex h-full min-h-0 flex-col gap-3 overflow-y-auto rounded-[10px] bg-v2-background-bg-base p-3 shadow-[var(--v2-elevation-raised)]">
      <div>
        <Show when={props.stepLabel}>
          <div class="text-11-regular text-v2-text-text-accent">{props.stepLabel}</div>
        </Show>
        <div class="text-14-medium text-v2-text-text-base">{props.title}</div>
        <Show when={props.subtitle}>
          <div class="text-12-regular text-v2-text-text-faint">{props.subtitle}</div>
        </Show>
      </div>
      {/* [论文助手定制] 修复按钮重叠：配置内容超高时必须在自己区域内滚动（overflow-y-auto），
          否则内容会溢出到下方 footer（生成/下一步按钮）区域，视觉上与按钮重叠。 */}
      <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">{props.children}</div>
      <Show when={props.footer}>{props.footer}</Show>
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
  // [论文助手定制] 文稿文件化：传入步骤名与项目目录后，完成态从项目根目录「<step>.md」文件读取渲染，
  // 生成中仍用流式 progress 实时显示；文件缺失时回退显示 result（与文件内容一致）。
  manuscript?: { directory: string; step: ManuscriptStep }
}) {
  // [论文助手定制] 产物区域顶部加「文稿 / 会话」切换：会话视图在同一个位置显示会话聊天记录，
  // 生成过程中可以来回切换看“文稿进度”和“对话过程”。
  // 视图状态放到 workflow store（productView），侧边栏「会话记录」点击后能直接切到右侧会话界面。
  const { state, setProductView, setDisplaySession, setStepResult, setStepSessionID } = useThesisWorkflow()
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
  const currentPath = () =>
    viewPath() ?? (props.manuscript ? MANUSCRIPT_FILENAMES[props.manuscript.step] : null)
  const [textFiles] = createResource(
    () => props.manuscript?.directory ?? null,
    async (directory) => {
      if (!directory) return []
      try {
        const res = await sdk().client.file.list({ directory, path: "" })
        return (res.data ?? [])
          .filter((node) => node.type === "file" && /\.(md|txt)$/i.test(node.name))
          .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))
      } catch {
        return []
      }
    },
  )

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
        ? `${props.manuscript.directory}\u0000${currentPath()}\u0000${state().steps[props.manuscript.step].updatedAt ?? 0}`
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

  // [论文助手定制] 导出 Markdown：把当前板块产物文本下载为 .md 文件（与 docx/pdf 导出并存）。
  const exportMarkdown = () => {
    const text = props.result ?? ""
    if (!text.trim()) return
    const name = props.manuscript ? MANUSCRIPT_FILENAMES[props.manuscript.step] : "文稿.md"
    downloadBlob(new Blob([text], { type: "text/markdown;charset=utf-8" }), name)
  }

  // [论文助手定制] 可编辑文稿：编辑/预览切换 + 保存落盘。
  const [editing, setEditing] = createSignal(false)
  const [draft, setDraft] = createSignal<string>("")
  const [editorRef, setEditorRef] = createSignal<HTMLTextAreaElement | undefined>(undefined)
  // [论文助手定制] 段落级 AI 建议：基于 textarea 选区的改写/扩写/润色/缩短。
  const [selection, setSelection] = createSignal<{ start: number; end: number; text: string } | null>(null)
  const [suggesting, setSuggesting] = createSignal(false)
  const [suggestion, setSuggestion] = createSignal<{ text: string } | null>(null)
  const [suggestError, setSuggestError] = createSignal<string | null>(null)
  // [论文助手定制] 改写/润色的「具体要求」输入框：展开时记录目标操作与用户输入的具体指令，
  // 确认后并入发送给模型的 prompt（扩写/缩短仍是一键直发）。
  const [custom, setCustom] = createSignal<{ kind: "rewrite" | "polish"; prompt: string } | null>(null)
  const [customRef, setCustomRef] = createSignal<HTMLInputElement | undefined>(undefined)

  // [论文助手定制] 进入/退出编辑的公共逻辑：进入时用当前文稿做初稿，退出时丢弃草稿并清空建议状态。
  const enterEditing = () => {
    setDraft(manuscriptText())
    setEditing(true)
  }
  const exitEditing = () => {
    setEditing(false)
    setDraft("")
    setSuggestion(null)
    setSelection(null)
    setSuggestError(null)
    setCustom(null)
  }

  // [论文助手定制] 编辑态重置保护：生成中 / 无文稿文件 / 查看其它文件（非本板块默认文稿）时
  // 自动退出编辑并清建议状态，避免切换步骤/板块/文件后残留编辑态导致误写。
  // 注意：切换到「会话」视图（view 变化）不重置——建议生成期间用户切到会话看输出、
  // 再切回文稿还要能继续「接受/放弃」，清掉会导致画布无法同步更新。
  createEffect(() => {
    if (
      props.status !== "done" ||
      !props.manuscript ||
      currentPath() !== MANUSCRIPT_FILENAMES[props.manuscript.step]
    ) {
      if (editing()) exitEditing()
    }
  })

  // [论文助手定制] 选区捕获：textarea onSelect 时根据光标位置提取选中文本（无有效选区时为 null）。
  const handleSelect = () => {
    const el = editorRef()
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const text = draft().slice(start, end)
    setSelection(start < end && text.trim() ? { start, end, text } : null)
  }
  // [论文助手定制] 编辑内容变化：更新草稿；选区若已超出新内容长度则视为失效清空。
  const handleInput = (event: Event) => {
    const value = (event.currentTarget as HTMLTextAreaElement).value
    setDraft(value)
    const sel = selection()
    if (sel && sel.end > value.length) setSelection(null)
  }

  // [论文助手定制] 保存草稿：先落盘到文稿文件再更新 store result（updatedAt 变更后 fileContent 自动重读），
  // 随后切回预览；内容为空时提示并不保存。
  const saveDraft = async () => {
    const text = draft().trim()
    if (!text) {
      showToast({ variant: "error", icon: "circle-x", title: "文稿内容为空" })
      return
    }
    if (!props.manuscript) return
    await manuscript.save(props.manuscript.step, text)
    setStepResult(props.manuscript.step, text)
    exitEditing()
    showToast({ variant: "success", icon: "circle-check", title: "文稿已保存" })
  }

  // [论文助手定制] 段落级 AI 建议：复用板块专属会话发送指令 prompt 并同步拿回复；
  // 无板块会话时自动创建；回复无效时按「未返回有效建议」处理。
  // customPrompt（可选）：改写/润色时用户在输入框填的具体要求，并入指令一起发给模型。
  const askSuggestion = async (
    kind: "rewrite" | "expand" | "polish" | "shorten",
    customPrompt?: string,
  ) => {
    const sel = selection()
    const step = props.manuscript?.step
    if (!sel || !step) return
    setSuggesting(true)
    setSuggestError(null)
    setSuggestion(null)
    setCustom(null)
    try {
      // [论文助手定制] 指令 = 预设模板（只输出处理后的段落本身）+ 用户可选的具体要求。
      const instruction = customPrompt?.trim()
        ? `${SUGGESTION_PROMPTS[kind](sel.text)}\n\n额外要求：${customPrompt.trim()}`
        : SUGGESTION_PROMPTS[kind](sel.text)
      // [论文助手定制] 无板块专属会话时自动创建并写回 store（与 thesis-generator 同一链路），
      // 用户不需要先手动对话一次才能用段落建议。
      let sessionId = state().steps[step].sessionID
      if (!sessionId) {
        const created = await sdk().api.session.create({ location: { directory: sdk().directory } })
        sessionId = created.id
        setStepSessionID(step, sessionId)
      }
      // [论文助手定制] 主动 sync：工作台没打开会话页时，必须 sync 后 SSE 事件才会写入 store，
      // waitForAssistantReply 轮询才能读到回复（与 thesis-generator 一致）。
      await sync().session.sync(sessionId).catch(() => {})
      const before = (sync().data.session_message[sessionId] ?? []).length
      const res = await sdk().client.session.promptAsync({
        sessionID: sessionId,
        directory: sdk().directory,
        parts: [{ type: "text", text: instruction }],
      })
      if (res.error) throw res.error
      const text = (await waitForAssistantReply(sync, sessionId, before)).trim()
      if (!text) {
        setSuggestError("模型未返回有效建议，请重试")
        return
      }
      setSuggestion({ text })
    } catch (error) {
      setSuggestError(error instanceof Error ? error.message : "请求失败，请重试")
    } finally {
      setSuggesting(false)
    }
  }

  // [论文助手定制] 改写/润色具体要求输入框展开时自动聚焦，可直接打字回车提交。
  createEffect(() => {
    if (custom()) customRef()?.focus()
  })

  // [论文助手定制] 接受建议：用建议文本替换选中段、落盘并更新 store result，然后切回预览（可再次编辑）。
  const acceptSuggestion = async () => {
    const sel = selection()
    const sug = suggestion()
    if (!sel || !sug || !props.manuscript) return
    const current = draft()
    const next = current.slice(0, sel.start) + sug.text + current.slice(sel.end)
    setDraft(next)
    setSuggestion(null)
    setSelection(null)
    await manuscript.save(props.manuscript.step, next.trim() ? next : current)
    setStepResult(props.manuscript.step, next.trim() ? next : current)
    showToast({ variant: "success", icon: "circle-check", title: "已应用 AI 建议并保存" })
    exitEditing()
  }

  // [论文助手定制] 插图渲染：把文稿里的 asset:// 引用与本地相对路径图片统一解析成本机 data URL
  // （复用 thesis-assets 的 resolveMarkdownImages）；文稿文件保存在项目根目录，
  // 相对路径图片以根目录为基准；解析异步完成前先用原文渲染（alt 兜底），避免预览出现空图。
  // 竞态保护：生成/切换步骤时文本会连续变化，用版本号丢弃过期的异步解析结果，避免显示旧内容。
  const [resolvedText, setResolvedText] = createSignal<string | undefined>(undefined)
  let resolveVersion = 0
  createEffect(() => {
    const version = ++resolveVersion
    const text = manuscriptText()
    const directory = props.manuscript?.directory
    setResolvedText(text)
    if (!text || !directory) return
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
        {/* [论文助手定制] 统一「导出」下拉：Markdown（下载）/ Word / PDF（走各板块导出回调）。编辑态隐藏。 */}
        <Show when={!editing() && (props.onExportDocx || props.onExportPdf) && props.result && props.status === "done"}>
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
            可切换到文件空间里其它 .md/.txt 文本文件查看内容。编辑态隐藏。 */}
        <Show when={!editing() && props.manuscript && textFiles() && textFiles()!.length > 0}>
          <select
            class="h-7 w-40 shrink-0 rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-1.5 text-11-regular text-v2-text-text-base focus:outline-none"
            value={currentPath() ?? ""}
            onChange={(event) => setViewPath(event.currentTarget.value || null)}
          >
            <For each={textFiles()}>
              {(node) => <option value={node.name}>{node.name}</option>}
            </For>
          </select>
        </Show>
        {/* [论文助手定制] 可编辑文稿「编辑/取消」按钮：仅完成态、查看本板块默认文稿文件时显示；
            生成中不可编辑，查看其它文件不可编辑。编辑态下顶部只保留「取消」，保存按钮在内容区底部。 */}
        <Show when={view() === "document" && props.manuscript && props.status === "done" && !viewPath()}>
          {editing() ? (
            <Button type="button" variant="ghost" size="small" onClick={() => exitEditing()}>
              取消
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="small" icon="pencil-line" onClick={() => enterEditing()}>
              编辑
            </Button>
          )}
        </Show>
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
      </div>
      <Show
        when={view() !== "session"}
        fallback={<div class="min-h-0 flex-1 overflow-hidden"><ThesisSessionView /></div>}
      >
        <div class="min-h-0 flex-1 overflow-y-auto">
          {/* [论文助手定制] 可编辑文稿：完成态且编辑模式下渲染编辑 UI（textarea + 段落级 AI 建议），
              否则走原有 Markdown 渲染逻辑（原逻辑整体保留）。 */}
          <Show
            when={props.status === "done" && editing()}
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
                              完成态再解析 asset:// 插图为本机 data URL。 */}
                          <Markdown
                            text={resolvedText() ?? manuscriptText()}
                            cacheKey={`${manuscriptText()}`}
                            class="thesis-markdown-preview"
                            style={{ "font-size": "15px", "line-height": "1.8" }}
                          />
                          {/* [论文助手定制] 完成态提示：只在查看本板块默认文稿文件时显示保存位置；
                              切换到文件空间其它文件查看时隐藏（避免误导）。 */}
                          <Show when={props.manuscript && props.status === "done" && !viewPath()}>
                            <div class="mt-2 flex items-center gap-1 text-11-regular text-v2-text-text-faint">
                              <Icon name="open-file" size="small" class="shrink-0" />
                              已保存到 {MANUSCRIPT_FILENAMES[props.manuscript!.step]}（文件空间）
                            </div>
                          </Show>
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
                      模型正在输出，正文会实时显示在这里…
                    </div>
                  </div>
                </Show>
              </Show>
            }
          >
            <div class="mx-auto flex h-full w-full max-w-3xl flex-col px-5 py-4">
              <textarea
                ref={(el) => setEditorRef(el)}
                value={draft()}
                onInput={handleInput}
                onSelect={handleSelect}
                spellcheck={false}
                class="min-h-0 flex-1 resize-none rounded-[10px] border border-v2-border-border-base bg-v2-background-bg-base p-4 text-14-regular leading-relaxed text-v2-text-text-base focus:outline-none"
              />
              {/* [论文助手定制] 建议面板：原文（截断）+ AI 建议正文（可滚动），接受替换选中段或放弃。 */}
              <Show when={suggestion()}>
                <div class="mt-2 flex shrink-0 flex-col gap-2 rounded-[10px] border border-v2-border-border-base bg-v2-background-bg-layer-01 p-3">
                  <div>
                    <div class="text-11-medium text-v2-text-text-faint">原文</div>
                    <div class="mt-0.5 max-h-20 overflow-hidden text-12-regular text-v2-text-text-muted">
                      {selection()?.text ?? ""}
                    </div>
                  </div>
                  <div>
                    <div class="text-11-medium text-v2-text-text-faint">AI 建议</div>
                    <div class="mt-0.5 max-h-40 overflow-y-auto whitespace-pre-wrap text-13-regular text-v2-text-text-base">
                      {suggestion()!.text}
                    </div>
                  </div>
                  <div class="flex items-center justify-end gap-2">
                    <Button type="button" variant="secondary" size="small" onClick={() => setSuggestion(null)}>
                      放弃
                    </Button>
                    <Button type="button" variant="primary" size="small" onClick={() => void acceptSuggestion()}>
                      接受
                    </Button>
                  </div>
                </div>
              </Show>
              <div class="mt-2 flex shrink-0 items-center gap-2">
                {/* [论文助手定制] 段落级 AI 建议操作条：无选中文本时不显示。
                    改写/润色先展开「具体要求」输入框（可填自定义指令再生成），
                    扩写/缩短一键直发。 */}
                <Show when={selection() && !suggesting() && !suggestion() && !custom()}>
                  <div class="flex items-center gap-1">
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
                {/* [论文助手定制] 改写/润色的「具体要求」输入框：输入后回车或点「生成」提交，并入指令发给模型。 */}
                <Show when={custom()}>
                  <div class="flex min-w-0 items-center gap-1.5">
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
                  <div class="flex items-center gap-1.5 text-12-regular text-v2-text-text-faint">
                    <span class="size-3 animate-spin rounded-full border-2 border-v2-border-border-focus border-t-transparent" />
                    生成建议中…
                  </div>
                </Show>
                <Show when={suggestError()}>
                  <div class="flex min-w-0 items-center gap-2 text-12-regular text-v2-text-text-error">
                    <span class="truncate">{suggestError()}</span>
                    <Button type="button" variant="ghost" size="small" onClick={() => setSuggestError(null)}>
                      关闭
                    </Button>
                  </div>
                </Show>
                {/* [论文助手定制] 右侧：保存 / 取消。 */}
                <div class="ml-auto flex items-center gap-2">
                  <Button type="button" variant="secondary" size="small" onClick={() => exitEditing()}>
                    取消
                  </Button>
                  <Button type="button" variant="primary" size="small" onClick={() => void saveDraft()}>
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
