// [论文助手定制] 工作台「会话」面板的时间线渲染：
// 复用全屏会话页同款的行构造（Timeline.constructSessionMessageRows）与行组件
// （Message / MessagePart / MessageDivider / SessionRetry / Error Card / DiffSummary / Thinking），
// 让工作台会话面板与全屏会话页显示一致（报错、diff 摘要、重试、思考过程都可见），
// 同时保留工作台自己的输入框与「采纳到画布」动作（renderApplyActions）。
import { createEffect, createMemo, createSignal, For, onCleanup, Show, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"
import { useSync } from "@/context/sync"
import { Card } from "@opencode-ai/ui/card"
import { ImagePreview } from "@opencode-ai/ui/image-preview"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { TextReveal } from "@opencode-ai/ui/text-reveal"
import { TextShimmer } from "@opencode-ai/ui/text-shimmer"
import { Message, MessageDivider, Part as MessagePart } from "@opencode-ai/session-ui/message-part"
import { SessionRetry } from "@opencode-ai/session-ui/session-retry"
import { useSDK } from "@/context/sdk"
import type {
  AssistantMessage,
  Message as MessageType,
  SessionStatus,
  ToolPart,
  UserMessage,
} from "@opencode-ai/sdk/v2"
import { Timeline, TimelineRow } from "@/pages/session/timeline/rows"
import { reuseTimelineRows } from "@/pages/session/timeline/projection"
import { TimelineDiffSummaryRow } from "@/pages/session/timeline/message-timeline"
import { cachedDataUrl, ensureFigureDataUrls } from "./thesis-assets"

const idle: SessionStatus = { type: "idle" }

// [论文助手定制] 会话内“直接看图”：不依赖消息 Markdown 渲染（模型常把引用行包在代码块里输出），
// 直接扫描该轮助手消息原文里的 ![alt](asset://materials/x.png) 引用，解析成本机 data URL，
// 在该轮回复下方渲染成可点击放大的图组，与文稿画布/文件空间看到的是同一张图。
const ASSET_FIGURE_RE = /!\[([^\]]*)\]\(asset:\/\/([^)\s]+)\)/g

function TurnFigureGallery(props: { assistants: AssistantMessage[]; directory: string }) {
  const sync = useSync()
  const sdk = useSDK()
  const dialog = useDialog()
  // [论文助手定制] 读该轮助手消息的完整原文：与正文渲染一致地从 part store 读文本，
  // 流式期间 delta 累积文本比 part.text 新时用 delta（readPartText 语义）。
  const refs = createMemo(() => {
    const messages = props.assistants ?? []
    if (messages.length === 0) return []
    const parts = messages.flatMap((message) => sync().data.part[message.id] ?? [])
    const text = parts
      .filter((part) => part.type === "text")
      .map((part) => {
        const delta = sync().data.part_text_accum_delta?.[part.id]
        const current = part.text ?? ""
        return typeof delta === "string" && delta.length > current.length ? delta : current
      })
      .join("\n")
    const list: { ref: string; alt: string }[] = []
    for (const match of text.matchAll(ASSET_FIGURE_RE)) {
      const ref = match[2]
      if (ref && !list.some((item) => item.ref === ref)) list.push({ ref, alt: match[1] ?? "" })
    }
    return list
  })
  const [urls, setUrls] = createSignal<Record<string, string>>({})
  createEffect(() => {
    const signature = refs().map((item) => item.ref).join("\n")
    if (!signature) {
      setUrls({})
      return
    }
    let cancelled = false
    void ensureFigureDataUrls(sdk(), props.directory, refs().map((item) => item.ref))
      .then(() => {
        if (cancelled) return
        const map: Record<string, string> = {}
        for (const item of refs()) {
          const url = cachedDataUrl(props.directory, item.ref)
          if (url) map[item.ref] = url
        }
        setUrls(map)
      })
      .catch(() => {
        if (!cancelled) setUrls({})
      })
    onCleanup(() => {
      cancelled = true
    })
  })
  const items = createMemo(() =>
    refs()
      .filter((item) => urls()[item.ref])
      .map((item) => ({ ref: item.ref, alt: item.alt, url: urls()[item.ref]! })),
  )
  return (
    <Show when={items().length > 0}>
      <div data-timeline-row="TurnFigureGallery" class="px-4 py-2 md:px-5">
        <div class="flex flex-wrap gap-3">
          <For each={items()}>
            {(item) => (
              <button
                type="button"
                title={item.alt || "查看图片"}
                class="group cursor-zoom-in overflow-hidden rounded-md border workbench-border bg-v2-background-bg-layer-01 p-1"
                onClick={(event) => {
                  event.stopPropagation()
                  dialog.show(() => <ImagePreview src={item.url} alt={item.alt || undefined} />)
                }}
              >
                <img src={item.url} alt={item.alt} class="block max-h-64 max-w-full rounded-sm" />
              </button>
            )}
          </For>
        </div>
      </div>
    </Show>
  )
}

