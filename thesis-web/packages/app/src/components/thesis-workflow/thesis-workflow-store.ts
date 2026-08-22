// [论文助手定制] 论文工作流状态 store（论文工作台的数据主体）。
// 核心转变：不再以“聊天会话”为主体，而是以“论文项目 + 四个独立模块”为主体。
// 方案 B（去线性化）：四步互相独立——不再要求“第一步做完才能做第二步”，
// 每个模块有自己的 输入配置 / 状态 / 产物文本 / 专属会话（sessionID 存进各自的 StepState）。
//   - activeStep：当前正在看哪个模块
//   - steps：outline/writing/formatting/review 各自的 { 输入, 状态, 产物文本, sessionID }
// 数据持久化到 localStorage（key 按工作区路径隔离），刷新不丢。
import { createSimpleContext } from "@opencode-ai/ui/context"
import { createSignal } from "solid-js"
import { createScratchArtifact, createStepArtifact, type ThesisArtifact } from "./thesis-artifact"
import { consumeTurn as consumeTurnRegistry, getTurn as getTurnRegistry, markTurn as markTurnRegistry, type TurnRegistration } from "./thesis-channel"

export type StepKey = "outline" | "writing" | "formatting" | "review"

// [论文助手定制] 方案 B：每个模块对「输入材料」的引用方式——auto=自动引用其他模块产物
// （有则用，没有则提示），manual=手动粘贴，none=不用（按通用模板生成）。
// [论文助手定制] file=从文件空间选择已上传的文件作为输入材料（排版模块用）。
export type InputSource = "auto" | "manual" | "none" | "file"

// [论文助手定制] 剥离模型回复末尾的 AI 总结性文字（如「初稿已完成…需要我继续：①…②…③…」），
// 只保留论文正文。规则：从文本末尾向前扫描段落（最多最后 8 段），
// 遇到含「总结触发词」的段落即裁剪该段及其后的全部内容，避免 AI 的
// “下一步建议 / 提问 / 对话式收尾”混进文稿展示与导出。
const AI_FOOTER_PATTERNS = [
  /需要我(?:继续|接着|再|补充|帮你|帮您)/,
  /是否需要我/,
  /以上就是/,
  /希望(?:这版|这份|以上|该)/,
  /我可以(?:继续|帮你|帮您|进一步)/,
  /请告诉我/,
  /请随时/,
  /有什么需要/,
  /有什么问题/,
  /如果您需要/,
  /如果你需要/,
  /接下来我可以/,
  /您看是否可以/,
  /要不要我/,
  /有问题可以/,
  /有需要可以/,
]

export function stripAiFooter(text: string): string {
  if (!text) return text
  const paragraphs = text.split(/\n{2,}/)
  const scanFrom = Math.max(0, paragraphs.length - 8)
  for (let index = paragraphs.length - 1; index >= scanFrom; index--) {
    if (AI_FOOTER_PATTERNS.some((pattern) => pattern.test(paragraphs[index]))) {
      return paragraphs.slice(0, index).join("\n\n").trim()
    }
  }
  return text.trim()
}

// [论文助手定制] 剥离模型回复开头的「排版说明」块（AI 在正文前输出的元信息，如：
// “排版后的完整论文（Markdown）”“**排版说明**：以下按…模板规范输出…”以及 ┌──┐│└──┘
// 形式的页眉页脚设置框）。规则：逐行扫描开头，命中说明模式或 ASCII 边框行就跳过，
// 遇到第一条普通正文行结束；中文论文正文不会以这些字符/句式开头，不会误伤正文。
export function stripDocMeta(text: string): string {
  if (!text) return text
  const lines = text.split("\n")
  let start = 0
  let skipping = false
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const isMetaLine =
      /^\s*排版后的完整论文（Markdown）\s*$/.test(line) ||
      /^\s*\*\*排版说明\*\*/.test(line) ||
      /^\s*排版说明[:：]/.test(line) ||
      /^\s*以下按.+模板规范输出/.test(line) ||
      /^\s*页眉页脚设置见/.test(line) ||
      /^[┌└├]/.test(line) ||
      /[┐┘┤]$/.test(line)
    if (skipping) {
      // 说明块内：空行与边框字符行继续跳过，普通正文行表示说明块结束。
      if (/^\s*$/.test(line) || /[┌┐└┘├┤┬┴┼─│]/.test(line)) {
        start = index + 1
        continue
      }
      skipping = false
      continue
    }
    if (isMetaLine) {
      skipping = true
      start = index + 1
    }
  }
  return start > 0 ? lines.slice(start).join("\n").trim() : text
}

