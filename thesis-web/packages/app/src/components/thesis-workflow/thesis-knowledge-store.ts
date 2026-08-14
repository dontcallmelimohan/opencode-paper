// [论文助手定制] 论文知识库 store：在「资料」目录文件之外，增加可手写、可分类的知识条目。
// 参考 pa 项目知识库思路：条目（手写草稿/文献摘录/老师意见）+ 文件夹（分类）+ 搜索筛选。
// 数据存 localStorage（key 按论文工作区隔离），刷新不丢；参与提纲生成时会被打包进提示词。
import { createSimpleContext } from "@opencode-ai/ui/context"
import { createSignal } from "solid-js"

export type KnowledgeItem = {
  id: string
  title: string
  category: string
  content: string
  createdAt: number
  updatedAt: number
}

export type ThesisKnowledgeState = {
  version: 1
  folders: string[]
  items: KnowledgeItem[]
}

// [论文助手定制] 默认文件夹与 pa 项目保持一致。
const DEFAULT_FOLDERS = ["默认文件夹", "文献综述", "论文草稿", "老师意见"]

const storageKey = (directory: string) => `opencode.dat:thesis-knowledge:${directory}`

const createDefault = (): ThesisKnowledgeState => ({
  version: 1,
  folders: [...DEFAULT_FOLDERS],
  items: [],
})

const readKnowledge = (directory: string): ThesisKnowledgeState => {
  const fallback = createDefault()
  try {
    const raw = localStorage.getItem(storageKey(directory))
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<ThesisKnowledgeState>
    if (parsed?.version !== 1) return fallback
    return {
      version: 1,
      folders: Array.isArray(parsed.folders) && parsed.folders.length > 0 ? parsed.folders : fallback.folders,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    }
  } catch {
    return fallback
  }
}

export const { use: useThesisKnowledge, provider: ThesisKnowledgeProvider } = createSimpleContext({
  name: "ThesisKnowledge",
  init: (props: { directory: string }) => {
    const directory = props.directory
    const [state, setState] = createSignal<ThesisKnowledgeState>(readKnowledge(directory))

    const commit = (next: ThesisKnowledgeState) => {
      setState(next)
      try {
        localStorage.setItem(storageKey(directory), JSON.stringify(next))
      } catch {
        // ignore storage errors
      }
    }

    // [论文助手定制] 条目增删改查 + 文件夹管理，全部同步写回 localStorage。
    const addItem = (input: { title: string; category: string; content: string }) => {
      const now = Date.now()
      const item: KnowledgeItem = {
        id: `kn-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        title: input.title.trim() || "未命名条目",
        category: input.category,
        content: input.content,
        createdAt: now,
        updatedAt: now,
      }
      commit({ ...state(), items: [item, ...state().items] })
      return item
    }

    const updateItem = (id: string, patch: Partial<Pick<KnowledgeItem, "title" | "category" | "content">>) => {
      const current = state()
      commit({
        ...current,
        items: current.items.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item)),
      })
    }

    const removeItem = (id: string) => commit({ ...state(), items: state().items.filter((item) => item.id !== id) })

    const addFolder = (name: string) => {
      const value = name.trim()
      if (!value || state().folders.includes(value)) return
      commit({ ...state(), folders: [...state().folders, value] })
    }

    const removeFolder = (name: string) => {
      if (DEFAULT_FOLDERS.includes(name)) return
      const next = state()
      commit({
        ...next,
        folders: next.folders.filter((folder) => folder !== name),
        items: next.items.map((item) => (item.category === name ? { ...item, category: "默认文件夹" } : item)),
      })
    }

    return { directory, state, addItem, updateItem, removeItem, addFolder, removeFolder }
  },
})
