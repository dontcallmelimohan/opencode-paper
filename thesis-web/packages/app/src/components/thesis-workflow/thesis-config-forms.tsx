// [论文助手定制] 配置面板浮窗化：outline / writing 的配置从左侧列改为会话输入框底栏图标
// 弹出的居中 Dialog 浮窗。浮窗只含「勾选论文要求」的表单，不含 Skill / 知识库 / 插图区块；
// 文件与 skill 走会话输入框原生能力（@文件、skill 菜单），插图（writing）走底栏「插图」图标。
// 配置不再随会话文本注入提示词：改为落盘到文件空间的固定文件，由「提纲助手」等 Skill 直接读取。
// 落盘路径见 THESIS_TOPIC_FILE_PATH（config/论文主题.md）。
import { Button } from "@opencode-ai/ui/button"
import { Checkbox } from "@opencode-ai/ui/checkbox"
import { Dialog } from "@opencode-ai/ui/dialog"
import { TextField } from "@opencode-ai/ui/text-field"
import { For, Show } from "solid-js"
import { useThesisWorkflow, type OutlineInput, type WritingInput } from "./thesis-workflow-store"
import { InputSourceSelect } from "./thesis-workflow-ui"
import { useSDK } from "@/context/sdk"
import { useThesisManuscriptFile } from "./thesis-manuscript-file"

// [论文助手定制] 配置信息的唯一交付物：写入文件空间的固定文件，由 Skill 读取（不再注入会话文本）。
// 放在 config/ 子目录，与根目录文稿（提纲.md 等）、docs/ 独立文档隔离，不污染文档下拉。
export const THESIS_TOPIC_FILE_PATH = "config/论文主题.md"

// [论文助手定制] 方向侧重选项（写入提示词）。
const DIRECTIONS = [
  { key: "review", label: "现状梳理", hint: "梳理该方向的研究现状与进展" },
  { key: "depth", label: "深度", hint: "对关键问题做深入分析" },
  { key: "standard", label: "标准", hint: "按学术规范组织章节" },
  { key: "clue", label: "论文线索", hint: "标注各章节相关的论文线索" },
] as const

// [论文助手定制] Step 1 论文设定选项：类型 / 语言 / 图表 / 目标字数（全部写入提示词）。
const PAPER_TYPES = ["期刊论文", "毕业论文", "会议论文", "综述论文", "其他"] as const
const LANGUAGES = ["中文", "英文"] as const
const HAS_FIGURES = ["有图表", "无图表"] as const
const TARGET_WORDS = ["1000","2000","3000", "5000", "8000", "12000", "15000", "20000"] as const

const STYLES = ["学术、审慎、综述型", "逻辑清晰、偏实证", "批判性强、强调争议", "中文核心期刊风格", "英文 SCI 风格"]
const FOCUSES = ["研究脉络与概念边界", "方法比较与证据整合", "应用场景与实践价值", "不足、争议与未来趋势"]
const REFERENCE_STYLES = ["GB/T 7714-2015", "APA 7th", "Vancouver", "IEEE"]

// [论文助手定制] 浮窗内表单统一样式（下拉选择框，与左侧配置列一致）。
const selectClass =
  "h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"

