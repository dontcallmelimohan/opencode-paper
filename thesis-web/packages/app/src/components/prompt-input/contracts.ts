import type { useLocal } from "@/context/local"
import type { Prompt, usePrompt } from "@/context/prompt"
import type { PromptInputHistory } from "./history-store"
import type { FollowupDraft } from "./submit"

export type PromptInputState = ReturnType<typeof usePrompt>

export type PromptInputSubmission = {
  abort: () => Promise<void> | void
  handleSubmit: (event: Event) => Promise<void> | void
}

export type PromptInputControls = {
  agents: {
    available: { name: string; hidden?: boolean; mode: string; native?: boolean }[]
    options: string[]
    current: string
    loading: boolean
    visible: boolean
    select: (name: string | undefined) => void
  }
  // [论文助手定制] 真正的 Skill 列表（输入框技能选择器用；旧实现依赖“skill 同名 agent”，
  // 现在 skill 只作为技能存在，故改为直接读 app.skills）。可选，兼容旧调用方。
  // [论文助手定制] description：技能选择器在名称下方展示该 Skill 的用途简介（可为空）。
  skills?: () => { id: string; label: string; description?: string }[]
  model: {
    selection: ReturnType<typeof useLocal>["model"]
    paid: boolean
    loading: boolean
  }
  session: {
    id?: string
    tabs: {
      active: () => string | undefined
      all: () => string[]
      open: (tab: string) => void | Promise<void>
      setActive: (tab: string) => void
    }
    reviewPanel: {
      opened: () => boolean
      open: () => void
    }
  }
}

export interface PromptInputProps {
  class?: string
  state?: PromptInputState
  history?: PromptInputHistory
  submission?: PromptInputSubmission
  controls: PromptInputControls
  ref?: (el: HTMLDivElement) => void
  newSessionWorktree?: string
  onNewSessionWorktreeReset?: () => void
  edit?: { id: string; prompt: Prompt; context: FollowupDraft["context"] }
  onEditLoaded?: () => void
  shouldQueue?: () => boolean
  onQueue?: (draft: FollowupDraft) => void
  onAbort?: () => void
  onSubmit?: () => void
  // [论文助手定制] 嵌入模式（论文工作台会话视图）：
  // 复用已有 sessionID 继续对话、发送后不跳转；首次发送自动创建会话并回调。
  embedded?: boolean
  onSessionCreated?: (sessionID: string, sessionDirectory: string) => void
}