export function ThesisSessionTimeline(props: {
  sessionID: string
  contentRef?: (el: HTMLDivElement | undefined) => void
  renderApplyActions?: (assistant: AssistantMessage) => JSX.Element
}) {
  const sync = useSync()
  const language = useLanguage()
  const sdk = useSDK()
  const dialog = useDialog()
  let rootEl: HTMLDivElement | undefined
  let assetVersion = 0
  let assetTimer: ReturnType<typeof setTimeout> | undefined

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
  // [论文助手定制] 流式输出优化：行引用复用（与全屏会话页一致）。
  // 每次新 token 只替换实际变化的行，未变化行保持原引用，避免整列时间线全量重渲染导致卡顿。
  const rows = createMemo((previous: TimelineRow.TimelineRow[] | undefined) =>
    reuseTimelineRows(
      previous,
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
    ),
  )
  // [论文助手定制] 按 user 轮次分组：同一轮的用户消息 + 助手片段 + 错误/diff/重试行渲染在一起，
  // 轮次末尾渲染一次「采纳到画布」动作（取该轮最后一条无错误助手消息）。
  type TurnEntry = { userMessageID: string; rows: TimelineRow.TimelineRow[]; assistant?: AssistantMessage; assistants: AssistantMessage[] }
  // [论文助手定制] turn 分组引用稳定化：行引用未变化的轮次复用上一个 turn 对象，
  // 让外层 <For> 只重渲染确实有内容变化的轮次（流式输出时仅最后一轮变化）。
  const turns = createMemo((previous: TurnEntry[] | undefined) => {
    const rowsNow = rows()
    const grouped = new Map<string, TimelineRow.TimelineRow[]>()
    const order: string[] = []
    for (const row of rowsNow) {
      const id = (row as { userMessageID: string }).userMessageID
      let arr = grouped.get(id)
      if (!arr) {
        arr = []
        grouped.set(id, arr)
        order.push(id)
      }
      arr.push(row)
    }
    const prev = new Map((previous ?? []).map((entry) => [entry.userMessageID, entry] as const))
    const list: TurnEntry[] = []
    for (const id of order) {
      const current = grouped.get(id)!
      const old = prev.get(id)
      const same = old !== undefined && old.rows.length === current.length && old.rows.every((row, i) => row === current[i])
      if (same) {
        list.push(old!)
        continue
      }
      const assistants = assistantMessagesByParent().get(id) ?? []
      list.push({
        userMessageID: id,
        rows: current,
        assistant: [...assistants].reverse().find((item) => !item.error) ?? assistants.at(-1),
        assistants,
      })
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

  // [论文助手定制] 会话内图片预览：把 Markdown 里的 asset://materials/ 引用解析成 data URL
  // （与文稿画布同一套解析与缓存），让代码图表 / AI 生图在会话里直接可见。
  const decodeAssetRef = (src: string) => {
    try {
      return decodeURIComponent(src.slice("asset://".length))
    } catch {
      return src.slice("asset://".length)
    }
  }
  const scanAssetImages = async () => {
    const root = rootEl
    if (!root) return
    const directory = sdk().directory
    const images = Array.from(root.querySelectorAll<HTMLImageElement>('img[src^="asset://"]'))
    if (images.length === 0) return
    const refs = images.map((image) => decodeAssetRef(image.getAttribute("src") ?? ""))
    const version = ++assetVersion
    await ensureFigureDataUrls(sdk(), directory, refs)
    if (version !== assetVersion) return
    for (const image of images) {
      const src = image.getAttribute("src") ?? ""
      if (!src.startsWith("asset://")) continue
      const url = cachedDataUrl(directory, decodeAssetRef(src))
      if (url && image.getAttribute("src") !== url) image.setAttribute("src", url)
    }
  }
  // 流式输出时文本每 token 都在变：等停止 ~350ms 后再解析一次，避免每帧读文件/改 DOM。
  createEffect(() => {
    rows()
    clearTimeout(assetTimer)
    assetTimer = setTimeout(() => {
      void scanAssetImages()
    }, 350)
    onCleanup(() => clearTimeout(assetTimer))
  })
  // [论文助手定制] 点击会话里的图片放大预览。
  const handleContainerClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null
    const image = target?.closest?.("img") as HTMLImageElement | undefined
    if (!image) return
    const src = image.currentSrc || image.getAttribute("src")
    if (!src) return
    event.stopPropagation()
    dialog.show(() => <ImagePreview src={src} alt={image.alt || undefined} />)
  }
  const setContainerRef = (element: HTMLDivElement | undefined) => {
    rootEl = element
    props.contentRef?.(element)
  }

  return (
    <div ref={setContainerRef} onClick={handleContainerClick} class="flex flex-col">
      <For each={turns()}>
        {(turn) => (
          <div>
            <For each={turn.rows}>{(row) => renderRow(row)}</For>
            {/* [论文助手定制] 该轮回复里引用的 asset 图片直接显示在回复正文下方（采纳动作之前） */}
            <TurnFigureGallery assistants={turn.assistants} directory={sdk().directory} />
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