// [论文助手定制] 每步的输入表单数据（每个模式独立一份）。
export type OutlineInput = {
  // [论文助手定制] 本步生成时启用的 Skill（可多选）：生成时把 SKILL.md 指令注入提示词。
  skills: string[]
  // [论文助手定制] 生成时是否允许模型调用工具：false=纯文本流式输出（tools 全禁）；
  // true=交给 agent 默认工具集（适合需要执行脚本的 Skill），代价是输出前可能有多轮工具调用。
  useTools: boolean
  needs: string
  // [论文助手定制] Step 1 论文设定：类型 / 语言 / 图表 / 字数（打包进提纲提示词）。
  paperType: string
  language: string
  hasFigures: string
  targetWords: string
  directions: string[]
  aiSuggest: boolean
  optimize: boolean
  selected: string[]
  // [论文助手定制] 知识库手写条目 id（与 selected 文件路径互补，都参与提纲生成）。
  selectedKnowledgeIds: string[]
}
export type WritingInput = {
  // [论文助手定制] 本步生成时启用的 Skill（可多选）。
  skills: string[]
  // [论文助手定制] 生成时是否允许模型调用工具（见 OutlineInput.useTools 注释）。
  useTools: boolean
  // [论文助手定制] 方案 B：参考提纲的来源——auto=用提纲模块结果，manual=手动粘贴，file=从文件空间选文件，none=不用提纲。
  outlineSource: InputSource
  manualOutline: string
  sourceFile: string
  journal: string
  style: string
  focus: string
  referenceStyle: string
  length: string
  chapter: string
  extra: string
}
export type FormattingInput = {
  // [论文助手定制] 本步生成时启用的 Skill（可多选）。
  skills: string[]
  // [论文助手定制] 生成时是否允许模型调用工具（见 OutlineInput.useTools 注释）。
  useTools: boolean
  // [论文助手定制] 方案 B：排版源稿来源——auto=用辅助写作的全文稿，manual=手动粘贴，
  // file=从文件空间选择已上传的文件，none=无源稿。
  paperSource: InputSource
  manualPaper: string
  // [论文助手定制] 文件来源模式（paperSource=file）下选中的文件空间相对路径（如 资料/初稿.md）。
  sourceFile: string
  // [论文助手定制] 排版输出格式：md（Markdown 排版稿）/ docx（自动导出 Word）/ pdf（自动导出 PDF）。
  outputFormat: "md" | "docx" | "pdf"
  // [论文助手定制] 是否使用上传的排版模板：none=无模板（手动配置排版参数），upload=使用用户上传的 .docx 模板。
  templateMode: "none" | "upload"
  // [论文助手定制] 上传模板的文件名（templateMode=upload 时显示用，如 毕业论文模板.docx）。
  templateName: string
  // [论文助手定制] 上传模板的相对路径（templateMode=upload 时传给后端套用，如 模板/毕业论文模板.docx）。
  templatePath: string
  journal: string
  paperType: string
  referenceStyle: string
  headingStyle: string
  typography: string
  requirements: string
  // [论文助手定制] docx 排版参数（导出 Word 时传给后端 docx 引擎，控制字体/字号/行距/页边距/编号/封面）。
  fontFamily: string
  fontSize: string
  lineSpacing: string
  pageMargin: string
  titleNumbering: boolean
  coverTitle: string
  coverAuthor: string
  coverAffiliation: string
  coverDate: string
  // [论文助手定制] 扩充 docx 排版参数：页眉文字 / 标题字体 / 首行缩进字符数 / 段后间距(pt) / 页脚页码开关。
  headerText: string
  headingFont: string
  firstLineIndent: string
  paragraphSpacing: string
  pageNumber: boolean
}
export type ReviewInput = {
  // [论文助手定制] 本步生成时启用的 Skill（可多选）。
  skills: string[]
  // [论文助手定制] 生成时是否允许模型调用工具（见 OutlineInput.useTools 注释）。
  useTools: boolean
  // [论文助手定制] 方案 B：评审对象来源——auto=排版稿/全文稿，manual=手动粘贴，file=从文件空间选文件，none=无源稿。
  paperSource: InputSource
  manualPaper: string
  sourceFile: string
  journal: string
  mode: string
  focus: string
}

