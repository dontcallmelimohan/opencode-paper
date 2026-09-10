// [论文助手定制] 「论文排版」模块的选项常量与配置文档构建：
// 常量与 buildFormattingConfigMarkdown 从 step-formatting 抽出，供 step-formatting（导出参数）
// 与 thesis-config-forms（配置浮窗 + 同步到文件空间）共用，避免两处重复维护。
import type { FormattingInput } from "./thesis-workflow-store"

export const PAPER_TYPES = ["综述论文", "课程论文", "毕业论文", "期刊投稿稿"]
export const REFERENCE_STYLES = ["GB/T 7714-2015", "APA 7th", "MLA 9th", "Vancouver", "IEEE"]
export const HEADING_STYLES = ["三级标题", "二级标题", "四号标题层级", "英文小标题"]
export const TYPOGRAPHIES = ["中文学术默认", "中文核心期刊风格", "英文 SCI 风格", "毕业论文模板"]
// [论文助手定制] docx 排版参数选项（导出 Word 时生效，控制后端 docx 引擎的视觉规范）。
export const FONT_FAMILIES = ["宋体", "黑体", "楷体", "仿宋"]
export const FONT_SIZES = [
  { label: "五号（10.5pt）", value: "10.5" },
  { label: "小四（12pt）", value: "12" },
  { label: "四号（14pt）", value: "14" },
]
export const LINE_SPACINGS = [
  { label: "单倍", value: "1" },
  { label: "1.5 倍", value: "1.5" },
  { label: "双倍", value: "2" },
]
export const PAGE_MARGINS = [
  { label: "标准", value: "standard" },
  { label: "窄边距", value: "narrow" },
  { label: "毕业论文规范", value: "thesis" },
]
// [论文助手定制] 扩充 docx 排版参数选项：标题字体 / 首行缩进字符数 / 段后间距。
export const HEADING_FONTS = ["黑体", "宋体", "楷体", "仿宋", "微软雅黑"]
export const FIRST_LINE_INDENTS = [
  { label: "不缩进", value: "0" },
  { label: "1 字符", value: "1" },
  { label: "2 字符（默认）", value: "2" },
  { label: "4 字符", value: "4" },
]
export const PARAGRAPH_SPACINGS = [
  { label: "紧凑（0pt）", value: "0" },
  { label: "默认（6pt）", value: "6" },
  { label: "宽松（12pt）", value: "12" },
  { label: "很宽（24pt）", value: "24" },
]

// [论文助手定制] 排版「使用场景」：普通用户先回答“这篇要交到哪 / 给谁看”，
// 系统按场景给出推荐的输出格式、论文类型、参考文献等默认（见 SCENARIO_RECOMMENDATIONS）。
// 场景本身只用于引导与面板记忆，不写入排版配置文档（排版配置文档不包含该字段）。
export const FORMATTING_SCENARIOS = [
  { value: "thesis", label: "中文毕业论文（本 / 硕 / 博）", hint: "通常交 Word、按学校模板；引用默认 GB/T 7714-2015。" },
  { value: "course", label: "课程论文 / 作业 / 报告", hint: "按任课老师要求；中文一般用 GB/T 7714-2015。" },
  { value: "cn-journal", label: "中文期刊投稿", hint: "按期刊排版细则；引用默认 GB/T 7714-2015。" },
  { value: "en-journal", label: "英文期刊投稿", hint: "优先官方 LaTeX / Word 模板；引用格式建议按学科选择。" },
  { value: "conference", label: "国际会议论文", hint: "按会议模板，常为两栏并带页数限制。" },
  { value: "general", label: "通用 / 其他", hint: "不自动覆盖下方设置，按你的选择排版。" },
] as const

export type FormattingScenario = (typeof FORMATTING_SCENARIOS)[number]["value"]

