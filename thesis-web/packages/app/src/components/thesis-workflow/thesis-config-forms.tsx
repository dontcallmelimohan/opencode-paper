// [论文助手定制] 配置面板浮窗化：outline / writing / formatting / review 的配置从左侧列改为
// 会话输入框底栏图标弹出的居中 Dialog 浮窗。浮窗只含「勾选论文要求」的表单，不含 Skill / 知识库 /
// 插图区块；文件与 skill 走会话输入框原生能力（@文件、skill 菜单），插图（writing）走底栏「插图」图标。
// 配置不再随会话文本注入提示词：改为落盘到文件空间的固定文件，由所选 Skill 直接读取。
// 落盘路径见 THESIS_TOPIC_FILE_PATH（config/论文主题.md）与 .thesis/config/ 下的排版/评审配置。
import { getFilename } from "@opencode-ai/core/util/path"
import { Button } from "@opencode-ai/ui/button"
import { Checkbox } from "@opencode-ai/ui/checkbox"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { TextField } from "@opencode-ai/ui/text-field"
import { For, Show } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useThesisWorkflow, type OutlineInput, type ReviewInput, type WritingInput } from "./thesis-workflow-store"
import { useSDK } from "@/context/sdk"
import { MANUSCRIPT_FILENAMES, useThesisManuscriptFile } from "./thesis-manuscript-file"
import { InputSourceSelect } from "./thesis-workflow-ui"
import {
  FONT_FAMILIES,
  FONT_SIZES,
  FIRST_LINE_INDENTS,
  FORMATTING_CONFIG_PATH,
  HEADING_FONTS,
  HEADING_STYLES,
  LINE_SPACINGS,
  MANUAL_PAPER_PATH,
  OUTPUT_FORMATS,
  PAGE_MARGINS,
  PARAGRAPH_SPACINGS,
  TEMPLATE_FORMATS,
  TEMPLATE_MODES,
  TYPOGRAPHIES,
  buildFormattingConfigMarkdown,
} from "./thesis-formatting-options"
// [论文助手定制] 排版浮窗用到的选项与 outline/writing 本地同名常量区分（值不同），加别名避免冲突。
import { PAPER_TYPES as FORMATTING_PAPER_TYPES, REFERENCE_STYLES as FORMATTING_REFERENCE_STYLES } from "./thesis-formatting-options"
import { FilePickerDialog } from "./thesis-session-view"
import { showToast } from "@/utils/toast"
// [论文助手定制] 二进制文档（docx/doc 等）不能作为 file part 附加给模型（Provider 拒绝），
// 同步时只把路径写进配置，由系统/工具处理。
import { canAttachAsFilePart } from "./thesis-formatting-options"

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
  const { state, updateInput, insertFileIntoSession } = useThesisWorkflow()
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
            点击后配置写入文件空间 {THESIS_TOPIC_FILE_PATH} 并 @ 到输入框，由技能读取；再次点击可更新
          </span>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              // [论文助手定制] 配置信息的唯一交付方式：把配置里的综述需求/论文设定写入文件空间固定文件
              // config/论文主题.md，让「提纲助手」等 Skill 直接读工作目录拿到主题，不依赖会话文本；
              // 再次点击会按最新配置重写同一文件。
              void manuscript.saveFile(THESIS_TOPIC_FILE_PATH, buildTopicFileContent("outline", input()))
              // [论文助手定制] 同步后把配置文件 @ 进会话输入框，让 Skill 必须看到该文件。
              insertFileIntoSession(THESIS_TOPIC_FILE_PATH, "论文主题.md")
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