export type StepStatus = "idle" | "generating" | "done"

export type StepState<I> = {
  status: StepStatus
  input: I
  // [论文助手定制] 方案 B：该步骤专属的生成记录会话（每步独立，互不共享上下文）。
  sessionID?: string
  result?: string
  // [论文助手定制] 生成过程中的流式文本（只存在内存里，不写 localStorage；完成后清空并落到 result）。
  progress?: string
  updatedAt?: number
}

export type ThesisWorkflowState = {
  version: 3
  activeStep: StepKey
  currentArtifactID: string | null
  // [论文助手定制] 会话记录联动：右侧产物面板当前显示模式（document=文稿 / session=会话）。
  productView: "document" | "session"
  // [论文助手定制] 会话记录联动：当前在右侧会话界面显示的会话 ID（null=跟随当前板块专属会话）。
  displaySessionID: string | null
  artifacts: ThesisArtifact[]
  turns: Record<string, TurnRegistration>
  steps: {
    outline: StepState<OutlineInput>
    writing: StepState<WritingInput>
    formatting: StepState<FormattingInput>
    review: StepState<ReviewInput>
  }
}

const DEFAULT_INPUTS: {
  outline: OutlineInput
  writing: WritingInput
  formatting: FormattingInput
  review: ReviewInput
} = {
  outline: {
    skills: [],
    useTools: false,
    needs: "",
    paperType: "期刊论文",
    language: "中文",
    hasFigures: "有图表",
    targetWords: "8000",
    directions: [],
    aiSuggest: true,
    optimize: true,
    selected: [],
    selectedKnowledgeIds: [],
  },
  writing: {
    skills: [],
    useTools: false,
    outlineSource: "auto",
    manualOutline: "",
    sourceFile: "",
    journal: "",
    style: "学术、审慎、综述型",
    focus: "研究脉络与概念边界",
    referenceStyle: "GB/T 7714-2015",
    length: "8000",
    chapter: "",
    extra: "",
  },
  formatting: {
    skills: [],
    useTools: false,
    paperSource: "auto",
    manualPaper: "",
    sourceFile: "",
    outputFormat: "md",
    templateMode: "none",
    templateName: "",
    templatePath: "",
    journal: "",
    paperType: "综述论文",
    referenceStyle: "GB/T 7714-2015",
    headingStyle: "三级标题",
    typography: "中文学术默认",
    requirements: "",
    fontFamily: "宋体",
    fontSize: "12",
    lineSpacing: "1.5",
    pageMargin: "standard",
    titleNumbering: true,
    coverTitle: "",
    coverAuthor: "",
    coverAffiliation: "",
    coverDate: "",
    headerText: "",
    headingFont: "黑体",
    firstLineIndent: "2",
    paragraphSpacing: "6",
    pageNumber: true,
  },
  review: { skills: [], useTools: false, paperSource: "auto", manualPaper: "", sourceFile: "", journal: "", mode: "全面评审", focus: "" },
}

export const createDefaultWorkflowState = (): ThesisWorkflowState => ({
  version: 3,
  activeStep: "outline",
  currentArtifactID: null,
  productView: "document",
  displaySessionID: null,
  artifacts: [],
  turns: {},
  steps: {
    outline: { status: "idle", input: { ...DEFAULT_INPUTS.outline } },
    writing: { status: "idle", input: { ...DEFAULT_INPUTS.writing } },
    formatting: { status: "idle", input: { ...DEFAULT_INPUTS.formatting } },
    review: { status: "idle", input: { ...DEFAULT_INPUTS.review } },
  },
})

// [论文助手定制] 从 localStorage 读取某论文的工作流状态；格式不对时回退默认值。
const storageKey = (directory: string) => `opencode.dat:thesis-workflow:${directory}`

