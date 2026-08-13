// [论文助手定制] 写作模式与技能挂钩：每个模式保存自己的一份 @技能 清单。
// - 切换模式时：把输入框里当前的技能记回旧模式，再装载新模式保存的那份技能。
// - 用户在输入框里增删技能时：自动记到当前模式名下。
// - 会话上下文始终互通，只有“配置 + 技能清单”是每个模式一份的。
import { createEffect, on, untrack } from "solid-js"
import type { AgentPart, Prompt } from "@/context/prompt"
import { useWritingMode } from "./writing-mode"

type PromptLike = {
  current: () => Prompt
  set: (prompt: Prompt, cursor?: number) => void
}

const agentNamesOf = (prompt: Prompt) =>
  prompt.filter((part): part is AgentPart => part.type === "agent").map((part) => part.name)

const agentPartOf = (name: string): AgentPart => ({
  type: "agent",
  name,
  content: `@${name}`,
  start: 0,
  end: 0,
})

export function useThesisModeSkillsSync(prompt: PromptLike) {
  const { mode, skillsByMode, setModeSkills } = useWritingMode()

  // [论文助手定制] 最近一次由“切换模式”写入输入框的技能集合签名，避免循环回写。
  let appliedKey = ""

  const currentKey = () => agentNamesOf(prompt.current()).join("\u0000")

  // [论文助手定制] 模式切换：先把当前输入框的技能记回旧模式，再装载新模式保存的技能。
  createEffect(
    on(
      () => mode(),
      (key, prev) => {
        const names = untrack(() => agentNamesOf(prompt.current()))
        if (prev) setModeSkills(prev, names)
        if (!key) return
        const stored = skillsByMode()[key] ?? []
        const current = prompt.current()
        const next = [
          ...current.filter((part) => part.type !== "agent"),
          ...stored.map(agentPartOf),
        ]
        appliedKey = stored.join("\u0000")
        prompt.set(next)
      },
      { defer: false },
    ),
  )

  // [论文助手定制] 输入框里的技能变化（用户通过技能菜单增删）→ 记到当前模式。
  createEffect(
    on(
      () => currentKey(),
      (key) => {
        const currentMode = mode()
        if (!currentMode) return
        if (key === appliedKey) return
        setModeSkills(currentMode, key ? key.split("\u0000") : [])
      },
    ),
  )
}

// [论文助手定制] 挂载在写作模式 Provider 内的同步组件（自身不渲染任何 UI）。
export function ThesisModeSkillsSync(props: { prompt: PromptLike }) {
  useThesisModeSkillsSync(props.prompt)
  return null
}
