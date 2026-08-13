// [论文助手定制] 写作模式共享状态。
// 原来模式只存在侧边栏组件内部（localStorage），侧边栏收起/切换时其他组件读不到。
// 这里提升为 Context：侧边栏与“写作模式配置面板”读同一个模式，改动时同步持久化到 localStorage。
// 同时维护：
// - configMode：当前打开配置面板的模式（undefined 表示面板已关闭）。
// - modeConfigs：每个模式一份的配置内容（提纲助手/通用面板各自独立，切换模式不串数据）。
// - skillsByMode：每个模式一份的技能清单（@技能 属于哪个模式，切换模式时自动换装）。
import { createSimpleContext } from "@opencode-ai/ui/context"
import { createSignal } from "solid-js"

const SIDEBAR_MODE_KEY = "opencode.dat:thesis-agent-sidebar-mode"
const MODE_CONFIGS_KEY = "opencode.dat:thesis-mode-configs"
const MODE_SKILLS_KEY = "opencode.dat:thesis-mode-skills"

export type WritingModeKey = "outline" | "writing" | "layout" | "review"

// [论文助手定制] 四个写作模式的定义（原来是 agent-sidebar.tsx 里的本地常量，
// 现在面板组件也需要用到 label/desc 等元数据，所以移到共享模块）。
export const WRITING_MODES = [
  {
    key: "outline",
    label: "提纲助手",
    step: "第 1 步 · 搭框架",
    desc: "生成章节大纲与结构",
    icon: "bullet-list",
    color: "#4f8cff",
  },
  {
    key: "writing",
    label: "辅助写作",
    step: "第 2 步 · 写初稿",
    desc: "撰写与润色论文内容",
    icon: "pencil-line",
    color: "#22c55e",
  },
  {
    key: "layout",
    label: "论文排版",
    step: "第 3 步 · 做排版",
    desc: "格式、图表与版式调整",
    icon: "layout-left",
    color: "#f59e0b",
  },
  {
    key: "review",
    label: "论文评审",
    step: "第 4 步 · 评质量",
    desc: "评审与修改建议",
    icon: "magnifying-glass",
    color: "#a855f7",
  },
] as const

// [论文助手定制] 提纲助手配置：只属于“提纲助手”模式。
export type OutlineModeConfig = {
  needs: string
  directions: string[]
  aiSuggest: boolean
  optimize: boolean
  selected: string[]
}

// [论文助手定制] 通用模式配置：辅助写作/论文排版/论文评审共用一个简单结构。
export type GenericModeConfig = { text: string }

// [论文助手定制] 每个模式一份配置。切换模式时互不影响，且持久化到 localStorage。
export type ModeConfigs = {
  outline: OutlineModeConfig
  writing: GenericModeConfig
  layout: GenericModeConfig
  review: GenericModeConfig
}

const DEFAULT_MODE_CONFIGS: ModeConfigs = {
  outline: { needs: "", directions: [], aiSuggest: true, optimize: true, selected: [] },
  writing: { text: "" },
  layout: { text: "" },
  review: { text: "" },
}

const readModeConfigs = (): ModeConfigs => {
  try {
    const raw = localStorage.getItem(MODE_CONFIGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ModeConfigs>
      return {
        outline: { ...DEFAULT_MODE_CONFIGS.outline, ...(parsed.outline ?? {}) },
        writing: { ...DEFAULT_MODE_CONFIGS.writing, ...(parsed.writing ?? {}) },
        layout: { ...DEFAULT_MODE_CONFIGS.layout, ...(parsed.layout ?? {}) },
        review: { ...DEFAULT_MODE_CONFIGS.review, ...(parsed.review ?? {}) },
      }
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_MODE_CONFIGS
}

// [论文助手定制] 每个模式一份技能清单（存技能名，即 @技能 的名字）。
export type ModeSkills = Record<WritingModeKey, string[]>

const readModeSkills = (): ModeSkills => {
  try {
    const raw = localStorage.getItem(MODE_SKILLS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ModeSkills>
      return {
        outline: Array.isArray(parsed.outline) ? parsed.outline.filter((n): n is string => typeof n === "string") : [],
        writing: Array.isArray(parsed.writing) ? parsed.writing.filter((n): n is string => typeof n === "string") : [],
        layout: Array.isArray(parsed.layout) ? parsed.layout.filter((n): n is string => typeof n === "string") : [],
        review: Array.isArray(parsed.review) ? parsed.review.filter((n): n is string => typeof n === "string") : [],
      }
    }
  } catch {
    // ignore storage errors
  }
  return { outline: [], writing: [], layout: [], review: [] }
}

const readMode = (): WritingModeKey | undefined => {
  try {
    const value = localStorage.getItem(SIDEBAR_MODE_KEY)
    if (value === "outline" || value === "writing" || value === "layout" || value === "review") return value
  } catch {
    // ignore storage errors
  }
  return undefined
}

export const { use: useWritingMode, provider: WritingModeProvider } = createSimpleContext({
  name: "WritingMode",
  init: () => {
    const [mode, setModeSignal] = createSignal<WritingModeKey | undefined>(readMode())
    // [论文助手定制] 当前打开的配置面板对应的模式；undefined 表示未打开。
    const [configMode, setConfigModeSignal] = createSignal<WritingModeKey | undefined>(undefined)
    // [论文助手定制] 每个模式一份的配置内容。
    const [modeConfigs, setModeConfigsSignal] = createSignal<ModeConfigs>(readModeConfigs())
    // [论文助手定制] 每个模式一份的技能清单。
    const [skillsByMode, setSkillsByModeSignal] = createSignal<ModeSkills>(readModeSkills())

    const setMode = (key: WritingModeKey) => {
      setModeSignal(key)
      try {
        localStorage.setItem(SIDEBAR_MODE_KEY, key)
      } catch {
        // ignore storage errors
      }
    }

    const openConfig = (key: WritingModeKey) => setConfigModeSignal(key)
    const closeConfig = () => setConfigModeSignal(undefined)

    // [论文助手定制] 更新某个模式的配置并持久化（合并 patch，不改其他模式的数据）。
    const setModeConfig = (key: WritingModeKey, patch: Partial<ModeConfigs[WritingModeKey]>) => {
      setModeConfigsSignal((prev) => {
        const next = { ...prev, [key]: { ...prev[key], ...patch } }
        try {
          localStorage.setItem(MODE_CONFIGS_KEY, JSON.stringify(next))
        } catch {
          // ignore storage errors
        }
        return next
      })
    }

    // [论文助手定制] 覆盖某个模式的技能清单并持久化。
    const setModeSkills = (key: WritingModeKey, names: string[]) => {
      setSkillsByModeSignal((prev) => {
        const next = { ...prev, [key]: names }
        try {
          localStorage.setItem(MODE_SKILLS_KEY, JSON.stringify(next))
        } catch {
          // ignore storage errors
        }
        return next
      })
    }

    return { mode, setMode, configMode, openConfig, closeConfig, modeConfigs, setModeConfig, skillsByMode, setModeSkills }
  },
})
