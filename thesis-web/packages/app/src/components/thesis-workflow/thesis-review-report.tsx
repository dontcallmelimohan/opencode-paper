// [论文助手定制] 评审报告结构化展示：解析模型输出的 JSON 块（```json ... ```），
// 渲染为「总体评分环 + 分项指标 + 意见 + 修改建议」；解析失败则回退为 Markdown 文本。
// 对齐 pa 项目的评审输出形式（评分、指标、意见、建议），模型侧由提示词要求输出 JSON 块。
import { Icon } from "@opencode-ai/ui/icon"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { For, Show } from "solid-js"

export type ReviewMetric = { name: string; score: number }
export type ReviewItem = { level: "high" | "mid" | "low"; text: string }

export type ReviewReport = {
  score: number
  metrics: ReviewMetric[]
  comments: ReviewItem[]
  suggestions: ReviewItem[]
}

// [论文助手定制] 从评审文本中提取 ```json ... ``` 块并解析；找不到或解析失败返回 undefined。
export function parseReviewReport(text: string): ReviewReport | undefined {
  const match = text.match(/```json\s*([\s\S]*?)```/)
  if (!match) return undefined
  try {
    const raw = JSON.parse(match[1]) as Partial<ReviewReport>
    if (typeof raw.score !== "number" || !Array.isArray(raw.metrics)) return undefined
    return {
      score: Math.max(0, Math.min(100, Math.round(raw.score))),
      metrics: raw.metrics.slice(0, 8).map((metric) => ({
        name: String(metric?.name ?? ""),
        score: Math.max(0, Math.min(100, Number(metric?.score) || 0)),
      })),
      comments: Array.isArray(raw.comments)
        ? raw.comments.slice(0, 8).map((item) => ({ level: normalizeLevel(item?.level), text: String(item?.text ?? "") }))
        : [],
      suggestions: Array.isArray(raw.suggestions)
        ? raw.suggestions.slice(0, 8).map((item) => ({ level: normalizeLevel(item?.level), text: String(item?.text ?? "") }))
        : [],
    }
  } catch {
    return undefined
  }
}

function normalizeLevel(level: unknown): ReviewItem["level"] {
  if (level === "high" || level === "mid" || level === "low") return level
  return "mid"
}

const levelColor: Record<ReviewItem["level"], string> = {
  high: "bg-v2-background-bg-accent",
  mid: "bg-v2-state-bg-warning",
  low: "bg-v2-text-text-faint",
}

export function ThesisReviewReport(props: { text: string }) {
  const report = () => parseReviewReport(props.text)

  return (
    <div class="flex flex-col gap-4">
      <Show
        when={report()}
        fallback={
          <div class="mx-auto w-full max-w-3xl px-5 py-5">
            <Markdown text={props.text} cacheKey={props.text} class="thesis-markdown-preview" style={{ "font-size": "15px", "line-height": "1.8" }} />
          </div>
        }
      >
        <div class="mx-auto w-full max-w-3xl px-5 py-5">
          {/* 总体评分 */}
          <div class="mb-4 flex items-center gap-4 rounded-[10px] bg-v2-background-bg-layer-01 p-4">
            <div
              class="flex size-16 shrink-0 items-center justify-center rounded-full border-4 text-20-medium text-v2-text-text-accent"
              classList={{
                // [论文助手定制] 分数低于 60 时用半透明强调色表示"未达标"。
                "border-v2-border-border-focus": report()!.score >= 60,
                "border-v2-state-border-warning": report()!.score < 60,
              }}
            >
              {report()!.score}
            </div>
            <div class="min-w-0">
              <div class="text-13-medium text-v2-text-text-base">总体评分（百分制）</div>
              <div class="text-12-regular text-v2-text-text-faint">
                {report()!.score >= 86 ? "稿件基础较好，建议补强文献证据与格式细节。" : report()!.score >= 72 ? "稿件已有雏形，需集中修改结构与论证。" : "稿件仍处早期草稿阶段，建议先重建提纲。"}
              </div>
            </div>
          </div>

          {/* 分项指标 */}
          <Show when={report()!.metrics.length > 0}>
            <div class="mb-4 flex flex-col gap-2">
              <div class="text-13-medium text-v2-text-text-base">分项指标</div>
              <For each={report()!.metrics}>
                {(metric) => (
                  <div class="flex items-center gap-2">
                    <span class="w-24 shrink-0 truncate text-12-regular text-v2-text-text-base">{metric.name}</span>
                    <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-v2-background-bg-layer-01">
                      <div class="h-full rounded-full bg-v2-background-bg-accent" style={{ width: `${metric.score}%` }} />
                    </div>
                    <span class="w-8 shrink-0 text-right text-12-regular text-v2-text-text-base">{metric.score}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* 意见 */}
          <Show when={report()!.comments.length > 0}>
            <div class="mb-4 flex flex-col gap-1.5">
              <div class="text-13-medium text-v2-text-text-base">评审意见</div>
              <ul class="flex flex-col gap-1">
                <For each={report()!.comments}>
                  {(item) => (
                    <li class="flex items-start gap-2 text-13-regular text-v2-text-text-base">
                      <span class={`mt-1.5 size-2 shrink-0 rounded-full ${levelColor[item.level]}`} />
                      {item.text}
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </Show>

          {/* 修改建议 */}
          <Show when={report()!.suggestions.length > 0}>
            <div class="flex flex-col gap-1.5">
              <div class="text-13-medium text-v2-text-text-base">修改建议</div>
              <ul class="flex flex-col gap-1">
                <For each={report()!.suggestions}>
                  {(item) => (
                    <li class="flex items-start gap-2 text-13-regular text-v2-text-text-base">
                      <span class={`mt-1.5 size-2 shrink-0 rounded-full ${levelColor[item.level]}`} />
                      {item.text}
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </Show>

          <Show when={!report()!.comments.length && !report()!.suggestions.length}>
            <div class="flex items-center gap-1.5 text-12-regular text-v2-text-text-faint">
              <Icon name="circle-check" size="small" />
              报告已生成，完整内容见生成记录。
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}
