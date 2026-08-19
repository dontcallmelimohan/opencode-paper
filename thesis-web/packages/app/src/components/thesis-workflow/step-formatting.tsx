// [论文助手定制] Step 3 论文排版（论文工作台）：
// 以 Step 2 的全文稿为源稿，按目标期刊/学校模板、参考文献格式、标题层级等要求生成排版后的最终稿。
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { TextField } from "@opencode-ai/ui/text-field"
import { For, Show } from "solid-js"
import { useSDK } from "@/context/sdk"
import { useThesisGenerator } from "./thesis-generator"
import { useThesisManuscriptFile } from "./thesis-manuscript-file"
import { useThesisWorkflow } from "./thesis-workflow-store"
import { promptToolRestriction, StepFormPanel, StepLayout, StepProductPanel, ThesisSkillPicker } from "./thesis-workflow-ui"
import { useThesisDocxExport, useThesisPdfExport } from "./thesis-export"
import { showToast } from "@/utils/toast"

const PAPER_TYPES = ["综述论文", "课程论文", "毕业论文", "期刊投稿稿"]
const REFERENCE_STYLES = ["GB/T 7714-2015", "APA 7th", "MLA 9th", "Vancouver", "IEEE"]
const HEADING_STYLES = ["三级标题", "二级标题", "四号标题层级", "英文小标题"]
const TYPOGRAPHIES = ["中文学术默认", "中文核心期刊风格", "英文 SCI 风格", "毕业论文模板"]
// [论文助手定制] docx 排版参数选项（导出 Word 时生效，控制后端 docx 引擎的视觉规范）。
const FONT_FAMILIES = ["宋体", "黑体", "楷体", "仿宋"]
const FONT_SIZES = [
  { label: "五号（10.5pt）", value: "10.5" },
  { label: "小四（12pt）", value: "12" },
  { label: "四号（14pt）", value: "14" },
]
const LINE_SPACINGS = [
  { label: "单倍", value: "1" },
  { label: "1.5 倍", value: "1.5" },
  { label: "双倍", value: "2" },
]
const PAGE_MARGINS = [
  { label: "标准", value: "standard" },
  { label: "窄边距", value: "narrow" },
  { label: "毕业论文规范", value: "thesis" },
]
// [论文助手定制] 扩充 docx 排版参数选项：标题字体 / 首行缩进字符数 / 段后间距。
const HEADING_FONTS = ["黑体", "宋体", "楷体", "仿宋", "微软雅黑"]
const FIRST_LINE_INDENTS = [
  { label: "不缩进", value: "0" },
  { label: "1 字符", value: "1" },
  { label: "2 字符（默认）", value: "2" },
  { label: "4 字符", value: "4" },
]
const PARAGRAPH_SPACINGS = [
  { label: "紧凑（0pt）", value: "0" },
  { label: "默认（6pt）", value: "6" },
  { label: "宽松（12pt）", value: "12" },
  { label: "很宽（24pt）", value: "24" },
]

