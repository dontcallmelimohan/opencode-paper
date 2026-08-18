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
// [论文助手定制] 导出给工作台内嵌会话视图复用：继续对话（发送消息后）同样用轮询等待模型回复。
export function waitForAssistantReply(
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
        // [论文助手定制] 流式文本读取：优先用 part store 里实时累积的 text；
        // 若 part.text 还没更新（某些协议下 delta 只进 part_text_accum_delta），
        // 用 delta 累积值兜底。保证“边生成边显示”在 v1/v2 事件下都能读到中间文本。
        const text =
          parts
            .filter((part) => part.type === "text" && "text" in part)
            .map((part) => {
              const delta = sync().data.part_text_accum_delta?.[part.id]
              const current = (part as { text: string }).text
              return typeof delta === "string" && delta.length > current.length ? delta : current
            })
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
    }, 150)
  })
}

// [论文助手定制] 把选中 Skill 的 SKILL.md 指令注入提示词（纯前端方案）。
// 后端 prompt_async 只有单个 agent 参数、没有 skills[] 列表；会话输入框选 Skill
// 是作为 agent part 提交、由后端按 skill 工具加载。工作台生成禁用了全部工具
// （tools: { "*": false }，保证正文一出现就能流式显示），所以这里直接调 GET /skill
// 把选中 Skill 的 content（SKILL.md 正文，frontmatter 已剥离）拼进提示词，
// 模型按指令执行，又不会触发多轮工具调用打断流式输出。
async function buildSkillSection(
  sdk: ReturnType<typeof useSDK>,
  skills: string[],
): Promise<string> {
  if (skills.length === 0) return ""
  const res = await sdk().client.app.skills({ directory: sdk().directory })
  if (res.error) return ""
  const byName = new Map((res.data ?? []).map((item) => [item.name, item]))
  const lines: string[] = [
    "",
    "## 启用的 Skill 指令（必须遵循）",
    "以下是本次任务必须遵循的 Skill 指令，内容已内嵌在提示词中，无需也不能再调用任何工具或 skill：",
  ]
  for (const name of skills) {
    const skill = byName.get(name)
    if (!skill) continue
    lines.push("", `### Skill：${skill.name}`, skill.content.trim())
  }
  if (lines.length <= 3) return ""
  return lines.join("\n")
}

export function useThesisGenerator() {
  const sdk = useSDK()
  const local = useLocal()
  const sync = useSync()
  const [generating, setGenerating] = createSignal(false)

  // [论文助手定制] 核心生成函数：返回 { sessionID, text }。
  const generate = async (options: {
    prompt: string
    // [论文助手定制] 本步配置面板选中的 Skill（可多选）：生成时把 SKILL.md 指令注入提示词。
    skills?: string[]
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
      // [论文助手定制] 用 prompt_async（异步受理，立即返回）而不是同步 prompt：
      // 同步接口会阻塞到模型回复完成才返回，导致 waitForAssistantReply 只能在生成结束后
      // 才开始轮询——事件流（message.part.delta）虽然实时到达前端 store，却没人读取，
      // 文稿面板就只能“等会话输出完一次性显示”。异步受理后轮询立刻开始，
      // 每 150ms 读取 store 里实时累积的文本，实现“边生成边显示”。
      // [论文助手定制] 把选中 Skill 的 SKILL.md 指令追加到提示词末尾（见 buildSkillSection）。
      const prompt = options.skills?.length
        ? options.prompt + (await buildSkillSection(sdk, options.skills))
        : options.prompt
      const res = await sdk().client.session.promptAsync({
        sessionID,
        directory: sdk().directory,
        messageID: Identifier.ascending("message"),
        agent: agent?.name,
        model: model ? { providerID: model.provider.id, modelID: model.id } : undefined,
        // [论文助手定制] 工作台生成禁用所有工具（* 通配 deny）：
        // 参考材料已经由各步骤打包进 prompt（知识库内容内嵌），不再需要模型自己去读项目文件。
        // 否则 build agent 会先做多轮工具调用（读正文/资料），期间没有任何 text 输出，
        // 文稿面板只能一直显示“等待输出”，体验不到豆包式“正文一出现就流式显示”。
        tools: { "*": false },
        parts: [{ type: "text", text: prompt }],
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
