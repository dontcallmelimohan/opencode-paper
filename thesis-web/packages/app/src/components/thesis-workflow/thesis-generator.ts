// [论文助手定制] 论文工作台的“生成”能力：把某一步的配置打包成提示词发给模型，
// 等模型回复完成后返回回复全文（文本），工作台把它作为该步的“产物”保存。
// 每个论文项目复用一个专属会话（sessionID 存在 workflow state 里），
// 这样同一篇论文的提纲/写作/排版/评审都在一个上下文里，模型能记住前面的产出。
import { createSignal } from "solid-js"
import { useLocal } from "@/context/local"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { showToast } from "@/utils/toast"
import { Identifier } from "@/utils/id"

const GENERATE_TIMEOUT_MS = 600_000

// [论文助手定制] 等待模型回复：轮询 sync store 里该会话的消息列表，
// 找到发送之后出现的 assistant 消息；文本内容从 data.part[消息id] 读取
// （流式回复的文本片段存在 part store 里），直到消息完成（finish/time.completed）。
function waitForAssistantReply(
  sync: ReturnType<typeof useSync>,
  sessionID: string,
  sinceIndex: number,
  onProgress?: (text: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    let settled = false
    const finish = (text?: string, error?: Error) => {
      if (settled) return
      settled = true
      clearInterval(timer)
      if (error) reject(error)
      else resolve(text ?? "")
    }
    const timer = setInterval(() => {
      if (Date.now() - started > GENERATE_TIMEOUT_MS) {
        finish(undefined, new Error("生成超时，请重试"))
        return
      }
      const messages = sync().data.session_message[sessionID] ?? []
      // 从发送位置之后倒序找最新的 assistant 消息（消息列表按时间升序）。
      for (let index = messages.length - 1; index >= sinceIndex; index--) {
        const message = messages[index]
        if (!message || message.type !== "assistant") continue
        const parts = sync().data.part[message.id] ?? []
        const inlineText = message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("")
        const text = parts
          .filter((part) => part.type === "text" && "text" in part)
          .map((part) => (part as { text: string }).text)
          .join("") || inlineText
        onProgress?.(text)
        if (message.error) {
          finish(undefined, new Error(message.error.message ?? "模型返回错误"))
          return
        }
        if (message.finish || message.time.completed) {
          finish(text)
          return
        }
        break
      }
    }, 250)
  })
}

export function useThesisGenerator() {
  const sdk = useSDK()
  const local = useLocal()
  const sync = useSync()
  const [generating, setGenerating] = createSignal(false)

  // [论文助手定制] 核心生成函数：返回 { sessionID, text }。
  const generate = async (options: {
    prompt: string
    sessionID?: string
    // [论文助手定制] 会话一确定（新建或复用）就回调，让工作台立刻启用「会话」切换，
    // 生成过程中就能切过去看实时对话；不用等模型回复完。
    onSessionCreated?: (sessionID: string) => void
    onProgress?: (text: string) => void
  }): Promise<{ sessionID: string; text: string }> => {
    if (generating()) throw new Error("已有生成任务进行中")
    setGenerating(true)
    try {
      let sessionID = options.sessionID
      if (!sessionID) {
        const created = await sdk().api.session.create({ location: { directory: sdk().directory } })
        sessionID = created.id
      }
      // [论文助手定制] 会话 ID 一确定就通知工作台（哪怕后续生成失败，会话视图也能打开看对话记录）。
      options.onSessionCreated?.(sessionID)
      // [论文助手定制] 工作台页面没有打开会话页，必须主动 sync 该会话，
      // 之后 SSE 消息事件才会写入 sync().data.session_message，等待回复才能读到。
      await sync().session.sync(sessionID).catch(() => {})
      const before = (sync().data.session_message[sessionID] ?? []).length
      const agent = local.agent.current()
      const model = local.model.current()
      const res = await sdk().client.session.prompt({
        sessionID,
        directory: sdk().directory,
        messageID: Identifier.ascending("message"),
        agent: agent?.name,
        model: model ? { providerID: model.provider.id, modelID: model.id } : undefined,
        parts: [{ type: "text", text: options.prompt }],
      })
      if (res.error) throw res.error
      const text = await waitForAssistantReply(sync, sessionID, before, options.onProgress)
      if (!text.trim()) throw new Error("模型没有返回内容，请重试")
      return { sessionID, text }
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err)
      showToast({ variant: "error", icon: "circle-x", title: "生成失败", description: message })
      throw err
    } finally {
      setGenerating(false)
    }
  }

  return { generate, generating }
}
