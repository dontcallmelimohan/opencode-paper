// [论文助手定制] 「论文排版」模块（论文工作台，方案 B 去线性化）：
// 独立模块，排版源稿来源可在表单里显式选择：自动用辅助写作的全文稿 / 手动粘贴 / 无源稿。
// 按目标期刊/学校模板、参考文献格式、标题层级等要求生成排版后的最终稿。
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { TextField } from "@opencode-ai/ui/text-field"
import { createSignal, For, Show } from "solid-js"
import { useSDK } from "@/context/sdk"
import { useThesisGenerator } from "./thesis-generator"
import { useThesisManuscriptFile } from "./thesis-manuscript-file"
import { useThesisWorkflow } from "./thesis-workflow-store"
import { InputSourceSelect, promptToolRestriction, StepFormPanel, StepLayout, StepProductPanel, ThesisSkillPicker } from "./thesis-workflow-ui"
import { useThesisDocxExport, useThesisPdfExport, useThesisProject } from "./thesis-export"
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

// [论文助手定制] 排版输出格式选项：先选排版文件格式（md / docx / pdf），
// 决定生成排版稿后的交付方式——md=写入「正文/排版稿.md」，docx/pdf=生成后自动导出对应文件。
const OUTPUT_FORMATS: { label: string; value: "md" | "docx" | "pdf" }[] = [
  { label: "Markdown（.md）", value: "md" },
  { label: "Word（.docx）", value: "docx" },
  { label: "PDF", value: "pdf" },
]

// [论文助手定制] 「有无模板」选项：无模板=手动配置排版参数；
// 有模板=上传用户自己的 .docx 模板，生成排版稿时正文插入模板（保留模板页眉/页脚/页面设置），
// 有模板时下方排版参数隐藏且不生效（见 buildPrompt 与 docx 导出分支）。
const TEMPLATE_MODES: { label: string; value: "none" | "upload" }[] = [
  { label: "无模板（手动配置排版参数）", value: "none" },
  { label: "有模板（上传 .docx 模板）", value: "upload" },
]

