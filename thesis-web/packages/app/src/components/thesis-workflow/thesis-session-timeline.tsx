// [论文助手定制] 工作台「会话」面板的时间线渲染：
// 复用全屏会话页同款的行构造（Timeline.constructSessionMessageRows）与行组件
// （Message / MessagePart / MessageDivider / SessionRetry / Error Card / DiffSummary / Thinking），
// 让工作台会话面板与全屏会话页显示一致（报错、diff 摘要、重试、思考过程都可见），
// 同时保留工作台自己的输入框与「采纳到画布」动作（renderApplyActions）。
import { createMemo, For, Show, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"
import { useSync } from "@/context/sync"
import { Card } from "@opencode-ai/ui/card"
import { TextReveal } from "@opencode-ai/ui/text-reveal"
import { TextShimmer } from "@opencode-ai/ui/text-shimmer"
import { Message, MessageDivider, Part as MessagePart } from "@opencode-ai/session-ui/message-part"
import { SessionRetry } from "@opencode-ai/session-ui/session-retry"
import type {
  AssistantMessage,
  Message as MessageType,
  SessionStatus,
  ToolPart,
  UserMessage,
} from "@opencode-ai/sdk/v2"
import { Timeline, TimelineRow } from "@/pages/session/timeline/rows"
import { TimelineDiffSummaryRow } from "@/pages/session/timeline/message-timeline"

const idle: SessionStatus = { type: "idle" }

export function ThesisSessionTimeline(props: {
  sessionID: string
  contentRef?: (el: HTMLDivElement | undefined) => void
  renderApplyActions?: (assistant: AssistantMessage) => JSX.Element
}) {
  const sync = useSync()
  const language = useLanguage()

  const status = createMemo(() => sync().data.session_status[props.sessionID] ?? idle)
  const messageByID = createMemo(() => {
    const map = new Map<string, MessageType>()
    for (const message of sync().data.message[props.sessionID] ?? []) map.set(message.id, message)
    return map
  })
  const getParts = (messageID: string) => sync().data.part[messageID] ?? []
  // [论文助手定制] 每个 user 轮次的助手消息列表：用于取轮次最后一条助手消息渲染「采纳」动作。
  const assistantMessagesByParent = createMemo(() => {
    const result = new Map<string, AssistantMessage[]>()
    for (const message of sync().data.message[props.sessionID] ?? []) {
      if (message.role !== "assistant") continue
      const item = message as AssistantMessage
      const list = result.get(message.parentID)
      if (list) list.push(item)
      else result.set(message.parentID, [item])
    }
    return result
  })
  const rows = createMemo(() =>
    Timeline.constructSessionMessageRows(
      sync().data.session_message[props.sessionID] ?? [],
      (id) => messageByID().get(id) as UserMessage | AssistantMessage | undefined,
      getParts,
      // [论文助手定制] 始终展开思考过程（与全屏会话页 showReasoningSummaries=true 一致）。
      true,
      status().type,
      false,
      [],
    ).rows,
  )
  // [论文助手定制] 按 user 轮次分组：同一轮的用户消息 + 助手片段 + 错误/diff/重试行渲染在一起，
  // 轮次末尾渲染一次「采纳到画布」动作（取该轮最后一条无错误助手消息）。
  const turns = createMemo(() => {
    const list: { userMessageID: string; rows: TimelineRow.TimelineRow[]; assistant?: AssistantMessage }[] = []
    const index = new Map<string, (typeof list)[number]>()
    for (const row of rows()) {
      const id = (row as { userMessageID: string }).userMessageID
      let entry = index.get(id)
      if (!entry) {
        entry = { userMessageID: id, rows: [] }
        index.set(id, entry)
        list.push(entry)
      }
      entry.rows.push(row)
    }
    for (const entry of list) {
      const assistants = assistantMessagesByParent().get(entry.userMessageID) ?? []
      entry.assistant = [...assistants].reverse().find((item) => !item.error) ?? assistants.at(-1)
    }
    return list
  })

  const renderAssistantPart = (row: TimelineRowMap["AssistantPart"]) => {
    const group = row.group
    if (group.type === "context") {
      const parts = group.refs
        .map((ref) => ({
          message: messageByID().get(ref.messageID),
          part: getParts(ref.messageID).find((item) => item.id === ref.partID),
        }))
        .filter((item): item is { message: MessageType; part: ToolPart } => !!item.message && item.part?.type === "tool")
      return (
        <div data-timeline-row="AssistantPart" class="px-4 py-2 md:px-5">
          <div class="flex flex-col gap-1 border-l-2 border-v2-border-border-base pl-2">
            <For each={parts}>{(item) => <MessagePart part={item.part} message={item.message} useV2Actions />}</For>
          </div>
        </div>
      )
    }
    const message = messageByID().get(group.ref.messageID)
    const part = getParts(group.ref.messageID).find((item) => item.id === group.ref.partID)
    if (!message || !part) return null
    return (
      <div data-timeline-row="AssistantPart" class="px-4 py-2 md:px-5">
        <MessagePart part={part} message={message} useV2Actions />
      </div>
    )
  }

  const renderRow = (row: TimelineRow.TimelineRow) => {
    switch (row._tag) {
      case "TurnGap":
        return <div data-timeline-row="TurnGap" aria-hidden="true" class="h-6" />
      case "CommentStrip":
        return null
      case "UserMessage": {
        const message = messageByID().get(row.userMessageID)
        if (message?.role !== "user") return null
        return (
          <div data-timeline-row="UserMessage" class="px-4 py-2 md:px-5">
            <Message message={message} parts={getParts(message.id)} useV2Actions />
          </div>
        )
      }
      case "TurnDivider":
        return (
          <div data-timeline-row="TurnDivider" class="px-4 py-2 md:px-5">
            <MessageDivider
              label={language.t(row.label === "compaction" ? "ui.messagePart.compaction" : "ui.message.interrupted")}
            />
          </div>
        )
      case "AssistantPart":
        return renderAssistantPart(row)
      case "Thinking":
        return (
          <div data-timeline-row="Thinking" class="px-4 py-2 md:px-5">
            <div data-slot="session-turn-thinking" class="flex items-center gap-2">
              <TextShimmer text={language.t("ui.sessionTurn.status.thinking")} />
              <Show when={row.reasoningHeading}>
                <TextReveal text={row.reasoningHeading!} class="session-turn-thinking-heading" travel={25} duration={700} />
              </Show>
            </div>
          </div>
        )
      case "Retry":
        return <SessionRetry status={status()} show />
      case "DiffSummary":
        // [论文助手定制] 与全屏会话页一致：DiffSummary 相关样式都挂在
        // [data-component="session-turn"] 之下（session-turn.css 嵌套选择器），
        // 工作台必须包一层同款容器，否则折叠/省略号/滚动样式全部失效。
        return (
          <div data-timeline-row="DiffSummary" class="min-w-0 w-full px-4 py-2 md:px-5">
            <div data-component="session-turn" class="min-w-0 w-full relative" style={{ height: "auto" }}>
              <TimelineDiffSummaryRow diffs={row.diffs} />
            </div>
          </div>
        )
      case "Error":
        return (
          <div data-timeline-row="Error" class="px-4 py-2 md:px-5">
            <Card variant="error" class="error-card">
              {row.text}
            </Card>
          </div>
        )
    }
  }

  return (
    <div ref={props.contentRef} class="flex flex-col">
      <For each={turns()}>
        {(turn) => (
          <div>
            <For each={turn.rows}>{(row) => renderRow(row)}</For>
            <Show when={props.renderApplyActions && turn.assistant}>
              <div class="px-4 md:px-5">{props.renderApplyActions!(turn.assistant!)}</div>
            </Show>
          </div>
        )}
      </For>
    </div>
  )
}

type TimelineRowMap = {
  AssistantPart: Extract<TimelineRow.TimelineRow, { _tag: "AssistantPart" }>
}