// [论文助手定制] 场景 → 推荐默认值（只覆盖排版相关字段，不动内容来源与模板文件；
// general 不自动覆盖，避免把用户已调好的设置冲掉）。
export const SCENARIO_RECOMMENDATIONS: Record<FormattingScenario, Partial<FormattingInput>> = {
  thesis: {
    outputFormat: "docx",
    paperType: "毕业论文",
    referenceStyle: "GB/T 7714-2015",
    headingStyle: "三级标题",
    typography: "中文学术默认",
  },
  course: {
    outputFormat: "docx",
    paperType: "课程论文",
    referenceStyle: "GB/T 7714-2015",
    headingStyle: "三级标题",
    typography: "中文学术默认",
  },
  "cn-journal": {
    outputFormat: "docx",
    paperType: "期刊投稿稿",
    referenceStyle: "GB/T 7714-2015",
    headingStyle: "三级标题",
    typography: "中文核心期刊风格",
  },
  "en-journal": {
    outputFormat: "pdf",
    paperType: "期刊投稿稿",
    referenceStyle: "IEEE",
    headingStyle: "二级标题",
    typography: "英文 SCI 风格",
  },
  conference: {
    outputFormat: "pdf",
    paperType: "期刊投稿稿",
    referenceStyle: "IEEE",
    headingStyle: "二级标题",
    typography: "英文 SCI 风格",
  },
  general: {},
}

// [论文助手定制] 标题层级 / 排版风格的旧枚举值：不再出现在首屏选项里（语义已被“使用场景”等取代），
// 但保留在常量与数据里以兼容历史配置；若当前值恰为旧值，选择器会把它作为唯一选项显示出来。
export const LEGACY_HEADING_STYLES = ["四号标题层级", "英文小标题"] as const
export const HEADING_STYLE_OPTIONS = HEADING_STYLES.filter((value) => !(LEGACY_HEADING_STYLES as readonly string[]).includes(value))
export const LEGACY_TYPOGRAPHIES = ["毕业论文模板"] as const
export const TYPOGRAPHY_OPTIONS = TYPOGRAPHIES.filter((value) => !(LEGACY_TYPOGRAPHIES as readonly string[]).includes(value))

// [论文助手定制] 参考文献格式按学科场景分组展示（value 与原来一致，仅用于面板呈现与说明）。
export const REFERENCE_STYLE_GROUPS: {
  group: string
  items: { value: string; note?: string }[]
}[] = [
  {
    group: "中文论文 / 学位论文",
    items: [{ value: "GB/T 7714-2015", note: "顺序编码制，国内使用最广" }],
  },
  { group: "医学 / 生物 / 护理", items: [{ value: "Vancouver", note: "顺序编码制" }] },
  { group: "计算机 / 电子 / 工程", items: [{ value: "IEEE", note: "顺序编码制" }] },
  { group: "心理 / 教育 / 社科（欧美）", items: [{ value: "APA 7th", note: "著者-出版年制" }] },
  { group: "人文 / 语言 / 文学", items: [{ value: "MLA 9th", note: "著者-出版年制" }] },
]

// [论文助手定制] docx 无模板时的「版式预设」：一键套用一组常用参数（随后仍可微调）；
// custom 不修改任何参数。预设只影响无模板 docx 的参数区，不影响其它格式。
export type DocxPresetKey = "thesis" | "cn-journal" | "custom"
export const DOCX_PARAM_PRESETS: { value: DocxPresetKey; label: string; params: Partial<FormattingInput> | null }[] = [
  {
    value: "thesis",
    label: "毕业论文通用：宋体小四、1.5 倍行距、毕业论文页边距、黑体标题",
    params: {
      fontFamily: "宋体",
      fontSize: "12",
      lineSpacing: "1.5",
      pageMargin: "thesis",
      headingFont: "黑体",
      firstLineIndent: "2",
      paragraphSpacing: "6",
      titleNumbering: true,
      pageNumber: true,
    },
  },
  {
    value: "cn-journal",
    label: "中文期刊通用：宋体五号、1.5 倍行距、标准页边距、黑体标题",
    params: {
      fontFamily: "宋体",
      fontSize: "10.5",
      lineSpacing: "1.5",
      pageMargin: "standard",
      headingFont: "黑体",
      firstLineIndent: "2",
      paragraphSpacing: "6",
      titleNumbering: true,
      pageNumber: true,
    },
  },
  { value: "custom", label: "自定义（不套预设，展开下方精细参数自己设置）", params: null },
]