export function StepFormatting() {
  const sdk = useSDK()
  const { state, updateInput, setStepStatus, setStepProgress, setStepResult, setStepSessionID } =
    useThesisWorkflow()
  const generator = useThesisGenerator()
  // [论文助手定制] 上传模板：解析当前论文项目拿 projectID（复用文件空间的上传接口 thesisUpload）。
  const resolveProject = useThesisProject()
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
    // [论文助手定制] 上传模板：有模板时把模板相对路径传给后端，走「套用模板」分支（视觉参数不生效）。
    templatePath: input().templatePath.trim() || undefined,
  }))
  // [论文助手定制] 导出 PDF：把排版后的最终稿渲染成 PDF 保存到项目「正文」目录。
  const { exportPdf } = useThesisPdfExport("排版稿")
  const formatting = () => state().steps.formatting
  const input = () => formatting().input
  const sourcePaper = () => state().steps.writing.result ?? ""

  // [论文助手定制] 上传模板：把用户选的 .docx 上传到项目「模板/」目录（文件空间可见），
  // 成功后记录模板文件名与相对路径，后端生成 docx 时按此套用模板。
  const [uploadingTemplate, setUploadingTemplate] = createSignal(false)
  let templateFileInput: HTMLInputElement | undefined
  const toBase64 = (file: File) =>
    file.arrayBuffer().then((buffer) => {
      const bytes = new Uint8Array(buffer)
      let binary = ""
      const CHUNK = 0x8000
      for (let index = 0; index < bytes.length; index += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK))
      }
      return btoa(binary)
    })
  const uploadTemplate = async (file: File) => {
    if (!/\.docx$/i.test(file.name)) {
      showToast({ variant: "error", icon: "circle-x", title: "请选择 .docx 格式的模板文件" })
      return
    }
    const proj = await resolveProject()
    if (!proj) {
      showToast({ variant: "error", icon: "circle-x", title: "找不到当前论文项目" })
      return
    }
    if (uploadingTemplate()) return
    setUploadingTemplate(true)
    try {
      const content = await toBase64(file)
      const res = await sdk().client.instance.thesisUpload({
        projectID: proj.id,
        filename: file.name,
        content,
        directory: "模板",
      })
      if (res.error) throw new Error(String(res.error))
      // [论文助手定制] 记录模板文件（模板/ 目录下），模板模式随之生效。
      updateInput("formatting", {
        templateMode: "upload",
        templateName: file.name,
        templatePath: `模板/${file.name}`,
      })
      showToast({ variant: "success", icon: "circle-check", title: "模板已上传并启用" })
    } catch (err) {
      showToast({
        variant: "error",
        icon: "circle-x",
        title: "模板上传失败",
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setUploadingTemplate(false)
    }
  }
  // [论文助手定制] 移除模板：回到无模板模式（保留已上传的文件，只是不再套用）。
  const removeTemplate = () => updateInput("formatting", { templateMode: "none", templateName: "", templatePath: "" })

  const buildPrompt = () => {
    const values = input()
    const lines: string[] = []
    lines.push("我正在进行论文的「论文排版」阶段，请把下面的论文全文按排版要求整理成最终稿。")
    lines.push("")
    lines.push("## 排版要求")
    // [论文助手定制] 排版要求新增两项：输出格式（md/docx/pdf）与模板（有无模板）。
    // 有模板（upload）时说明正文将套用上传的 .docx 模板，模型只需整理正文结构，不列视觉参数。
    const formatLabel = OUTPUT_FORMATS.find((item) => item.value === values.outputFormat)?.label ?? values.outputFormat
    lines.push(`- 排版文件格式：${formatLabel}`)
    lines.push(
      values.templateMode === "upload"
        ? `- 排版模板：${values.templateName || "用户上传的 .docx 模板"}（正文将插入该模板，保留模板页眉/页脚/页面设置，正文段落与标题按学术规范整理）`
        : "- 排版模板：无模板（按下方手动配置的排版参数与规范排版）",
    )
    lines.push(`- 目标期刊 / 学校模板：${values.journal.trim() || "未指定"}`)
    lines.push(`- 论文类型：${values.paperType}`)
    lines.push(`- 参考文献格式：${values.referenceStyle}`)
    lines.push(`- 标题层级：${values.headingStyle}`)
    lines.push(`- 排版风格：${values.typography}`)
    if (values.requirements.trim()) lines.push(`- 额外排版要求：${values.requirements.trim()}`)
    lines.push("")
    lines.push("## 论文全文")
    // [论文助手定制] 方案 B：按选定的排版来源取值（auto=辅助写作全文稿 / manual=手动粘贴 / none=无源稿）。
    lines.push(
      input().paperSource === "manual"
        ? input().manualPaper.trim() || "（手动粘贴的全文为空）"
        : input().paperSource === "none"
          ? "（无源稿，请按通用学术论文结构进行排版）"
          : sourcePaper() || "（暂无全文稿）",
    )
    lines.push("")
    lines.push("## 输出要求")
    // [论文助手定制] 按所选输出格式区分输出要求：
    // md=Markdown 正文；docx/pdf=标题仍用 # 层级标记（后端 docx/PDF 引擎按此识别章节），
    // 但正文段落为纯文本、不要行内 Markdown 标记与手动缩进（导出引擎会自动处理段首缩进）。
    const commonRestriction =
      "禁止输出任何排版说明、页眉页脚设置说明、字体字号说明、注释或标注；正文之前不要有任何标题性文字；" +
      promptToolRestriction(input().useTools) + "上文已包含全部所需材料，直接输出正文本身。"
    if (values.outputFormat === "md") {
      lines.push(
        "只输出排版后的论文正文本身（Markdown 格式）：统一标题层级与编号、段首缩进、图表编号、参考文献列表按指定格式排列。" +
          commonRestriction,
      )
    } else if (values.outputFormat === "docx") {
      lines.push(
        "只输出排版后的论文正文本身：章节标题用 Markdown 的 # 层级标记（# 章 / ## 节 / ### 小节），" +
          "正文段落为纯文本（不要使用 ** 加粗、* 斜体 等行内 Markdown 标记，段首不要手动空格缩进，导出时会自动处理），" +
          "表格保留 Markdown 表格语法，参考文献每条单独一段（[1] 序号格式）。" +
          // [论文助手定制] 有模板时提醒模型：正文会被插入上传的 .docx 模板，页眉/页脚/封面由模板提供。
          (values.templateMode === "upload"
            ? "正文将套用用户上传的 .docx 模板（页眉/页脚/封面/页面设置由模板提供，模型无需关心）。"
            : "") +
          commonRestriction,
      )
    } else {
      lines.push(
        "只输出排版后的论文正文本身：章节标题用 Markdown 的 # 层级标记，" +
          "正文段落为纯文本（不要行内 Markdown 标记、不要手动缩进，导出时自动处理），" +
          "表格保留 Markdown 表格语法，参考文献每条单独一段。" +
          commonRestriction,
      )
    }
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
        sessionID: state().steps.formatting.sessionID,
        // [论文助手定制] 边生成边显示：实时文本先写入 progress，完成后再落到 result。
        // [论文助手定制] 方案 B：会话写进「论文排版」自己的 StepState（每步独立会话）。
        onSessionCreated: (id) => setStepSessionID("formatting", id),
        onProgress: (partial) => setStepProgress("formatting", partial),
      })
      setStepSessionID("formatting", sessionID)
      // [论文助手定制] 落盘：排版稿写入根目录的排版稿.md（文稿视图随后从文件读取）。
      await manuscript.save("formatting", text)
      setStepResult("formatting", text)
      // [论文助手定制] 按所选排版文件格式自动交付：
      // md=只保存 Markdown 排版稿；docx/pdf=保存排版稿后自动导出对应文件（导出引擎会弹成功提示）。
      if (input().outputFormat === "docx") {
        await exportDocx(text)
        showToast({ variant: "success", icon: "circle-check", title: "排版稿已生成并导出 Word" })
      } else if (input().outputFormat === "pdf") {
        await exportPdf(text)
        showToast({ variant: "success", icon: "circle-check", title: "排版稿已生成并导出 PDF" })
      } else {
        showToast({ variant: "success", icon: "circle-check", title: "排版稿已生成（Markdown）" })
      }
    } catch {
      setStepStatus("formatting", formatting().result ? "done" : "idle")
    }
  }

  return (
    <StepLayout
      form={
        <StepFormPanel
          title="论文排版"
          subtitle="独立模块：按选定排版来源与格式要求整理最终稿。"
          footer={
            <Button type="button" variant="primary" icon="layout-left" disabled={generator.generating()} onClick={() => void generate()}>
              {generator.generating() ? "生成中…" : "生成排版稿"}
            </Button>
          }
        >
          {/* [论文助手定制] 第一步：先选排版文件格式（md / docx / pdf）。
              决定生成排版稿后的交付方式：md=只保存 Markdown；docx/pdf=生成后自动导出对应文件。 */}
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">排版文件格式</div>
            <select
              class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
              value={input().outputFormat}
              onChange={(event) => updateInput("formatting", { outputFormat: event.currentTarget.value as "md" | "docx" | "pdf" })}
            >
              <For each={OUTPUT_FORMATS}>{(item) => <option value={item.value}>{item.label}</option>}</For>
            </select>
          </section>
          {/* [论文助手定制] 第二步：选择有无模板（仅 docx 支持套用模板，md/pdf 不显示）。
              无模板=下方显示排版参数手动配置；有模板=上传自己的 .docx 模板，下方排版参数隐藏。 */}
          <Show when={input().outputFormat === "docx"}>
            <section class="flex flex-col gap-1.5">
              <div class="text-12-medium text-v2-text-text-base">排版模板</div>
              <select
                class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
                value={input().templateMode}
                onChange={(event) => updateInput("formatting", { templateMode: event.currentTarget.value as "none" | "upload" })}
              >
                <For each={TEMPLATE_MODES}>{(item) => <option value={item.value}>{item.label}</option>}</For>
              </select>
            </section>
            {/* [论文助手定制] 有模板：上传 .docx 模板文件（存到项目「模板/」目录），并显示当前模板与移除按钮。 */}
            <Show when={input().templateMode === "upload"}>
              <section class="flex flex-col gap-1.5 rounded-md bg-v2-background-bg-layer-01 p-2.5">
                <div class="text-12-medium text-v2-text-text-base">上传模板</div>
                <div class="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    icon="cloud-upload"
                    disabled={uploadingTemplate()}
                    onClick={() => templateFileInput?.click()}
                  >
                    {uploadingTemplate() ? "上传中…" : "选择 .docx 模板"}
                  </Button>
                  <input
                    ref={templateFileInput}
                    type="file"
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    class="hidden"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0]
                      event.currentTarget.value = ""
                      if (file) void uploadTemplate(file)
                    }}
                  />
                  <Show when={input().templatePath}>
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
                  正文将插入模板（保留模板页眉/页脚/页面设置），模板模式下无需配置下方排版参数。
                </div>
              </section>
            </Show>
          </Show>
          {/* [论文助手定制] 方案 B：排版源稿来源（auto/manual/none），不再强制依赖辅助写作先完成。 */}
          <InputSourceSelect
            label="排版来源"
            value={input().paperSource}
            onChange={(value) => updateInput("formatting", { paperSource: value })}
            autoLabel="自动使用辅助写作的全文稿"
            manualLabel="手动粘贴全文"
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
          {/* [论文助手定制] 仅 docx + 无模板才显示排版参数（字体/字号/行距/页边距/页眉/封面等）：
              docx + 有模板时由上传的 .docx 模板自带版式，md/pdf 时这些参数不生效，均整块隐藏。 */}
          <Show when={input().outputFormat === "docx" && input().templateMode === "none"}>
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
          </Show>
          {/* [论文助手定制] Skill 多选：勾选的 Skill 在生成时注入提示词（见 thesis-generator）。 */}
          <ThesisSkillPicker step="formatting" />
          <Show when={input().paperSource === "auto" && !sourcePaper()}>
            <div class="flex items-start gap-1.5 rounded-md bg-v2-background-bg-layer-01 px-2.5 py-2 text-11-regular text-v2-text-text-faint">
              自动模式暂无全文稿，可切换为「手动粘贴全文」或「无源稿」。
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
