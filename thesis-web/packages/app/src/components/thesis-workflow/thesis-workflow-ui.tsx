// [论文助手定制] 论文工作台各步骤共用的布局组件：
// 左侧“输入表单” + 右侧“产物面板”，产物用 Markdown 渲染。
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { createSignal, Show, type JSX } from "solid-js"
import type { StepStatus } from "./thesis-workflow-store"
import { useThesisWorkflow } from "./thesis-workflow-store"
import { ThesisSessionView } from "./thesis-session-view"

export function StepLayout(props: { form: JSX.Element; product: JSX.Element }) {
  return (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-2 md:flex-row">
      <div class="w-full shrink-0 md:w-[340px] md:overflow-y-auto">{props.form}</div>
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">{props.product}</div>
    </div>
  )
}

export function StepFormPanel(props: {
  stepLabel: string
  title: string
  subtitle?: string
  children: JSX.Element
  footer?: JSX.Element
}) {
  return (
    <div class="flex h-full min-h-0 flex-col gap-3 overflow-y-auto rounded-[10px] bg-v2-background-bg-base p-3 shadow-[var(--v2-elevation-raised)]">
      <div>
        <div class="text-11-regular text-v2-text-text-accent">{props.stepLabel}</div>
        <div class="text-14-medium text-v2-text-text-base">{props.title}</div>
        <Show when={props.subtitle}>
          <div class="text-12-regular text-v2-text-text-faint">{props.subtitle}</div>
        </Show>
      </div>
      <div class="flex min-h-0 flex-1 flex-col gap-3">{props.children}</div>
      <Show when={props.footer}>{props.footer}</Show>
    </div>
  )
}

export function StepProductPanel(props: {
  title: string
  status: StepStatus
  progressText?: string
  result?: string
  emptyHint: string
  footer?: JSX.Element
  // [论文助手定制] 可选自定义产物渲染（如评审报告的结构化展示），默认 Markdown。
  render?: (result: string) => JSX.Element
}) {
  // [论文助手定制] 产物区域顶部加「文稿 / 会话」切换：会话视图在同一个位置显示该论文专属会话的聊天记录，
  // 生成过程中可以来回切换看“文稿进度”和“对话过程”。
  const { state } = useThesisWorkflow()
  const [view, setView] = createSignal<"document" | "session">("document")

  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-[10px] bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]">
      <div class="flex shrink-0 items-center gap-2 px-3 py-2">
        <span class="text-13-medium text-v2-text-text-base">{props.title}</span>
        <span class="ml-auto">
          <Show
            when={props.status === "done"}
            fallback={
              <Show
                when={props.status === "generating"}
                fallback={<span class="rounded-full bg-v2-background-bg-layer-01 px-2 py-0.5 text-10-medium text-v2-text-text-faint">待生成</span>}
              >
                <span class="rounded-full bg-v2-state-bg-info px-2 py-0.5 text-10-medium text-v2-text-text-accent">生成中…</span>
              </Show>
            }
          >
            <span class="flex items-center gap-1 rounded-full bg-v2-state-bg-info px-2 py-0.5 text-10-medium text-v2-text-text-accent">
              <Icon name="circle-check" size="small" /> 已完成
            </span>
          </Show>
        </span>
        {/* [论文助手定制] 文稿 / 会话切换按钮；没有会话前「会话」不可点。 */}
        <div class="flex shrink-0 items-center gap-0.5 rounded-md bg-v2-background-bg-layer-01 p-0.5">
          <button
            type="button"
            class="cursor-pointer rounded px-2 py-1 text-12-medium transition-colors"
            classList={{
              "bg-v2-background-bg-base text-v2-text-text-accent shadow-[var(--v2-elevation-raised)]": view() === "document",
              "text-v2-text-text-muted hover:text-v2-text-text-base": view() !== "document",
            }}
            onClick={() => setView("document")}
          >
            文稿
          </button>
          <button
            type="button"
            class="cursor-pointer rounded px-2 py-1 text-12-medium transition-colors"
            classList={{
              "bg-v2-background-bg-base text-v2-text-text-accent shadow-[var(--v2-elevation-raised)]": view() === "session",
              "text-v2-text-text-muted hover:text-v2-text-text-base": view() !== "session",
            }}
            disabled={!state().sessionID}
            onClick={() => setView("session")}
          >
            会话
          </button>
        </div>
      </div>
      <Show
        when={view() !== "session"}
        fallback={<div class="min-h-0 flex-1 overflow-hidden"><ThesisSessionView /></div>}
      >
        <div class="min-h-0 flex-1 overflow-y-auto">
          <Show
            when={props.status !== "idle"}
            fallback={
              <div class="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                <Icon name="pencil-line" size="large" class="text-v2-text-text-faint" />
                <div class="text-12-regular text-v2-text-text-faint">{props.emptyHint}</div>
              </div>
            }
          >
            {/* [论文助手定制] 只有“生成中且还没有任何文本”才显示转圈；有流式 progress 时直接渲染内容。 */}
            <Show
              when={props.status === "generating" && !props.result && !props.progressText}
              fallback={
                <Show when={props.render} fallback={
                  <div class="mx-auto w-full max-w-3xl px-5 py-5">
                    {/* [论文助手定制] 边生成边显示：result（上次完成的全文）+ progress（本次正在生成的文本）拼接渲染。 */}
                    <Markdown
                      text={[props.result, props.progressText].filter(Boolean).join("\n\n")}
                      cacheKey={`${props.result ?? ""}\u0000${props.progressText ?? ""}`}
                      class="thesis-markdown-preview"
                      style={{ "font-size": "15px", "line-height": "1.8" }}
                    />
                  </div>
                }>
                  {props.render!(props.result ?? props.progressText ?? "")}
                </Show>
              }
            >
              <div class="flex h-full items-center justify-center gap-2 px-6 text-12-regular text-v2-text-text-faint">
                <span class="size-3 animate-spin rounded-full border-2 border-v2-border-border-focus border-t-transparent" />
                模型生成中，请稍候…
              </div>
            </Show>
          </Show>
        </div>
        <Show when={props.footer}>
          <div class="flex shrink-0 items-center justify-end gap-2 border-t border-v2-border-border-base px-3 py-2">{props.footer}</div>
        </Show>
      </Show>
    </div>
  )
}
