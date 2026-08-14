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

// [论文助手定制] 每步的输入表单数据（每个模式独立一份）。
export type OutlineInput = {
  needs: string
  directions: string[]
  aiSuggest: boolean
  optimize: boolean
  selected: string[]
  // [论文助手定制] 知识库手写条目 id（与 selected 文件路径互补，都参与提纲生成）。
  selectedKnowledgeIds: string[]
}
export type WritingInput = {
  journal: string
  style: string
  focus: string
  referenceStyle: string
  length: string
  chapter: string
  extra: string
}
export type FormattingInput = {
  journal: string
  paperType: string
  referenceStyle: string
  headingStyle: string
  typography: string
  requirements: string
}
export type ReviewInput = {
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
  outline: { needs: "", directions: [], aiSuggest: true, optimize: true, selected: [], selectedKnowledgeIds: [] },
  writing: {
    journal: "",
    style: "学术、审慎、综述型",
    focus: "研究脉络与概念边界",
    referenceStyle: "GB/T 7714-2015",
    length: "8000",
    chapter: "",
    extra: "",
  },
  formatting: {
    journal: "",
    paperType: "综述论文",
    referenceStyle: "GB/T 7714-2015",
    headingStyle: "三级标题",
    typography: "中文学术默认",
    requirements: "",
  },
  review: { journal: "", mode: "全面评审", focus: "" },
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
        outline: { ...fallback.steps.outline, ...parsed.steps.outline, input: { ...fallback.steps.outline.input, ...parsed.steps.outline?.input } },
        writing: { ...fallback.steps.writing, ...parsed.steps.writing, input: { ...fallback.steps.writing.input, ...parsed.steps.writing?.input } },
        formatting: { ...fallback.steps.formatting, ...parsed.steps.formatting, input: { ...fallback.steps.formatting.input, ...parsed.steps.formatting?.input } },
        review: { ...fallback.steps.review, ...parsed.steps.review, input: { ...fallback.steps.review.input, ...parsed.steps.review?.input } },
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
    const setStepResult = (step: StepKey, result: string) => {
      const current = state()
      const steps = {
        ...current.steps,
        // [论文助手定制] 完成时清掉流式 progress，避免与最终 result 重复显示。
        [step]: { ...current.steps[step], status: "done", result, progress: undefined, updatedAt: Date.now() },
      }
      commit({ ...current, steps })
    }

    const setSessionID = (sessionID: string) => commit({ ...state(), sessionID })

    return { directory, state, setActiveStep, updateInput, setStepStatus, setStepProgress, setStepResult, setSessionID }
  },
})