// [论文助手定制] 排版输出格式选项：先选排版文件格式（md / docx / pdf），
// 决定生成排版稿后的交付方式——md=写入「正文/排版稿.md」，docx/pdf=生成后自动导出对应文件。
export const OUTPUT_FORMATS: { label: string; value: "md" | "docx" | "pdf" }[] = [
  { label: "Markdown（.md）", value: "md" },
  { label: "Word（.docx）", value: "docx" },
  { label: "PDF", value: "pdf" },
]

// [论文助手定制] 「有无模板」选项：无模板=手动配置排版参数；
// 有模板=从文件空间选择对应格式的模板文件（md/.docx/.dotx/.tex，类型随「排版文件格式」联动），
// 有模板时 docx 排版参数隐藏且不生效（见 buildPrompt 与 docx 导出分支）。
export const TEMPLATE_MODES: { label: string; value: "none" | "upload" }[] = [
  { label: "无模板", value: "none" },
  { label: "有模板", value: "upload" },
]

// [论文助手定制] 模板文件类型随排版输出格式联动：
// - md：Markdown 模板（.md/.markdown），模型按其章节结构排版，输出 md；
// - docx：Word 模板（.docx/.dotx，dotx 同为 OOXML zip），正文插入模板（保留页眉/页脚/页面设置）；
// - pdf：LaTeX 模板（.tex/.latex），模型按其结构与命令排版，PDF 由内置引擎生成。
export const TEMPLATE_FORMATS: Record<
  "md" | "docx" | "pdf",
  { label: string; accept: string; ext: RegExp; hint: string }
> = {
  md: {
    label: "Markdown（.md）",
    accept: ".md,.markdown",
    ext: /\.(md|markdown)$/i,
    hint: "从文件空间选择 Markdown 模板，模型按其章节结构排版正文。",
  },
  docx: {
    label: "Word（.docx/.dotx）",
    accept: ".docx,.dotx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: /\.(docx|dotx)$/i,
    hint: "正文将插入模板（保留模板页眉/页脚/页面设置），模板模式下无需配置下方排版参数。",
  },
  pdf: {
    label: "LaTeX（.tex）",
    accept: ".tex,.latex",
    ext: /\.(tex|latex)$/i,
    hint: "从文件空间选择 LaTeX 模板，模型按其结构与命令排版正文（PDF 由内置引擎生成）。",
  },
}

// [论文助手定制] 真实调用 Skill：模板文件转 file part 时用的 MIME（随排版格式对应）。
export const TEMPLATE_MIMES: Record<"md" | "docx" | "pdf", string> = {
  md: "text/markdown",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // [论文助手定制] LaTeX 模板按 text/* 附加（text/x-tex）：模型 Provider 只支持 image/pdf/text 的
  // file part，application/x-tex 会抛 "file part media type ... not supported" 中断整轮。
  pdf: "text/x-tex",
}

// [论文助手定制] 排版配置/手动全文写入文件空间 config/ 目录（与提纲 config/论文主题.md 一致，
// 可见可编辑），「同步到文件空间」后作为 file part（@形式）附件给模型：配置可编辑、可复用。
export const FORMATTING_CONFIG_PATH = "config/排版配置.md"
export const MANUAL_PAPER_PATH = "config/排版手动全文.md"

// [论文助手定制] 文件来源模式（paperSource=file）下附件 MIME 按扩展名推断，供模型正确读取。
export const mimeForSource = (path: string): string => {
  if (/\.(md|markdown)$/i.test(path)) return "text/markdown"
  if (/\.txt$/i.test(path)) return "text/plain"
  if (/\.(docx|dotx)$/i.test(path)) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  if (/\.doc$/i.test(path)) return "application/msword"
  if (/\.tex$/i.test(path)) return "text/x-tex"
  if (/\.pdf$/i.test(path)) return "application/pdf"
  return "text/plain"
}

// [论文助手定制] 判断文件能否作为 file part 直接附加给模型：模型 Provider 的 file part
// 只支持 image/*、application/pdf、text/*，md/txt/tex/pdf/图片可以；docx/dotx/doc 等
// 二进制文档不能直接附加（会被 Provider 拒绝），只把路径写进配置由系统/工具处理。
export const canAttachAsFilePart = (path: string): boolean =>
  /\.(md|markdown|txt|tex|latex|pdf)$/i.test(path) ||
  /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(path)

