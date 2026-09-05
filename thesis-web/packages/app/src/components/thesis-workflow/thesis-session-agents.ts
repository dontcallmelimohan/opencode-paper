// [论文助手定制] 通用会话的 agent 选择记录（按 目录::会话ID 持久化到 localStorage）。
// 通用会话允许在“还没有任何消息”时切换 agent；一旦发出第一条消息就把当时的 agent
// 记到这里并锁定，后续会话内不再切换（见 thesis-session-view.tsx）。
import { createRoot } from "solid-js"
import { createStore } from "solid-js/store"

const STORAGE_KEY = "thesis.session-agents.v1"
type AgentMap = Record<string, string>

const load = (): AgentMap => {
  if (typeof localStorage === "undefined") return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AgentMap) : {}
  } catch {
    return {}
  }
}

const persist = (map: AgentMap) => {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // 存储不可用（隐私模式等）时静默失败，仅本次会话内生效。
  }
}

export const thesisSessionAgents = createRoot(() => {
  const [map, setMap] = createStore<AgentMap>(load())
  const keyOf = (directory: string, sessionID: string) => `${directory}::${sessionID}`
  return {
    read(directory: string, sessionID: string): string | undefined {
      return map[keyOf(directory, sessionID)]
    },
    set(directory: string, sessionID: string, agent: string) {
      const key = keyOf(directory, sessionID)
      if (map[key] === agent) return
      setMap(key, agent)
      persist(map)
    },
  }
})