// [论文助手定制] 辅助写作配置浮窗（2.2）：参考提纲从文件空间引用（唯一方式）+ 写作设定 + 章节与额外要求。
// 无 Skill / 无提纲来源下拉 / 无插图区块；参考提纲文件在会话输入框 @ 或「插入文件」里引用。
export function WritingConfigForm(props?: { onClose?: () => void }) {
  const { state, updateInput, insertFileIntoSession } = useThesisWorkflow()
  const dialog = useDialog()
  const sdk = useSDK()
  const manuscript = useThesisManuscriptFile(sdk().directory)
  const input = () => state().steps.writing.input

  return (
    <Dialog
      title="写作配置"
      description="勾选写作设定并选择参考提纲文件；点「同步到文件空间」后配置文件与提纲文件一并 @ 到输入框"
      size="large"
    >
      <div class="mx-auto flex w-[520px] max-w-full flex-col gap-3 px-2.5 pb-4">
        <section class="flex flex-col gap-1.5">
          <div class="text-12-medium text-v2-text-text-base">参考提纲</div>
          <div class="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="small"
              icon="folder-add-left"
              onClick={() =>
                dialog.push(() => (
                  <FilePickerDialog
                    directory={sdk().directory}
                    title="选择参考提纲"
                    onPick={(path) => {
                      updateInput("writing", { sourceFile: path })
                      dialog.close()
                    }}
                  />
                ))
              }
            >
              从文件空间选择
            </Button>
            <Show
              when={input().sourceFile}
              fallback={<span class="text-12-regular text-v2-text-text-faint">未选择参考提纲文件</span>}
            >
              <span class="min-w-0 flex-1 truncate text-13-regular text-v2-text-text-muted" title={input().sourceFile}>
                {input().sourceFile}
              </span>
              <Button type="button" variant="ghost" size="small" onClick={() => updateInput("writing", { sourceFile: "" })}>
                清除
              </Button>
            </Show>
          </div>
        </section>
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
            点击后配置写入文件空间 {THESIS_TOPIC_FILE_PATH}，并与参考提纲文件一并 @ 到输入框；再次点击可更新
          </span>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              // [论文助手定制] 配置信息唯一交付方式：写入文件空间固定文件 config/论文主题.md
              // （含参考提纲与写作设定），供「提纲助手」等 Skill 直接读取；再次点击按最新配置重写。
              void manuscript.saveFile(
                THESIS_TOPIC_FILE_PATH,
                buildTopicFileContent("writing", input()),
              )
              // [论文助手定制] 同步后把配置文件与参考提纲文件一并 @ 进会话输入框，让 Skill 必须看到两者。
              insertFileIntoSession(THESIS_TOPIC_FILE_PATH, "论文主题.md")
              const outlinePath = input().sourceFile.trim()
              if (outlinePath) insertFileIntoSession(outlinePath, outlinePath.split("/").pop() ?? outlinePath)
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
// outline = 综述需求 + 提纲配置；writing = 参考提纲（从文件空间引用）+ 写作设定。
export function buildTopicFileContent(
  step: "outline" | "writing",
  input: OutlineInput | WritingInput,
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
    const outlinePath = values.sourceFile.trim()
    lines.push(outlinePath ? `（参考提纲：文件空间文件 ${outlinePath}，已作为附件提供）` : "（参考提纲：未选择，请在会话输入框补充）")
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

// ==================== 论文排版 / 论文评审 配置浮窗 ====================
// [论文助手定制] 排版/评审配置面板浮窗化（与 outline/writing 一致）：
// 左侧配置列取消，改为会话输入框底栏「配置」图标弹出的居中浮窗；
// Skill 不在配置面板选，直接在会话输入框用 @ 选择；生成 = 会话发送，
// 回复留在会话里手动「应用到画布」才写入 排版稿.md / 评审报告.md。
// 「同步到文件空间」把配置写入 .thesis/config/ 固定文件，并把配置文件、
// 模板、内容来源文件一并 @ 进输入框，让 Skill 必须看到这些材料。

// [论文助手定制] 评审配置文件路径（与提纲/排版一致放文件空间 config/ 目录，可见可编辑）。
export const REVIEW_CONFIG_PATH = "config/评审配置.md"
// [论文助手定制] 评审「手动粘贴论文」写入的临时文件路径。
export const REVIEW_MANUAL_PAPER_PATH = "config/评审手动全文.md"

export const REVIEW_MODES = ["全面评审", "格式与规范评审", "内容与论证评审", "创新性评审", "快速初审"]

// [论文助手定制] 构造「论文评审配置」文档全文：写入 .thesis/config/review.md 后作为附件给模型。
export function buildReviewConfigMarkdown(input: ReviewInput): string {
  const lines: string[] = []
  lines.push("# 论文评审配置")
  lines.push("以下是本次评审的完整配置，请严格按此执行。")
  lines.push("")
  lines.push("## 评审要求")
  const sourceLabel =
    input.paperSource === "auto"
      ? "自动使用排版稿（没有则用全文稿）"
      : input.paperSource === "manual"
        ? "手动粘贴论文文本"
        : input.paperSource === "file"
          ? canAttachAsFilePart(input.sourceFile)
            ? `文件空间文件 ${input.sourceFile}（已作为附件提供）`
            : `文件空间文件 ${input.sourceFile}（二进制文档，未直接附加，请按路径用工具读取）`
          : "无源稿（按通用论文评审）"
  lines.push(`- 评审对象：${sourceLabel}`)
  lines.push(`- 目标期刊：${input.journal.trim() || "未指定"}`)
  lines.push(`- 评审模式：${input.mode}`)
  if (input.focus.trim()) lines.push(`- 评审重点：${input.focus.trim()}`)
  return lines.join("\n")
}

// [论文助手定制] 论文排版配置浮窗：输出格式 + 模板（文件空间选择）+ 内容来源 + 排版规范 +
// docx 排版参数 + 封面信息。Skill 不在面板选（输入框 @）；生成 = 会话发送。
export function FormattingConfigForm(props?: { onClose?: () => void }) {
  const { state, updateInput, insertFileIntoSession } = useThesisWorkflow()
  const dialog = useDialog()
  const sdk = useSDK()
  const manuscript = useThesisManuscriptFile(sdk().directory)
  const input = () => state().steps.formatting.input

  // [论文助手定制] 移除模板：回到无模板模式（文件仍在文件空间，只是不再套用）。
  const removeTemplate = () => updateInput("formatting", { templateMode: "none", templateName: "", templatePath: "" })

  // [论文助手定制] 同步到文件空间：写配置到 .thesis/config/formatting.md，并把配置、
  // 模板、内容来源文件一并 @ 进会话输入框（auto 源稿需文件存在才 @，避免空引用发送报错）。
  const syncToFileSpace = () => {
    void (async () => {
      await manuscript.saveFile(FORMATTING_CONFIG_PATH, buildFormattingConfigMarkdown(input()))
      insertFileIntoSession(FORMATTING_CONFIG_PATH, "formatting.md")
      if (input().templateMode === "upload" && input().templatePath) {
        insertFileIntoSession(input().templatePath, input().templateName || getFilename(input().templatePath))
      }
      if (input().paperSource === "auto") {
        const res = await sdk().client.file.read({ directory: sdk().directory, path: MANUSCRIPT_FILENAMES.writing })
        if (!res.error && res.data?.type === "text") insertFileIntoSession(MANUSCRIPT_FILENAMES.writing, MANUSCRIPT_FILENAMES.writing)
      } else if (input().paperSource === "manual" && input().manualPaper.trim()) {
        await manuscript.saveFile(MANUAL_PAPER_PATH, input().manualPaper.trim())
        insertFileIntoSession(MANUAL_PAPER_PATH, "manual-paper.md")
      } else if (input().paperSource === "file" && input().sourceFile) {
        insertFileIntoSession(input().sourceFile, getFilename(input().sourceFile))
      }
      // 关闭统一交给 step 层 onClose → setConfigOpen(false) → effect 调 dialog.close()。
      props?.onClose?.()
    })()
  }

  return (
    <Dialog
      title="排版配置"
      description="设置输出格式、模板与排版规范；点「同步到文件空间」后配置、模板、源稿一并 @ 到输入框，Skill 请在输入框用 @ 选择"
      size="large"
    >
      <div class="mx-auto flex w-[560px] max-w-full flex-col gap-3 px-2.5 pb-4">
        <section class="flex flex-col gap-1.5">
          <div class="text-12-medium text-v2-text-text-base">排版文件格式</div>
          <select
            class={selectClass}
            value={input().outputFormat}
            onChange={(event) => {
              const next = event.currentTarget.value as "md" | "docx" | "pdf"
              // [论文助手定制] 切换排版格式时，若已选模板的类型与新格式不匹配（如 docx 模板切到 pdf），
              // 清空模板避免误用；匹配则只更新格式。
              const mismatch = input().templatePath && !TEMPLATE_FORMATS[next].ext.test(input().templatePath)
              updateInput(
                "formatting",
                mismatch
                  ? { outputFormat: next, templateMode: "none", templateName: "", templatePath: "" }
                  : { outputFormat: next },
              )
            }}
          >
            <For each={OUTPUT_FORMATS}>{(item) => <option value={item.value}>{item.label}</option>}</For>
          </select>
        </section>
        <section class="flex flex-col gap-1.5">
          <div class="text-12-medium text-v2-text-text-base">排版模板</div>
          <select
            class={selectClass}
            value={input().templateMode}
            onChange={(event) => updateInput("formatting", { templateMode: event.currentTarget.value as "none" | "upload" })}
          >
            <For each={TEMPLATE_MODES}>{(item) => <option value={item.value}>{item.label}</option>}</For>
          </select>
        </section>
        <Show when={input().templateMode === "upload"}>
          <section class="flex flex-col gap-1.5 rounded-md bg-v2-background-bg-layer-01 p-2.5">
            <div class="text-12-medium text-v2-text-text-base">选择模板文件</div>
            <div class="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                icon="folder-add-left"
                onClick={() =>
                  dialog.push(() => (
                    <FilePickerDialog
                      directory={sdk().directory}
                      title="选择排版模板"
                      onPick={(path, name) => {
                        // [论文助手定制] 扩展名校验随当前排版格式：md=Markdown，docx=Word（docx/dotx），pdf=LaTeX。
                        const format = TEMPLATE_FORMATS[input().outputFormat]
                        if (!format.ext.test(path)) {
                          showToast({ variant: "error", icon: "circle-x", title: `请选择 ${format.label} 格式的模板文件` })
                          return
                        }
                        updateInput("formatting", { templateMode: "upload", templateName: name, templatePath: path })
                        dialog.close()
                      }}
                    />
                  ))
                }
              >
                从文件空间选择
              </Button>
              <Show
                when={input().templatePath}
                fallback={<span class="text-12-regular text-v2-text-text-faint">未选择模板文件</span>}
              >
                <div class="flex min-w-0 flex-1 items-center gap-1.5 text-13-regular text-v2-text-text-base">
                  <Icon name="file-tree" class="size-4 shrink-0" />
                  <span class="truncate">{input().templateName}</span>
                  <button
                    type="button"
                    class="shrink-0 text-11-regular text-v2-text-text-faint hover:text-v2-text-text-base"
                    onClick={() => removeTemplate()}
                  >
                    移除
                  </button>
                </div>
              </Show>
            </div>
            <div class="text-11-regular text-v2-text-text-faint">
              {TEMPLATE_FORMATS[input().outputFormat].hint}（同步后以 @ 附件提交给模型）
            </div>
          </section>
        </Show>
        <InputSourceSelect
          label="内容来源"
          value={input().paperSource}
          onChange={(value) => updateInput("formatting", { paperSource: value })}
          autoLabel="自动使用辅助写作的全文稿"
          manualLabel="手动粘贴全文"
          showFile
          fileLabel="从文件空间选择文件"
          noneLabel="无源稿（按通用结构排版）"
        />
        <Show when={input().paperSource === "manual"}>
          <TextField
            multiline
            placeholder="粘贴你的论文全文…"
            value={input().manualPaper}
            onChange={(value) => updateInput("formatting", { manualPaper: value })}
          />
        </Show>
        <Show when={input().paperSource === "file"}>
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">选择源文件</div>
            <div class="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                icon="folder-add-left"
                onClick={() =>
                  dialog.push(() => (
                    <FilePickerDialog
                      directory={sdk().directory}
                      title="选择内容来源文件"
                      onPick={(path) => {
                        updateInput("formatting", { sourceFile: path })
                        dialog.close()
                      }}
                    />
                  ))
                }
              >
                从文件空间选择
              </Button>
              <Show
                when={input().sourceFile}
                fallback={<span class="text-12-regular text-v2-text-text-faint">未选择源文件</span>}
              >
                <span class="min-w-0 flex-1 truncate text-13-regular text-v2-text-text-muted" title={input().sourceFile}>
                  {input().sourceFile}
                </span>
                <Button type="button" variant="ghost" size="small" onClick={() => updateInput("formatting", { sourceFile: "" })}>
                  清除
                </Button>
              </Show>
            </div>
            <div class="text-11-regular text-v2-text-text-faint">支持 md/txt/docx/pdf/tex 等（同步后以 @ 附件提交）</div>
          </section>
        </Show>
        <Show when={input().templateMode === "none"}>
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">目标期刊 / 学校模板</div>
            <TextField
              placeholder="例如：中文核心综述类期刊、学校毕业论文模板、SCI 期刊"
              value={input().journal}
              onChange={(value) => updateInput("formatting", { journal: value })}
            />
          </section>
          <div class="flex gap-2">
            <section class="flex min-w-0 flex-1 flex-col gap-1.5">
              <div class="text-12-medium text-v2-text-text-base">论文类型</div>
              <select
                class={selectClass}
                value={input().paperType}
                onChange={(event) => updateInput("formatting", { paperType: event.currentTarget.value })}
              >
                <For each={FORMATTING_PAPER_TYPES}>{(item) => <option value={item}>{item}</option>}</For>
              </select>
            </section>
            <section class="flex min-w-0 flex-1 flex-col gap-1.5">
              <div class="text-12-medium text-v2-text-text-base">参考文献格式</div>
              <select
                class={selectClass}
                value={input().referenceStyle}
                onChange={(event) => updateInput("formatting", { referenceStyle: event.currentTarget.value })}
              >
                <For each={FORMATTING_REFERENCE_STYLES}>{(item) => <option value={item}>{item}</option>}</For>
              </select>
            </section>
          </div>
          <div class="flex gap-2">
            <section class="flex min-w-0 flex-1 flex-col gap-1.5">
              <div class="text-12-medium text-v2-text-text-base">标题层级</div>
              <select
                class={selectClass}
                value={input().headingStyle}
                onChange={(event) => updateInput("formatting", { headingStyle: event.currentTarget.value })}
              >
                <For each={HEADING_STYLES}>{(item) => <option value={item}>{item}</option>}</For>
              </select>
            </section>
            <section class="flex min-w-0 flex-1 flex-col gap-1.5">
              <div class="text-12-medium text-v2-text-text-base">排版风格</div>
              <select
                class={selectClass}
                value={input().typography}
                onChange={(event) => updateInput("formatting", { typography: event.currentTarget.value })}
              >
                <For each={TYPOGRAPHIES}>{(item) => <option value={item}>{item}</option>}</For>
              </select>
            </section>
          </div>
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">额外排版要求</div>
            <TextField
              multiline
              placeholder="例如：图表编号、页眉页脚、参考文献排序规则"
              value={input().requirements}
              onChange={(value) => updateInput("formatting", { requirements: value })}
            />
          </section>
        </Show>
        <Show when={input().outputFormat === "docx" && input().templateMode === "none"}>
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">docx 排版参数</div>
            <div class="grid grid-cols-2 gap-2">
              <section class="flex min-w-0 flex-col gap-1.5">
                <div class="text-11-regular text-v2-text-text-faint">正文中文字体</div>
                <select
                  class={selectClass}
                  value={input().fontFamily}
                  onChange={(event) => updateInput("formatting", { fontFamily: event.currentTarget.value })}
                >
                  <For each={FONT_FAMILIES}>{(item) => <option value={item}>{item}</option>}</For>
                </select>
              </section>
              <section class="flex min-w-0 flex-col gap-1.5">
                <div class="text-11-regular text-v2-text-text-faint">正文字号</div>
                <select
                  class={selectClass}
                  value={input().fontSize}
                  onChange={(event) => updateInput("formatting", { fontSize: event.currentTarget.value })}
                >
                  <For each={FONT_SIZES}>{(item) => <option value={item.value}>{item.label}</option>}</For>
                </select>
              </section>
              <section class="flex min-w-0 flex-col gap-1.5">
                <div class="text-11-regular text-v2-text-text-faint">行距</div>
                <select
                  class={selectClass}
                  value={input().lineSpacing}
                  onChange={(event) => updateInput("formatting", { lineSpacing: event.currentTarget.value })}
                >
                  <For each={LINE_SPACINGS}>{(item) => <option value={item.value}>{item.label}</option>}</For>
                </select>
              </section>
              <section class="flex min-w-0 flex-col gap-1.5">
                <div class="text-11-regular text-v2-text-text-faint">页边距</div>
                <select
                  class={selectClass}
                  value={input().pageMargin}
                  onChange={(event) => updateInput("formatting", { pageMargin: event.currentTarget.value })}
                >
                  <For each={PAGE_MARGINS}>{(item) => <option value={item.value}>{item.label}</option>}</For>
                </select>
              </section>
              <section class="flex min-w-0 flex-col gap-1.5">
                <div class="text-11-regular text-v2-text-text-faint">标题字体</div>
                <select
                  class={selectClass}
                  value={input().headingFont}
                  onChange={(event) => updateInput("formatting", { headingFont: event.currentTarget.value })}
                >
                  <For each={HEADING_FONTS}>{(item) => <option value={item}>{item}</option>}</For>
                </select>
              </section>
              <section class="flex min-w-0 flex-col gap-1.5">
                <div class="text-11-regular text-v2-text-text-faint">正文首行缩进</div>
                <select
                  class={selectClass}
                  value={input().firstLineIndent}
                  onChange={(event) => updateInput("formatting", { firstLineIndent: event.currentTarget.value })}
                >
                  <For each={FIRST_LINE_INDENTS}>{(item) => <option value={item.value}>{item.label}</option>}</For>
                </select>
              </section>
              <section class="flex min-w-0 flex-col gap-1.5">
                <div class="text-11-regular text-v2-text-text-faint">段后间距</div>
                <select
                  class={selectClass}
                  value={input().paragraphSpacing}
                  onChange={(event) => updateInput("formatting", { paragraphSpacing: event.currentTarget.value })}
                >
                  <For each={PARAGRAPH_SPACINGS}>{(item) => <option value={item.value}>{item.label}</option>}</For>
                </select>
              </section>
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="flex cursor-pointer items-center gap-2 text-13-regular text-v2-text-text-base">
                <input
                  type="checkbox"
                  class="size-4 accent-[var(--v2-text-text-accent)]"
                  checked={input().titleNumbering}
                  onChange={(event) => updateInput("formatting", { titleNumbering: event.currentTarget.checked })}
                />
                标题自动编号（1 / 1.1 / 1.1.1，摘要/参考文献/致谢除外）
              </label>
              <label class="flex cursor-pointer items-center gap-2 text-13-regular text-v2-text-text-base">
                <input
                  type="checkbox"
                  class="size-4 accent-[var(--v2-text-text-accent)]"
                  checked={input().pageNumber}
                  onChange={(event) => updateInput("formatting", { pageNumber: event.currentTarget.checked })}
                />
                页脚居中页码
              </label>
            </div>
          </section>
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">页眉（可选）</div>
            <TextField
              type="text"
              placeholder="如：本科毕业论文（设计）或论文标题，留空则不生成页眉"
              value={input().headerText}
              onChange={(value) => updateInput("formatting", { headerText: value })}
            />
            <div class="text-11-regular text-v2-text-text-faint">填了就在每页顶部居中显示页眉文字（9pt 加下边框细线）。</div>
          </section>
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">封面信息（可选，毕业论文需要）</div>
            <div class="grid grid-cols-2 gap-2">
              <section class="flex min-w-0 flex-col gap-1.5">
                <div class="text-11-regular text-v2-text-text-faint">论文题目</div>
                <TextField
                  type="text"
                  placeholder="填了才会生成封面页"
                  value={input().coverTitle}
                  onChange={(value) => updateInput("formatting", { coverTitle: value })}
                />
              </section>
              <section class="flex min-w-0 flex-col gap-1.5">
                <div class="text-11-regular text-v2-text-text-faint">作者</div>
                <TextField
                  type="text"
                  value={input().coverAuthor}
                  onChange={(value) => updateInput("formatting", { coverAuthor: value })}
                />
              </section>
              <section class="flex min-w-0 flex-col gap-1.5">
                <div class="text-11-regular text-v2-text-text-faint">单位</div>
                <TextField
                  type="text"
                  value={input().coverAffiliation}
                  onChange={(value) => updateInput("formatting", { coverAffiliation: value })}
                />
              </section>
              <section class="flex min-w-0 flex-col gap-1.5">
                <div class="text-11-regular text-v2-text-text-faint">日期</div>
                <TextField
                  type="text"
                  placeholder="如 2026 年 6 月"
                  value={input().coverDate}
                  onChange={(value) => updateInput("formatting", { coverDate: value })}
                />
              </section>
            </div>
          </section>
        </Show>
        <Show when={input().paperSource === "auto" && !state().steps.writing.result}>
          <div class="flex items-start gap-1.5 rounded-md bg-v2-background-bg-layer-01 px-2.5 py-2 text-11-regular text-v2-text-text-faint">
            自动模式暂无全文稿，可切换为「手动粘贴全文」或「无源稿」。
          </div>
        </Show>
        <div class="flex items-center justify-end gap-2">
          <span class="text-11-regular text-v2-text-text-faint">
            点击后配置写入 {FORMATTING_CONFIG_PATH}，并与模板、源稿一并 @ 到输入框；Skill 请在输入框用 @ 选择
          </span>
          <Button type="button" variant="primary" onClick={syncToFileSpace}>
            同步到文件空间
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

// [论文助手定制] 论文评审配置浮窗：评审对象（auto/manual/file/none）+ 期刊 + 模式 + 重点。
// Skill 不在面板选（输入框 @）；生成 = 会话发送。
export function ReviewConfigForm(props?: { onClose?: () => void }) {
  const { state, updateInput, insertFileIntoSession } = useThesisWorkflow()
  const dialog = useDialog()
  const sdk = useSDK()
  const manuscript = useThesisManuscriptFile(sdk().directory)
  const input = () => state().steps.review.input

  // [论文助手定制] 同步到文件空间：写配置到 .thesis/config/review.md，并把配置与评审对象
  // （auto=排版稿优先/全文稿，manual=手动文本文件，file=所选文件）一并 @ 进会话输入框。
  const syncToFileSpace = () => {
    void (async () => {
      await manuscript.saveFile(REVIEW_CONFIG_PATH, buildReviewConfigMarkdown(input()))
      insertFileIntoSession(REVIEW_CONFIG_PATH, "review.md")
      if (input().paperSource === "auto") {
        for (const path of [MANUSCRIPT_FILENAMES.formatting, MANUSCRIPT_FILENAMES.writing]) {
          const res = await sdk().client.file.read({ directory: sdk().directory, path })
          if (!res.error && res.data?.type === "text") {
            insertFileIntoSession(path, path)
            break
          }
        }
      } else if (input().paperSource === "manual" && input().manualPaper.trim()) {
        await manuscript.saveFile(REVIEW_MANUAL_PAPER_PATH, input().manualPaper.trim())
        insertFileIntoSession(REVIEW_MANUAL_PAPER_PATH, "review-manual.md")
      } else if (input().paperSource === "file" && input().sourceFile) {
        insertFileIntoSession(input().sourceFile, getFilename(input().sourceFile))
      }
      props?.onClose?.()
    })()
  }

  return (
    <Dialog
      title="评审配置"
      description="选择评审对象与评审要求；点「同步到文件空间」后配置与论文文件一并 @ 到输入框，Skill 请在输入框用 @ 选择"
      size="large"
    >
      <div class="mx-auto flex w-[520px] max-w-full flex-col gap-3 px-2.5 pb-4">
        <InputSourceSelect
          label="评审对象"
          value={input().paperSource}
          onChange={(value) => updateInput("review", { paperSource: value })}
          autoLabel="自动使用排版稿（没有则用全文稿）"
          manualLabel="手动粘贴论文文本"
          showFile
          fileLabel="从文件空间选择论文文件"
          noneLabel="无源稿（按通用论文评审）"
        />
        <Show when={input().paperSource === "manual"}>
          <TextField
            multiline
            placeholder="粘贴要评审的论文全文…"
            value={input().manualPaper}
            onChange={(value) => updateInput("review", { manualPaper: value })}
          />
        </Show>
        <Show when={input().paperSource === "file"}>
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">选择评审文件</div>
            <div class="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                icon="folder-add-left"
                onClick={() =>
                  dialog.push(() => (
                    <FilePickerDialog
                      directory={sdk().directory}
                      title="选择评审文件"
                      onPick={(path) => {
                        updateInput("review", { sourceFile: path })
                        dialog.close()
                      }}
                    />
                  ))
                }
              >
                从文件空间选择
              </Button>
              <Show
                when={input().sourceFile}
                fallback={<span class="text-12-regular text-v2-text-text-faint">未选择评审文件</span>}
              >
                <span class="min-w-0 flex-1 truncate text-13-regular text-v2-text-text-muted" title={input().sourceFile}>
                  {input().sourceFile}
                </span>
                <Button type="button" variant="ghost" size="small" onClick={() => updateInput("review", { sourceFile: "" })}>
                  清除
                </Button>
              </Show>
            </div>
            <div class="text-11-regular text-v2-text-text-faint">支持 md/txt/docx/pdf/tex 等（同步后以 @ 附件提交）</div>
          </section>
        </Show>
        <section class="flex flex-col gap-1.5">
          <div class="text-12-medium text-v2-text-text-base">目标期刊</div>
          <TextField
            placeholder="例如：中文核心综述类期刊、SCI Q2"
            value={input().journal}
            onChange={(value) => updateInput("review", { journal: value })}
          />
        </section>
        <section class="flex flex-col gap-1.5">
          <div class="text-12-medium text-v2-text-text-base">评审模式</div>
          <select
            class={selectClass}
            value={input().mode}
            onChange={(event) => updateInput("review", { mode: event.currentTarget.value })}
          >
            <For each={REVIEW_MODES}>{(item) => <option value={item}>{item}</option>}</For>
          </select>
        </section>
        <section class="flex flex-col gap-1.5">
          <div class="text-12-medium text-v2-text-text-base">评审重点</div>
          <TextField
            multiline
            placeholder="例如：重点关注文献综述的覆盖度和创新点论证"
            value={input().focus}
            onChange={(value) => updateInput("review", { focus: value })}
          />
        </section>
        <Show when={input().paperSource === "auto" && !input().manualPaper && !state().steps.formatting.result && !state().steps.writing.result}>
          <div class="flex items-start gap-1.5 rounded-md bg-v2-background-bg-layer-01 px-2.5 py-2 text-11-regular text-v2-text-text-faint">
            自动模式暂无论文文本，可切换为「手动粘贴论文文本」或「无源稿」。
          </div>
        </Show>
        <div class="flex items-center justify-end gap-2">
          <span class="text-11-regular text-v2-text-text-faint">
            点击后配置写入 {REVIEW_CONFIG_PATH}，并与评审对象文件一并 @ 到输入框；Skill 请在输入框用 @ 选择
          </span>
          <Button type="button" variant="primary" onClick={syncToFileSpace}>
            同步到文件空间
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