export function StepFormatting() {
  const sdk = useSDK()
  const { state, updateInput, setStepStatus, setStepProgress, setStepResult, setSessionID, setActiveStep } =
    useThesisWorkflow()
  const generator = useThesisGenerator()
  // [论文助手定制] 文稿文件化：排版稿写入项目「正文/排版稿.md」。
  const manuscript = useThesisManuscriptFile(sdk().directory)
  // [论文助手定制] 导出 Word：把排版后的最终稿转成 .docx 保存到项目「正文」目录。
  // 把 Step 3 面板的排版参数（字体/字号/行距/页边距/标题编号/封面）随导出传给后端 docx 引擎。
  const { exportDocx, exporting: docxExporting } = useThesisDocxExport("排版稿", () => ({
    paperType: input().paperType,
    fontFamily: input().fontFamily,
    fontSize: Number(input().fontSize),
    lineSpacing: Number(input().lineSpacing),
    pageMargin: input().pageMargin as "standard" | "narrow" | "thesis",
    titleNumbering: input().titleNumbering,
    // [论文助手定制] 扩充参数随导出一起传给后端 docx 引擎（页眉/标题字体/缩进/段间距/页码）。
    headerText: input().headerText.trim() || undefined,
    headingFont: input().headingFont,
    firstLineIndent: Number(input().firstLineIndent),
    paragraphSpacing: Number(input().paragraphSpacing),
    pageNumber: input().pageNumber,
    cover:
      input().coverTitle.trim() || input().coverAuthor.trim() || input().coverAffiliation.trim() || input().coverDate.trim()
        ? {
            title: input().coverTitle.trim() || undefined,
            author: input().coverAuthor.trim() || undefined,
            affiliation: input().coverAffiliation.trim() || undefined,
            date: input().coverDate.trim() || undefined,
          }
        : undefined,
  }))
  // [论文助手定制] 导出 PDF：把排版后的最终稿渲染成 PDF 保存到项目「正文」目录。
  const { exportPdf } = useThesisPdfExport("排版稿")
  const formatting = () => state().steps.formatting
  const input = () => formatting().input
  const sourcePaper = () => state().steps.writing.result ?? ""

  const buildPrompt = () => {
    const values = input()
    const lines: string[] = []
    lines.push("我正在进行论文的「论文排版」阶段，请把下面的论文全文按排版要求整理成最终稿。")
    lines.push("")
    lines.push("## 排版要求")
    lines.push(`- 目标期刊 / 学校模板：${values.journal.trim() || "未指定"}`)
    lines.push(`- 论文类型：${values.paperType}`)
    lines.push(`- 参考文献格式：${values.referenceStyle}`)
    lines.push(`- 标题层级：${values.headingStyle}`)
    lines.push(`- 排版风格：${values.typography}`)
    if (values.requirements.trim()) lines.push(`- 额外排版要求：${values.requirements.trim()}`)
    lines.push("")
    lines.push("## 论文全文")
    lines.push(sourcePaper() || "（暂无全文稿）")
    lines.push("")
    lines.push("## 输出要求")
    lines.push(
      "只输出排版后的论文正文本身（Markdown 格式）：统一标题层级与编号、段首缩进、图表编号、参考文献列表按指定格式排列。" +
        "禁止输出任何排版说明、页眉页脚设置说明、字体字号说明、注释或标注；正文之前不要有任何标题性文字；" +
        promptToolRestriction(input().useTools) + "上文已包含全部所需材料，直接输出正文本身。",
    )
    return lines.join("\n")
  }

  const generate = async () => {
    if (generator.generating()) return
    setStepStatus("formatting", "generating")
    try {
      const { sessionID, text } = await generator.generate({
        prompt: buildPrompt(),
        // [论文助手定制] 把本步配置面板勾选的 Skill 传给生成器，注入提示词。
        skills: input().skills,
        // [论文助手定制] 把本步配置面板的工具开关传给生成器（true=允许工具调用）。
        useTools: input().useTools,
        sessionID: state().sessionID,
        // [论文助手定制] 边生成边显示：实时文本先写入 progress，完成后再落到 result。
        // [论文助手定制] 会话一创建立即启用「会话」切换（见 thesis-generator.ts）。
        onSessionCreated: setSessionID,
        onProgress: (partial) => setStepProgress("formatting", partial),
      })
      setSessionID(sessionID)
      // [论文助手定制] 落盘：排版稿写入 正文/排版稿.md（文稿视图随后从文件读取）。
      await manuscript.save("formatting", text)
      setStepResult("formatting", text)
      showToast({ variant: "success", icon: "circle-check", title: "排版稿已生成，可进入论文评审" })
    } catch {
      setStepStatus("formatting", formatting().result ? "done" : "idle")
    }
  }

  return (
    <StepLayout
      form={
        <StepFormPanel
          stepLabel="Step 3"
          title="论文排版"
          subtitle="按目标期刊/模板的格式要求整理最终稿。"
          footer={
            <div class="flex flex-col gap-2">
              <Button type="button" variant="primary" icon="layout-left" disabled={generator.generating()} onClick={() => void generate()}>
                {generator.generating() ? "生成中…" : "生成排版稿"}
              </Button>
              <Show when={formatting().status === "done"}>
                <Button type="button" variant="secondary" icon="arrow-right" onClick={() => setActiveStep("review")}>
                  进入论文评审
                </Button>
              </Show>
            </div>
          }
        >
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">目标期刊 / 学校模板</div>
            <TextField
              placeholder="例如：中文核心综述类期刊、学校毕业论文模板、SCI 期刊"
              value={input().journal}
              onChange={(value) => updateInput("formatting", { journal: value })}
            />
          </section>
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">论文类型</div>
            <select
              class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
              value={input().paperType}
              onChange={(event) => updateInput("formatting", { paperType: event.currentTarget.value })}
            >
              <For each={PAPER_TYPES}>{(item) => <option value={item}>{item}</option>}</For>
            </select>
          </section>
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">参考文献格式</div>
            <select
              class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
              value={input().referenceStyle}
              onChange={(event) => updateInput("formatting", { referenceStyle: event.currentTarget.value })}
            >
              <For each={REFERENCE_STYLES}>{(item) => <option value={item}>{item}</option>}</For>
            </select>
          </section>
          <div class="flex gap-2">
            <section class="flex min-w-0 flex-1 flex-col gap-1.5">
              <div class="text-12-medium text-v2-text-text-base">标题层级</div>
              <select
                class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
                value={input().headingStyle}
                onChange={(event) => updateInput("formatting", { headingStyle: event.currentTarget.value })}
              >
                <For each={HEADING_STYLES}>{(item) => <option value={item}>{item}</option>}</For>
              </select>
            </section>
            <section class="flex min-w-0 flex-1 flex-col gap-1.5">
              <div class="text-12-medium text-v2-text-text-base">排版风格</div>
              <select
                class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
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
          {/* [论文助手定制] docx 排版参数：控制导出的 Word 视觉规范（字体/字号/行距/页边距/标题编号），
              直接存进 workflow store 并在导出时传给后端；改这里不会影响 AI 排版，只影响 docx 成品。 */}
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">docx 排版参数</div>
            <div class="grid grid-cols-2 gap-2">
              <section class="flex min-w-0 flex-col gap-1.5">
                <div class="text-11-regular text-v2-text-text-faint">正文中文字体</div>
                <select
                  class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
                  value={input().fontFamily}
                  onChange={(event) => updateInput("formatting", { fontFamily: event.currentTarget.value })}
                >
                  <For each={FONT_FAMILIES}>{(item) => <option value={item}>{item}</option>}</For>
                </select>
              </section>
              <section class="flex min-w-0 flex-col gap-1.5">
                <div class="text-11-regular text-v2-text-text-faint">正文字号</div>
                <select
                  class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
                  value={input().fontSize}
                  onChange={(event) => updateInput("formatting", { fontSize: event.currentTarget.value })}
                >
                  <For each={FONT_SIZES}>{(item) => <option value={item.value}>{item.label}</option>}</For>
                </select>
              </section>
              <section class="flex min-w-0 flex-col gap-1.5">
                <div class="text-11-regular text-v2-text-text-faint">行距</div>
                <select
                  class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
                  value={input().lineSpacing}
                  onChange={(event) => updateInput("formatting", { lineSpacing: event.currentTarget.value })}
                >
                  <For each={LINE_SPACINGS}>{(item) => <option value={item.value}>{item.label}</option>}</For>
                </select>
              </section>
              <section class="flex min-w-0 flex-col gap-1.5">
                <div class="text-11-regular text-v2-text-text-faint">页边距</div>
                <select
                  class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
                  value={input().pageMargin}
                  onChange={(event) => updateInput("formatting", { pageMargin: event.currentTarget.value })}
                >
                  <For each={PAGE_MARGINS}>{(item) => <option value={item.value}>{item.label}</option>}</For>
                </select>
              </section>
              {/* [论文助手定制] 扩充：标题字体（默认黑体，独立于正文中文字体）。 */}
              <section class="flex min-w-0 flex-col gap-1.5">
                <div class="text-11-regular text-v2-text-text-faint">标题字体</div>
                <select
                  class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
                  value={input().headingFont}
                  onChange={(event) => updateInput("formatting", { headingFont: event.currentTarget.value })}
                >
                  <For each={HEADING_FONTS}>{(item) => <option value={item}>{item}</option>}</For>
                </select>
              </section>
              {/* [论文助手定制] 扩充：首行缩进字符数（正文段落，默认 2 字符）。 */}
              <section class="flex min-w-0 flex-col gap-1.5">
                <div class="text-11-regular text-v2-text-text-faint">正文首行缩进</div>
                <select
                  class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
                  value={input().firstLineIndent}
                  onChange={(event) => updateInput("formatting", { firstLineIndent: event.currentTarget.value })}
                >
                  <For each={FIRST_LINE_INDENTS}>{(item) => <option value={item.value}>{item.label}</option>}</For>
                </select>
              </section>
              {/* [论文助手定制] 扩充：正文段后间距（pt）。 */}
              <section class="flex min-w-0 flex-col gap-1.5">
                <div class="text-11-regular text-v2-text-text-faint">段后间距</div>
                <select
                  class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
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
              {/* [论文助手定制] 扩充：页脚页码开关（默认开启）。 */}
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
          {/* [论文助手定制] 扩充：页眉文字（可选，填了才在每页顶部生成居中页眉 + 下边框）。 */}
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
          {/* [论文助手定制] 直接重新导出：只改上面的 docx 排版参数时，无需重新跑一遍 AI 生成排版稿，
              点这里就按当前参数把已有排版稿（Markdown）重新导出成 Word。 */}
          <section class="flex flex-col gap-1.5 rounded-md bg-v2-background-bg-layer-01 p-2.5">
            <div class="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                icon="download"
                disabled={generator.generating() || !formatting().result}
                onClick={() => void exportDocx(formatting().result ?? "")}
              >
                {docxExporting() ? "导出中…" : "按当前参数重新导出 Word"}
              </Button>
            </div>
            {/* <div class="text-11-regular text-v2-text-text-faint">
              改完上面的 docx 排版参数直接点这里，按新参数重新导出，不需要重新生成 AI 排版稿。
            </div> */}
          </section>
          {/* [论文助手定制] 封面信息：毕业论文类型可填写，填了题目才会生成封面页，其余留空则不生成。 */}
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
          {/* [论文助手定制] Skill 多选：勾选的 Skill 在生成时注入提示词（见 thesis-generator）。 */}
          <ThesisSkillPicker step="formatting" />
          <Show when={!sourcePaper()}>
            <div class="flex items-start gap-1.5 rounded-md bg-v2-background-bg-layer-01 px-2.5 py-2 text-11-regular text-v2-text-text-faint">
              还没有全文稿，建议先完成 Step 2「辅助写作」。
            </div>
          </Show>
        </StepFormPanel>
      }
      product={
        <StepProductPanel
          title="排版后的最终稿"
          status={formatting().status}
          progressText={formatting().progress}
          result={formatting().result}
          onExportDocx={() => void exportDocx(formatting().result ?? "")}
          onExportPdf={() => void exportPdf(formatting().result ?? "")}
          emptyHint="设定排版要求后点击「生成排版稿」，最终稿会显示在这里。"
          manuscript={{ directory: sdk().directory, step: "formatting" }}
        />
      }
    />
  )
}