// [论文助手定制] 构造「排版要求」配置文档全文：写入项目 .thesis/config/formatting.md 后作为附件给模型，
// 而不是每次都把一大段配置拼进提示词；文件可编辑、可复用，模型工具调用中也能反复读取。
export function buildFormattingConfigMarkdown(values: FormattingInput): string {
  const lines: string[] = []
  lines.push("# 论文排版配置")
  lines.push("以下是本次排版的完整配置，请严格按此执行。")
  lines.push("")
  lines.push("## 排版要求")
  const formatLabel = OUTPUT_FORMATS.find((item) => item.value === values.outputFormat)?.label ?? values.outputFormat
  lines.push(`- 排版文件格式：${formatLabel}`)
  if (values.templateMode === "upload" && values.templatePath) {
    const tpl = TEMPLATE_FORMATS[values.outputFormat]
    const templateAttached = canAttachAsFilePart(values.templatePath)
    lines.push(
      `- 排版模板：${values.templateName || values.templatePath}（${tpl.label}）${
        templateAttached ? "，模板文件已作为附件提供" : "，模板为二进制文档（docx/dotx 等）不直接附加，按上方路径用工具读取"
      }`,
    )
    // [论文助手定制] docx 模板交付：模型输出排版后的 Markdown 正文，
    // 系统（后端 applyDocxTemplate）把正文插入模板；若会话里 @ 了排版类 Skill，按其指令产出成品。
    if (values.outputFormat === "docx") {
      lines.push(
        "  - 最终 Word 成品由系统套用该模板（保留模板页眉/页脚/页面设置），你只需输出排版后的 Markdown 正文；若会话已 @ 选择排版类 Skill，请按 Skill 指令产出 .docx 文件。",
      )
    } else {
      lines.push("  - 请读取模板文件，按模板的结构与版式排版正文。")
    }
  } else {
    lines.push("- 排版模板：无模板，按下方手动配置的排版参数与规范排版。")
  }
  if (values.templateMode !== "upload") {
    lines.push(`- 目标期刊 / 学校模板：${values.journal.trim() || "未指定"}`)
    lines.push(`- 论文类型：${values.paperType}`)
    lines.push(`- 参考文献格式：${values.referenceStyle}`)
    lines.push(`- 标题层级：${values.headingStyle}`)
    lines.push(`- 排版风格：${values.typography}`)
  }
  // [论文助手定制] 文件来源：记录所选文件空间的源文件路径（模型可对照附件确认）；
  // 二进制文档（docx/doc 等）不直接附加，提示用工具读取。
  if (values.paperSource === "file" && values.sourceFile) {
    lines.push(
      canAttachAsFilePart(values.sourceFile)
        ? `- 论文全文来源：文件空间文件 ${values.sourceFile}（已作为附件提供）。`
        : `- 论文全文来源：文件空间文件 ${values.sourceFile}（二进制文档，未直接附加，请按路径用工具读取）。`,
    )
  }
  if (values.requirements.trim()) lines.push(`- 额外排版要求：${values.requirements.trim()}`)
  // [论文助手定制] 输出要求保留在配置文档里（模型 @ 到配置文件后必读），避免漏读正文输出规范。
  lines.push("", "## 输出要求")
  const bodyRule =
    values.outputFormat === "md"
      ? "Markdown 格式：统一标题层级与编号、段首缩进、图表编号、参考文献列表按指定格式排列。"
      : "章节标题用 Markdown 的 # 层级标记（# 章 / ## 节 / ### 小节），正文段落为纯文本（不要使用 ** 加粗、* 斜体 等行内 Markdown 标记，段首不要手动空格缩进，导出时会自动处理），表格保留 Markdown 表格语法，参考文献每条单独一段（[1] 序号格式）。"
  lines.push(
    `- 只输出排版后的论文正文本身：禁止输出任何排版说明、页眉页脚设置说明、字体字号说明、注释或标注；正文之前不要有任何标题性文字；${bodyRule}`,
  )
  return lines.join("\n")
}