// [论文助手定制] 提纲配置浮窗（2.1）：描述综述需求 + 论文设定 + 方向侧重 + 生成选项。
// 无 Skill / 知识库 / 插图区块；生成 = 会话输入框发送，浮窗内不提供生成按钮。
export function OutlineConfigForm(props?: { onClose?: () => void }) {
  const { state, updateInput } = useThesisWorkflow()
  const sdk = useSDK()
  const manuscript = useThesisManuscriptFile(sdk().directory)
  const input = () => state().steps.outline.input

  const toggleDirection = (key: (typeof DIRECTIONS)[number]["key"]) => {
    const current = input().directions
    updateInput("outline", {
      directions: current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    })
  }

  return (
    <Dialog
      title="提纲配置"
      description="勾选论文要求，随会话发送自动注入提示词（文件与 skill 请在输入框使用 @ 或菜单选择）"
      size="large"
    >
      <div class="mx-auto flex w-[520px] max-w-full flex-col gap-3 px-2.5 pb-4">
        <section class="flex flex-col gap-1.5">
          <div class="text-12-medium text-v2-text-text-base">描述综述需求</div>
          <TextField
            multiline
            placeholder="输入选题想法、已有草稿、老师意见、论文摘要或文献摘录..."
            value={input().needs}
            onChange={(value) => updateInput("outline", { needs: value })}
          />
        </section>
        <section class="flex flex-col gap-1.5">
          <div class="text-12-medium text-v2-text-text-base">论文设定</div>
          <div class="grid grid-cols-2 gap-2">
            <section class="flex min-w-0 flex-col gap-1.5">
              <div class="text-11-regular text-v2-text-text-faint">论文类型</div>
              <select
                class={selectClass}
                value={input().paperType}
                onChange={(event) => updateInput("outline", { paperType: event.currentTarget.value })}
              >
                <For each={PAPER_TYPES}>{(item) => <option value={item}>{item}</option>}</For>
              </select>
            </section>
            <section class="flex min-w-0 flex-col gap-1.5">
              <div class="text-11-regular text-v2-text-text-faint">论文语言</div>
              <select
                class={selectClass}
                value={input().language}
                onChange={(event) => updateInput("outline", { language: event.currentTarget.value })}
              >
                <For each={LANGUAGES}>{(item) => <option value={item}>{item}</option>}</For>
              </select>
            </section>
            <section class="flex min-w-0 flex-col gap-1.5">
              <div class="text-11-regular text-v2-text-text-faint">图表</div>
              <select
                class={selectClass}
                value={input().hasFigures}
                onChange={(event) => updateInput("outline", { hasFigures: event.currentTarget.value })}
              >
                <For each={HAS_FIGURES}>{(item) => <option value={item}>{item}</option>}</For>
              </select>
            </section>
            <section class="flex min-w-0 flex-col gap-1.5">
              <div class="text-11-regular text-v2-text-text-faint">大约字数</div>
              <select
                class={selectClass}
                value={input().targetWords}
                onChange={(event) => updateInput("outline", { targetWords: event.currentTarget.value })}
              >
                <For each={TARGET_WORDS}>{(item) => <option value={item}>{item}</option>}</For>
              </select>
            </section>
          </div>
        </section>
        <section class="flex flex-col gap-1.5">
          <div class="text-12-medium text-v2-text-text-base">方向</div>
          <div class="flex flex-col gap-1">
            <For each={DIRECTIONS}>
              {(item) => (
                <Checkbox checked={input().directions.includes(item.key)} onChange={() => toggleDirection(item.key)}>
                  {item.label}
                </Checkbox>
              )}
            </For>
          </div>
        </section>
        <section class="flex flex-col gap-1.5">
          <div class="text-12-medium text-v2-text-text-base">生成选项</div>
          <Checkbox checked={input().aiSuggest} onChange={(value) => updateInput("outline", { aiSuggest: value })}>
            AI 建议（每章写作要点与提示）
          </Checkbox>
          <Checkbox checked={input().optimize} onChange={(value) => updateInput("outline", { optimize: value })}>
            提纲优化提醒
          </Checkbox>
        </section>
        <div class="flex items-center justify-end gap-2">
          <span class="text-11-regular text-v2-text-text-faint">
            点击后配置写入文件空间 {THESIS_TOPIC_FILE_PATH}，由技能读取；再次点击可更新
          </span>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              // [论文助手定制] 配置信息的唯一交付方式：把配置里的综述需求/论文设定写入文件空间固定文件
              // config/论文主题.md，让「提纲助手」等 Skill 直接读工作目录拿到主题，不依赖会话文本；
              // 再次点击会按最新配置重写同一文件。
              void manuscript.saveFile(THESIS_TOPIC_FILE_PATH, buildTopicFileContent("outline", input()))
              // 关闭统一交给 step 层 onClose → setConfigOpen(false) → effect 调 dialog.close()，
              // 这里不直接 dialog.close()，避免 dialog 的 100ms closing/lock 窗口吞掉关闭导致状态卡死。
              props?.onClose?.()
            }}
          >
            同步到文件空间
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