const readWorkflow = (directory: string): ThesisWorkflowState => {
  const fallback = createDefaultWorkflowState()
  try {
    const raw = localStorage.getItem(storageKey(directory))
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as {
      version?: number
      // [论文助手定制] 旧版（v1）全局共用一个会话，读出来做迁移用。
      sessionID?: string
      activeStep?: string
      currentArtifactID?: string
      artifacts?: ThesisArtifact[]
      turns?: Record<string, TurnRegistration>
      steps?: {
        outline?: Partial<StepState<OutlineInput>>
        writing?: Partial<StepState<WritingInput>>
        formatting?: Partial<StepState<FormattingInput>>
        review?: Partial<StepState<ReviewInput>>
      }
    }
    if ((parsed?.version !== 1 && parsed?.version !== 2 && parsed?.version !== 3) || !parsed.steps) return fallback
    const steps = parsed.steps
    const activeStep = (["outline", "writing", "formatting", "review"] as StepKey[]).includes(parsed.activeStep as StepKey)
      ? (parsed.activeStep as StepKey)
      : "outline"
    const clean = (result?: string) => (result ? stripDocMeta(stripAiFooter(result)) : result)
    const legacySession = parsed.version === 1 ? parsed.sessionID : undefined
    const keepSession = (step: "outline" | "writing" | "formatting" | "review") =>
      parsed.version === 2 || parsed.version === 3 ? steps[step]?.sessionID : undefined
    const migratedArtifacts = Array.isArray(parsed.artifacts) && parsed.artifacts.length > 0
      ? parsed.artifacts
      : (Object.entries(steps) as [StepKey, Partial<StepState<any>>][])
          .filter(([step, state]) => !!state?.result)
          .map(([step, state]) =>
            createStepArtifact(step, directory, {
              title: step === "writing" ? "全文稿" : step === "outline" ? "提纲" : step === "formatting" ? "排版稿" : "评审报告",
              fileName: step === "writing" ? "全文稿.md" : step === "outline" ? "提纲.md" : step === "formatting" ? "排版稿.md" : "评审报告.md",
              sessionID: state?.sessionID,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }),
          )
    const currentArtifactID = typeof parsed.currentArtifactID === "string" ? parsed.currentArtifactID : null
    return {
      version: 3,
      activeStep,
      currentArtifactID,
      productView: "document",
      displaySessionID: null,
      artifacts: migratedArtifacts,
      turns: parsed.turns ?? {},
      steps: {
        outline: { ...fallback.steps.outline, ...parsed.steps.outline, input: { ...fallback.steps.outline.input, ...parsed.steps.outline?.input }, result: clean(parsed.steps.outline?.result), sessionID: keepSession("outline") },
        writing: { ...fallback.steps.writing, ...parsed.steps.writing, input: { ...fallback.steps.writing.input, ...parsed.steps.writing?.input }, result: clean(parsed.steps.writing?.result), sessionID: legacySession ?? keepSession("writing") },
        formatting: { ...fallback.steps.formatting, ...parsed.steps.formatting, input: { ...fallback.steps.formatting.input, ...parsed.steps.formatting?.input }, result: clean(parsed.steps.formatting?.result), sessionID: keepSession("formatting") },
        review: { ...fallback.steps.review, ...parsed.steps.review, input: { ...fallback.steps.review.input, ...parsed.steps.review?.input }, result: clean(parsed.steps.review?.result), sessionID: keepSession("review") },
      },
    }
  } catch {
    return fallback
  }
}

