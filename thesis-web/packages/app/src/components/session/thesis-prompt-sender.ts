// [论文助手定制] 通用的“把配置信息打包成提示词并发送到当前会话”逻辑，
// 供提纲助手面板与通用模式配置面板复用。
// - 会话页：直接把文本作为用户消息发给当前会话，模型能在对话中看到。
// - 新建会话草稿页（没有 sessionID）：先创建会话并跳转到会话页，再发送。
import { useNavigate, useSearchParams } from "@solidjs/router"
import { createSignal } from "solid-js"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { useLocal } from "@/context/local"
import { useSDK } from "@/context/sdk"
import { useTabs } from "@/context/tabs"
import { showToast } from "@/utils/toast"
import { Identifier } from "@/utils/id"

const formatApiError = (error: unknown, fallback: string) => {
  if (error && typeof error === "object") {
    const data = (error as { data?: { message?: unknown } }).data
    if (typeof data?.message === "string") return data.message
    const message = (error as { message?: unknown }).message
    if (typeof message === "string") return message
  }
  return fallback
}

export function useThesisPromptSender(props: { sessionID: string | undefined }) {
  const sdk = useSDK()
  const local = useLocal()
  const navigate = useNavigate()
  const tabs = useTabs()
  const [searchParams] = useSearchParams<{ draftId?: string }>()
  const [sending, setSending] = createSignal(false)

  const ensureSessionID = async (): Promise<string | undefined> => {
    try {
      const created = await sdk().api.session.create({
        location: { directory: sdk().directory },
      })
      const id = created.id
      const draftID = searchParams.draftId
      const draft = draftID ? tabs.draft(draftID) : undefined
      if (draft) {
        tabs.promoteDraft(draftID!, { server: draft.server, sessionId: id })
      } else {
        navigate(`/${base64Encode(sdk().directory)}/session/${id}`)
      }
      return id
    } catch (err) {
      showToast({
        variant: "error",
        icon: "circle-x",
        title: "创建会话失败",
        description: formatApiError(err, "请稍后重试"),
      })
      return undefined
    }
  }

  // 发送成功后返回 true；失败或被跳过返回 false。
  const send = async (text: string): Promise<boolean> => {
    if (!text.trim()) return false
    if (sending()) return false
    setSending(true)
    try {
      let sessionID = props.sessionID
      if (!sessionID) sessionID = await ensureSessionID()
      if (!sessionID) return false
      const agent = local.agent.current()
      const model = local.model.current()
      const res = await sdk().client.session.prompt({
        sessionID,
        directory: sdk().directory,
        messageID: Identifier.ascending("message"),
        agent: agent?.name,
        model: model ? { providerID: model.provider.id, modelID: model.id } : undefined,
        parts: [{ type: "text", text }],
      })
      if (res.error) throw res.error
      showToast({
        variant: "success",
        icon: "circle-check",
        title: "已发送到会话",
        description: "模型可以在对话中看到这份配置信息",
      })
      return true
    } catch (err) {
      showToast({
        variant: "error",
        icon: "circle-x",
        title: "发送失败",
        description: formatApiError(err, "请稍后重试"),
      })
      return false
    } finally {
      setSending(false)
    }
  }

  return { send, sending }
}
