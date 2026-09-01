// [论文助手定制] 平台固定角色 agent（四个板块角色 + 中立助手）：
// 与后端 thesis-agents.ts 初始化的 agent 文件名一致。
// 这些是「角色」而不是「技能」：出现在 agent 下拉中，不出现在 sparkles 技能多选里。
export const THESIS_ROLE_AGENTS: readonly string[] = [
  "提纲助手",
  "辅助写作",
  "论文排版",
  "论文评审",
  "通用助手",
]

// 中立助手：四个板块之外的一般对话默认使用。
export const THESIS_NEUTRAL_AGENT = "通用助手"

export function isThesisRoleAgent(name: string | undefined): boolean {
  return !!name && THESIS_ROLE_AGENTS.includes(name)
}