export const { use: useThesisWorkflow, provider: ThesisWorkflowProvider } = createSimpleContext({
  name: "ThesisWorkflow",
  init: (props: { directory: string }) => {
    const directory = props.directory
    const [state, setState] = createSignal<ThesisWorkflowState>(readWorkflow(directory))

    // [论文助手定制] 所有修改都走这里：更新后立即写回 localStorage。
    const commit = (next: ThesisWorkflowState) => {
      setState(next)
      try {
        localStorage.setItem(storageKey(directory), JSON.stringify(next))
      } catch {
        // ignore storage errors
      }
    }

    const markTurn = (sessionID: string, entry: Omit<TurnRegistration, "createdAt">) => {
      const current = state()
      commit({ ...current, turns: markTurnRegistry(current.turns, sessionID, entry) })
    }

    const consumeTurn = (sessionID: string) => {
      const current = state()
      const turn = consumeTurnRegistry(current.turns, sessionID)
      if (!turn) return undefined
      const nextTurns = { ...current.turns }
      delete nextTurns[sessionID]
      commit({ ...current, turns: nextTurns })
      return turn
    }

    const getTurn = (sessionID: string) => getTurnRegistry(state().turns, sessionID)

    const upsertArtifact = (artifact: ThesisArtifact) => {
      const current = state()
      const next = current.artifacts.some((item) => item.id === artifact.id)
        ? current.artifacts.map((item) => (item.id === artifact.id ? { ...item, ...artifact, updatedAt: Date.now() } : item))
        : [artifact, ...current.artifacts]
      commit({ ...current, artifacts: next })
    }

    const ensureArtifactForStep = (step: StepKey) => {
      const current = state()
      const existing = current.artifacts.find((item) => item.kind === "step" && item.step === step)
      if (existing) {
        commit({ ...current, currentArtifactID: existing.id })
        return existing
      }
      const artifact = createStepArtifact(step, directory, { sessionID: current.steps[step].sessionID })
      commit({ ...current, artifacts: [artifact, ...current.artifacts], currentArtifactID: artifact.id })
      return artifact
    }

    const ensureScratchArtifact = (title: string, sessionID?: string) => {
      const current = state()
      const trimmed = title.trim() || "会话文档"
      const existing = current.artifacts.find((item) => item.kind === "scratch" && item.sessionID === sessionID && item.title === trimmed)
      if (existing) return existing
      const artifact = createScratchArtifact(trimmed, directory, { sessionID, title: trimmed, fileName: `${trimmed}.md` })
      commit({ ...current, artifacts: [artifact, ...current.artifacts], currentArtifactID: artifact.id })
      return artifact
    }

    const setCurrentArtifact = (artifactID: string | null) => {
      const current = state()
      commit({ ...current, currentArtifactID: artifactID })
    }

    // [论文助手定制] 切换板块：清掉会话记录点选的会话并回到文稿视图，
    // 避免上一个板块的「查看会话」串到新板块（openSessionInPanel 会随后重新设置显示会话）。
    const setActiveStep = (step: StepKey) =>
      commit({ ...state(), activeStep: step, displaySessionID: null, productView: "document" })

    const updateInput = <K extends StepKey>(step: K, patch: Partial<ThesisWorkflowState["steps"][K]["input"]>) => {
      const current = state()
      const steps = { ...current.steps, [step]: { ...current.steps[step], input: { ...current.steps[step].input, ...patch } } }
      commit({ ...current, steps })
    }

    const setStepStatus = (step: StepKey, status: StepStatus) => {
      const current = state()
      const steps = { ...current.steps, [step]: { ...current.steps[step], status } }
      commit({ ...current, steps })
    }

    // [论文助手定制] 边生成边显示：每轮轮询把当前已生成的文本写入 progress（不写 localStorage，避免频繁大字符串写入）。
    const setStepProgress = (step: StepKey, text: string) => {
      const current = state()
      const steps = { ...current.steps, [step]: { ...current.steps[step], progress: text } }
      setState({ ...current, steps })
    }

    // [论文助手定制] 生成成功后保存产物文本与完成时间。
    // 写入前统一剥离 AI 尾部总结（stripAiFooter）与头部排版说明（stripDocMeta），
    // 保证文稿视图/导出只含正文；所有 result 写入入口（四步生成 + 会话视图同步）都经过这里。
    // 所有 result 写入入口（四步生成 + 会话视图同步）都经过这里，无需各步单独处理。
    const setStepResult = (step: StepKey, result: string) => {
      const current = state()
      const steps = {
        ...current.steps,
        // [论文助手定制] 完成时清掉流式 progress，避免与最终 result 重复显示。
        [step]: { ...current.steps[step], status: "done", result: stripDocMeta(stripAiFooter(result)), progress: undefined, updatedAt: Date.now() },
      }
      commit({ ...current, steps })
    }

    // [论文助手定制] 方案 B：每个步骤独立会话——把会话 ID 写进指定步骤自己的 StepState。
    const setStepSessionID = (step: StepKey, sessionID: string) => {
      const current = state()
      const steps = { ...current.steps, [step]: { ...current.steps[step], sessionID } }
      commit({ ...current, steps })
    }

    // [论文助手定制] 会话记录联动：切换右侧产物面板显示模式 / 指定当前显示的会话。
    const setProductView = (view: "document" | "session") => commit({ ...state(), productView: view })
    const setDisplaySession = (sessionID: string | null) => commit({ ...state(), displaySessionID: sessionID })

    return {
      directory,
      state,
      setActiveStep,
      updateInput,
      setStepStatus,
      setStepProgress,
      setStepResult,
      setStepSessionID,
      setProductView,
      setDisplaySession,
      setCurrentArtifact,
      markTurn,
      consumeTurn,
      getTurn,
      upsertArtifact,
      ensureArtifactForStep,
      ensureScratchArtifact,
    }
  },
})
