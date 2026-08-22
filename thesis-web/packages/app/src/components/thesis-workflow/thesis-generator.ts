// [论文助手定制] 论文工作台的“生成”能力：把某一步的配置打包成提示词发给模型，
// 等模型回复完成后返回回复全文（文本），工作台把它作为该步的“产物”保存。
// 每个论文项目复用一个专属会话（sessionID 存在 workflow state 里），
// 这样同一篇论文的提纲/写作/排版/评审都在一个上下文里，模型能记住前面的产出。
// [论文助手定制] 真实调用 Skill：file part / agent part 的类型定义与会话输入框共用同一个 SDK 类型。
import type { AgentPartInput, FilePartInput, TextPartInput } from "@opencode-ai/sdk/v2/client"
import { getFilename } from "@opencode-ai/core/util/path"
import { createSignal } from "solid-js"
import { useLocal } from "@/context/local"
import { encodeFilePath } from "@/context/file/path"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { Identifier } from "@/utils/id"
import { showToast } from "@/utils/toast"

const GENERATE_TIMEOUT_MS = 600_000

// [论文助手定制] 把工作台相对路径（如 模板/xxx.dotx、全文稿.md）解析为绝对路径，
// 规则与会话输入框 build-request-parts.ts 的 absolute() 一致，file part 用 file:// URL 提交给后端。
const absolutePath = (directory: string, path: string) => {
  if (path.startsWith("/")) return path
  if (/^[A-Za-z]:[\\/]/.test(path) || /^[A-Za-z]:$/.test(path)) return path
  if (path.startsWith("\\\\") || path.startsWith("//")) return path
  return `${directory.replace(/[\\/]+$/, "")}/${path}`
}

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
    // [论文助手定制] 真实模式（模型会先做多轮工具调用）的完成判定：
    // 工具调用步骤的 assistant 消息也会带 finish/time.completed，不能一看到就结束——
    // 必须等「最新的 assistant 消息 = 会话最后一条消息、且文本非空、且连续两轮文本不变」
    // 才判定整轮结束（避免中途拿到空文本或“好的，我来处理”这类半截话）。
    let stableTicks = 0
    let lastCandidate: { id: string; text: string } | undefined
    // [论文助手定制] 上一轮已回调的文本：文本没变化就不重复回调（避免流式期间高频触发 live store 更新）。
    let lastEmittedText: string | undefined
    // [论文助手定制] 无 finish 兜底辅助：候选消息是否含 tool part（工具调用步骤没有正文，
    // 不能按“文本稳定”提前结束，须等后续最终文本消息出现或覆盖它）。
    const hasToolPart = (m: { content?: readonly { type: string }[] }) => (m.content ?? []).some((p) => p.type === "tool")
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
        // [论文助手定制] 文本变化判断：与上一轮相同则跳过回调，不触发 live store 更新。
        if (onProgress && text !== lastEmittedText) {
          lastEmittedText = text
          onProgress(text)
        }
        if (message.error) {
          finish(undefined, new Error(message.error.message ?? "模型返回错误"))
          return
        }
        // [论文助手定制] 完成判定：
        // 显式 finish/time.completed 视为完成信号；个别协议不写 finish 时，若当前候选是
        // 「最后一条 assistant 消息、文本非空、且 content 不含 tool part」，也按
        // “连续 8 轮文本与 id 均不变”判定完成（约 3.2s 稳定），避免等到 10 分钟超时。
        const explicitDone = !!(message.finish || message.time.completed)
        const isLast = index === messages.length - 1
        const fallbackEligible = isLast && !!text.trim() && !hasToolPart(message)
        // [论文助手定制] 既无显式完成、也不满足兜底条件 → 还在流式输出，下一轮再查。
        if (!explicitDone && !fallbackEligible) break
        // [论文助手定制] 显式完成但不是会话最后一条 → 中间的工具调用步骤，
        // 等后续的工具结果/最终文本消息出现。
        if (explicitDone && !isLast) {
          lastCandidate = undefined
          stableTicks = 0
          break
        }
        // [论文助手定制] 是最后一条但文本为空（工具调用消息刚落盘）→ 继续等最终文本。
        if (!text.trim()) {
          lastCandidate = undefined
          stableTicks = 0
          break
        }
        // [论文助手定制] 最后一条且文本非空：显式完成时连续 2 轮（id 与文本都不变）即结束；
        // 无 finish 兜底时需连续 8 轮（约 3.2s 稳定）确认文本不再增长。
        const stableThreshold = explicitDone ? 2 : 8
        if (lastCandidate?.id === message.id && lastCandidate.text === text) {
          stableTicks += 1
          if (stableTicks >= stableThreshold) {
            finish(text)
            return
          }
        } else {
          lastCandidate = { id: message.id, text }
          stableTicks = 0
        }
        break
      }
    }, 400)
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
    // [论文助手定制] 真实调用 Skill 模式：把这里列出的 Skill 作为 agent part 提交给后端
    // （等价于会话输入框里 @skill 点名），后端会真正加载 Skill、放行工具并执行其脚本/指令；
    // 传了 agents 时 skills 的 SKILL.md 文本注入与 tools 禁用都会被跳过（见下方 realMode）。
    agents?: string[]
    // [论文助手定制] 真实调用 Skill 模式：把这里列出的项目文件作为 file part 提交给后端
    // （等价于会话输入框里 @模板.dotx @全文稿.md），模型可自行读取这些附件完成排版。
    attachments?: { path: string; mime?: string; filename?: string }[]
    // [论文助手定制] 强制走「真实文件链路」：true 时即使没选 Skill 也放行工具、
    // 附件转 file part（排版模块固定 true——排版本质就是“读文件→产出文件”，
    // 不再退回纯文本模式）；false/缺省时仅 agents 非空才进真实模式。
    real?: boolean
    // [论文助手定制] 是否允许模型调用工具：true 时不传 tools（用 agent 默认工具集），
    // false 时维持 tools: {"*": false} 保证纯文本流式输出（默认）。
    useTools?: boolean
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
      // [论文助手定制] 真实调用 Skill：agents 非空时不再把 SKILL.md 文本内嵌进提示词
      // （那只是“假调用”），而是把附件转 file part、Skill 转 agent part 提交，
      // 与用户在会话输入框发 @模板 @全文稿 @skill 完全等价；否则维持旧的文本注入逻辑。
      const realMode = options.real ?? (options.agents?.length ?? 0) > 0
      const prompt = realMode
        ? options.prompt
        : options.skills?.length
          ? options.prompt + (await buildSkillSection(sdk, options.skills))
          : options.prompt
      const parts: (TextPartInput | FilePartInput | AgentPartInput)[] = [{ type: "text", text: prompt }]
      if (realMode) {
        for (const attachment of options.attachments ?? []) {
          parts.push({
            type: "file",
            mime: attachment.mime ?? "text/plain",
            url: `file://${encodeFilePath(absolutePath(sdk().directory, attachment.path))}`,
            filename: attachment.filename ?? getFilename(attachment.path),
          })
        }
        for (const name of options.agents ?? []) {
          parts.push({
            type: "agent",
            name,
            source: { value: `@${name}`, start: 0, end: 0 },
          })
        }
      }
      const res = await sdk().client.session.promptAsync({
        sessionID,
        directory: sdk().directory,
        messageID: Identifier.ascending("message"),
        agent: agent?.name,
        model: model ? { providerID: model.provider.id, modelID: model.id } : undefined,
        // [论文助手定制] 工具开关：真实调用 Skill 时无条件放行工具（Skill 需要执行脚本/读写文件，
        // 否则“用 Skill 排版”只是空谈）；文本模式维持原逻辑——配置面板勾选「允许使用工具」时
        // 传 undefined（用 agent 默认工具集），否则传 {"*": false} 保证纯文本流式输出。
        tools: realMode ? undefined : options.useTools ? undefined : { "*": false },
        parts,
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
