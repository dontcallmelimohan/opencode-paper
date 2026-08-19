// [论文助手定制] 论文工作流状态 store（论文工作台的数据主体）。
// 核心转变：不再以“聊天会话”为主体，而是以“论文项目 + 四步标准化流程”为主体。
// 每个论文项目（按工作区路径区分）保存一份 workflow：
//   - activeStep：当前在第几步
//   - sessionID：该项目专属的“生成记录会话”（模型回复都发生在里面，工作台只取产物）
//   - steps：outline/writing/formatting/review 各自的 { 输入, 状态, 产物文本 }
// 数据持久化到 localStorage（key 按工作区路径隔离），刷新不丢。
import { createSimpleContext } from "@opencode-ai/ui/context"
import { createSignal } from "solid-js"

export type StepKey = "outline" | "writing" | "formatting" | "review"

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
  journal: string
  mode: string
  focus: string
}

export type StepStatus = "idle" | "generating" | "done"

export type StepState<I> = {
  status: StepStatus
  input: I
  result?: string
  // [论文助手定制] 生成过程中的流式文本（只存在内存里，不写 localStorage；完成后清空并落到 result）。
  progress?: string
  updatedAt?: number
}

export type ThesisWorkflowState = {
  version: 1
  sessionID?: string
  activeStep: StepKey
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
  review: { skills: [], useTools: false, journal: "", mode: "全面评审", focus: "" },
}

export const createDefaultWorkflowState = (): ThesisWorkflowState => ({
  version: 1,
  activeStep: "outline",
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
    const parsed = JSON.parse(raw) as Partial<ThesisWorkflowState>
    if (parsed?.version !== 1 || !parsed.steps) return fallback
    return {
      version: 1,
      sessionID: typeof parsed.sessionID === "string" ? parsed.sessionID : undefined,
      activeStep: parsed.activeStep === "outline" || parsed.activeStep === "writing" || parsed.activeStep === "formatting" || parsed.activeStep === "review"
        ? parsed.activeStep
        : "outline",
      steps: {
        // [论文助手定制] 读取时对历史 result 也做清理（stripDocMeta + stripAiFooter）：
        // 旧项目 localStorage 里可能已存了带排版说明或 AI 总结的产物，读取时清理一次。
        outline: { ...fallback.steps.outline, ...parsed.steps.outline, input: { ...fallback.steps.outline.input, ...parsed.steps.outline?.input }, result: parsed.steps.outline?.result ? stripDocMeta(stripAiFooter(parsed.steps.outline.result)) : fallback.steps.outline.result },
        writing: { ...fallback.steps.writing, ...parsed.steps.writing, input: { ...fallback.steps.writing.input, ...parsed.steps.writing?.input }, result: parsed.steps.writing?.result ? stripDocMeta(stripAiFooter(parsed.steps.writing.result)) : fallback.steps.writing.result },
        formatting: { ...fallback.steps.formatting, ...parsed.steps.formatting, input: { ...fallback.steps.formatting.input, ...parsed.steps.formatting?.input }, result: parsed.steps.formatting?.result ? stripDocMeta(stripAiFooter(parsed.steps.formatting.result)) : fallback.steps.formatting.result },
        review: { ...fallback.steps.review, ...parsed.steps.review, input: { ...fallback.steps.review.input, ...parsed.steps.review?.input }, result: parsed.steps.review?.result ? stripDocMeta(stripAiFooter(parsed.steps.review.result)) : fallback.steps.review.result },
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

    const setActiveStep = (step: StepKey) => commit({ ...state(), activeStep: step })

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

    const setSessionID = (sessionID: string) => commit({ ...state(), sessionID })

    return { directory, state, setActiveStep, updateInput, setStepStatus, setStepProgress, setStepResult, setSessionID }
  },
})