// [论文助手定制] 辅助写作配置浮窗（2.2）：参考提纲来源 + 写作设定 + 章节与额外要求。
// 无 Skill / 无文件选择（file 旧值按 auto 兜底）/ 无插图区块。
export function WritingConfigForm(props?: { onClose?: () => void }) {
  const { state, updateInput } = useThesisWorkflow()
  const sdk = useSDK()
  const manuscript = useThesisManuscriptFile(sdk().directory)
  const input = () => state().steps.writing.input
  // [论文助手定制] file 旧值按 auto 兜底（浮窗不再提供文件来源选项）。
  const source = () => (input().outlineSource === "file" ? "auto" : input().outlineSource)

  return (
    <Dialog
      title="写作配置"
      description="勾选写作设定，随会话发送自动注入提示词（参考提纲文件请用输入框 @ 或「插入文件」）"
      size="large"
    >
      <div class="mx-auto flex w-[520px] max-w-full flex-col gap-3 px-2.5 pb-4">
        <InputSourceSelect
          label="参考提纲"
          value={source()}
          onChange={(value) => updateInput("writing", { outlineSource: value })}
          autoLabel="自动使用提纲结果（提纲模块已生成则自动带入）"
          manualLabel="手动粘贴提纲"
          noneLabel="不用提纲（按通用综述结构撰写）"
        />
        <Show when={input().outlineSource === "manual"}>
          <TextField
            multiline
            placeholder="粘贴你的提纲…"
            value={input().manualOutline}
            onChange={(value) => updateInput("writing", { manualOutline: value })}
          />
        </Show>
        <section class="flex flex-col gap-1.5">
          <div class="text-12-medium text-v2-text-text-base">目标期刊 / 投稿方向</div>
          <TextField
            placeholder="例如：中国科技论文、SCI Q2、教育研究类期刊"
            value={input().journal}
            onChange={(value) => updateInput("writing", { journal: value })}
          />
        </section>
        <section class="flex flex-col gap-1.5">
          <div class="text-12-medium text-v2-text-text-base">写作风格</div>
          <select
            class={selectClass}
            value={input().style}
            onChange={(event) => updateInput("writing", { style: event.currentTarget.value })}
          >
            <For each={STYLES}>{(item) => <option value={item}>{item}</option>}</For>
          </select>
        </section>
        <section class="flex flex-col gap-1.5">
          <div class="text-12-medium text-v2-text-text-base">侧重点</div>
          <select
            class={selectClass}
            value={input().focus}
            onChange={(event) => updateInput("writing", { focus: event.currentTarget.value })}
          >
            <For each={FOCUSES}>{(item) => <option value={item}>{item}</option>}</For>
          </select>
        </section>
        <div class="flex gap-2">
          <section class="flex min-w-0 flex-1 flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">参考文献格式</div>
            <select
              class={selectClass}
              value={input().referenceStyle}
              onChange={(event) => updateInput("writing", { referenceStyle: event.currentTarget.value })}
            >
              <For each={REFERENCE_STYLES}>{(item) => <option value={item}>{item}</option>}</For>
            </select>
          </section>
          <section class="flex min-w-0 flex-1 flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">目标长度（字）</div>
            <TextField
              type="text"
              value={input().length}
              onChange={(value) => updateInput("writing", { length: value })}
            />
          </section>
        </div>
        <section class="flex flex-col gap-1.5">
          <div class="text-12-medium text-v2-text-text-base">本次撰写章节</div>
          <TextField
            placeholder="留空 = 按提纲完整撰写；或填写章节名，例如：第二章 研究现状"
            value={input().chapter}
            onChange={(value) => updateInput("writing", { chapter: value })}
          />
        </section>
        <section class="flex flex-col gap-1.5">
          <div class="text-12-medium text-v2-text-text-base">额外要求</div>
          <TextField
            multiline
            placeholder="例如：强调研究现状和文献不足，语言要像中文核心期刊"
            value={input().extra}
            onChange={(value) => updateInput("writing", { extra: value })}
          />
        </section>
        <div class="flex items-center justify-end gap-2">
          <span class="text-11-regular text-v2-text-text-faint">
            点击后配置写入文件空间 {THESIS_TOPIC_FILE_PATH}，由技能读取；再次点击可更新
          </span>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              // [论文助手定制] 配置信息唯一交付方式：写入文件空间固定文件 config/论文主题.md
              // （含参考提纲与写作设定），供「提纲助手」等 Skill 直接读取；再次点击按最新配置重写。
              void manuscript.saveFile(
                THESIS_TOPIC_FILE_PATH,
                buildTopicFileContent("writing", input(), state().steps.outline.result),
              )
              // 关闭统一交给 step 层 onClose → setConfigOpen(false) → effect 调 dialog.close()，
              // 这里不直接 dialog.close()，避免 dialog 的 100ms closing/lock 窗口吞掉关闭导致状态卡死。
              props?.onClose?.()
            }}
          >
            同步到文件空间
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

// [论文助手定制] 生成项目根目录「论文主题.md」的内容：把用户在配置里填的主题/需求落成文件，
// 让只会「读工作目录找主题」的 Agent（或其子任务）也能拿到论文主题，而不必依赖会话文本。
// outline = 综述需求 + 提纲配置；writing = 参考提纲（auto 用提纲模块结果 / manual 用粘贴内容）+ 写作设定。
export function buildTopicFileContent(
  step: "outline" | "writing",
  input: OutlineInput | WritingInput,
  outlineResult?: string,
): string {
  const lines: string[] = ["# 论文主题", ""]
  if (step === "outline") {
    const values = input as OutlineInput
    lines.push(values.needs.trim() || "（用户尚未在提纲配置中填写综述需求）")
    lines.push("", "## 提纲配置要求")
    lines.push(`- 论文类型：${values.paperType}`)
    lines.push(`- 论文语言：${values.language}`)
    lines.push(`- 图表要求：${values.hasFigures}`)
    lines.push(`- 目标篇幅：约 ${values.targetWords} 字`)
    const chosen = values.directions.map((key) => {
      const item = DIRECTIONS.find((direction) => direction.key === key)
      return item ? `${item.label}（${item.hint}）` : key
    })
    lines.push(`- 方向侧重：${chosen.length > 0 ? chosen.join("；") : "无特别侧重"}`)
    const options: string[] = []
    if (values.aiSuggest) options.push("为每个章节给出 AI 建议（写作要点与提示）")
    if (values.optimize) options.push("在最后给出提纲优化提醒")
    if (options.length > 0) lines.push(`- 生成选项：${options.join("；")}`)
  } else {
    const values = input as WritingInput
    const source = values.outlineSource === "file" ? "auto" : values.outlineSource
    const outlineText =
      source === "manual"
        ? values.manualOutline.trim()
        : source === "auto"
          ? outlineResult?.trim()
          : undefined
    lines.push(outlineText || "（参考提纲：自动使用提纲模块结果，或手动粘贴）")
    lines.push("", "## 写作设定")
    lines.push(`- 目标期刊 / 投稿方向：${values.journal.trim() || "未指定"}`)
    lines.push(`- 写作风格：${values.style}`)
    lines.push(`- 侧重点：${values.focus}`)
    lines.push(`- 参考文献格式：${values.referenceStyle}`)
    lines.push(`- 目标长度：${values.length.trim() || "未指定"} 字`)
    if (values.chapter.trim()) lines.push(`- 本次撰写章节：${values.chapter.trim()}`)
    if (values.extra.trim()) lines.push(`- 额外要求：${values.extra.trim()}`)
  }
  return lines.join("\n")
}
