// [论文助手定制] 论文导出 Word：把 Markdown 文稿排版成可直接提交的 .docx。
// 定位：docx 是论文平台的主交付物，因此这里做的是「结构化排版」而非简单的语法映射：
//   - 标题 → Word 内置 Heading 样式 + 多级自动编号（1 / 1.1 / 1.1.1；参考文献/摘要/致谢等不编号）
//   - 正文 → 中文字体 + 首行缩进 2 字符 + 行距/字号可配
//   - 表格 → 学术三线表（表头上下粗线、表底粗线、无竖线）
//   - 参考文献 → [1]… 悬挂缩进
//   - 毕业论文类型 → 自动加封面（题目/作者/单位/日期）与页脚居中页码
//   - 页眉（可选）：居中显示页眉文字 + 下边框细线
// 所有视觉参数通过 ThesisDocxOptions 传入（来自 Step 3 排版参数面板）。
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
} from "docx"
import type { IParagraphOptions, IRunOptions } from "docx"
// [论文助手定制] 上传模板模式：用 jszip 解压用户上传的 .docx 模板，
// 把 AI 排版正文插入模板的 word/document.xml（保留模板页眉/页脚/页面设置/样式）。
import JSZip from "jszip"

// [论文助手定制] 排版参数：由前端 Step 3 面板传入，控制 docx 的视觉规范。
export type ThesisDocxOptions = {
  paperType?: string
  fontFamily?: string
  fontSize?: number
  lineSpacing?: number
  pageMargin?: "standard" | "narrow" | "thesis"
  titleNumbering?: boolean
  cover?: { title?: string; author?: string; affiliation?: string; date?: string }
  // [论文助手定制] 扩充排版参数：页眉文字 / 标题字体 / 首行缩进字符数 / 段后间距(pt) / 页脚页码开关。
  headerText?: string
  headingFont?: string
  firstLineIndent?: number
  paragraphSpacing?: number
  pageNumber?: boolean
  // [论文助手定制] 上传模板：相对项目根目录的 .docx 模板文件路径（如 模板/毕业论文模板.docx）。
  // 提供后走「套用模板」分支：正文插入模板文档，视觉参数（字体/字号/行距等）不再生效。
  templatePath?: string
}

const DEFAULTS: Required<Pick<ThesisDocxOptions, "fontFamily" | "fontSize" | "lineSpacing" | "pageMargin" | "titleNumbering" | "headingFont" | "firstLineIndent" | "paragraphSpacing" | "pageNumber">> = {
  fontFamily: "宋体",
  fontSize: 12,
  lineSpacing: 1.5,
  pageMargin: "standard",
  titleNumbering: true,
  headingFont: "黑体",
  firstLineIndent: 2,
  paragraphSpacing: 6,
  pageNumber: true,
}

// [论文助手定制] 页边距预设（twips）：标准 / 窄 / 毕业论文规范（上 3.0 下 2.5 左 3.0 右 2.5cm）。
const MARGINS = {
  standard: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.25), right: convertInchesToTwip(1.25) },
  narrow: { top: convertInchesToTwip(0.5), bottom: convertInchesToTwip(0.5), left: convertInchesToTwip(0.5), right: convertInchesToTwip(0.5) },
  thesis: { top: 1701, bottom: 1418, left: 1701, right: 1418 },
} as const

// [论文助手定制] 不参与自动编号的章节标题（摘要/目录/参考文献/致谢/附录等）。
const NO_NUMBER_TITLE = /^(摘要|目录|参考文献|致谢|附录|Abstract|References|Acknowledgments?)/i

type InlineToken = { text: string; bold?: boolean; italic?: boolean; code?: boolean; link?: string }

// [论文助手定制] 解析行内格式：**加粗**、*斜体*、`行内代码`、[文字](链接)。
const INLINE_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]\n]+]\([^)\n]+\))/g

export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let index = 0
  for (const match of text.matchAll(INLINE_RE)) {
    const raw = match[0]
    if (match.index !== undefined && match.index > index) tokens.push({ text: text.slice(index, match.index) })
    index = (match.index ?? 0) + raw.length
    if (raw.startsWith("**")) tokens.push({ text: raw.slice(2, -2), bold: true })
    else if (raw.startsWith("`")) tokens.push({ text: raw.slice(1, -1), code: true })
    else if (raw.startsWith("*")) tokens.push({ text: raw.slice(1, -1), italic: true })
    else {
      const label = raw.match(/^\[([^\]\n]+)]/)?.[1] ?? raw
      const link = raw.match(/]\(([^)\n]+)\)$/)?.[1]
      tokens.push({ text: label, link })
    }
  }
  if (index < text.length) tokens.push({ text: text.slice(index) })
  return tokens
}

const inlineRuns = (text: string, base: Partial<IRunOptions> = {}): TextRun[] =>
  parseInline(text).map((token) => {
    if (token.code)
      return new TextRun({ text: token.text, font: { ascii: "Consolas", hAnsi: "Consolas", eastAsia: "宋体" }, size: 20, shading: { type: "clear", fill: "F2F2F2" } })
    return new TextRun({
      text: token.text,
      bold: token.bold,
      italics: token.italic,
      ...base,
      ...(token.link ? { style: "Hyperlink" } : {}),
    })
  })

const isTableSeparator = (line: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-") && line.includes("|")

// [论文助手定制] 把表格行切成单元格（去掉首尾空单元格，兼容无首尾竖线写法）。
const splitRow = (line: string): string[] => {
  const trimmed = line.trim().replace(/^\||\|$/g, "")
  return trimmed.split("|").map((cell) => cell.trim())
}

// [论文助手定制] 行内标记还原为纯文本（用于列表项/表格的判断）。
const plainText = (text: string) => text.replace(INLINE_RE, (raw) => raw.replace(/\*\*|\*|`/g, "")).replace(/\[([^\]\n]+)]\([^)\n]+\)/g, "$1")

const headingLevels = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
} as const

// [论文助手定制] 三线表：表头行上下细线（底为细线）、首行上粗线、末行下粗线，其余无边框。
const threeLineTable = (rows: string[][], width: number): Table => {
  const cellWidth = 9360 / Math.max(width, 1)
  const cell = (text: string, opts: { header?: boolean; top?: boolean; bottom?: boolean }): TableCell =>
    new TableCell({
      width: { size: cellWidth, type: WidthType.DXA },
      borders: {
        ...(opts.top
          ? { top: { style: BorderStyle.SINGLE, size: 12, color: "000000" } }
          : { top: { style: BorderStyle.NONE } }),
        ...(opts.header ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" } } : {}),
        ...(opts.bottom ? { bottom: { style: BorderStyle.SINGLE, size: 12, color: "000000" } } : {}),
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
      },
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [
        new Paragraph({
          alignment: opts.header ? AlignmentType.CENTER : AlignmentType.LEFT,
          spacing: { after: 0, line: 300 },
          children: inlineRuns(text),
        }),
      ],
    })
  const row = (values: string[], index: number): TableRow =>
    new TableRow({
      children: values.map((value, col) =>
        cell(value, {
          header: index === 0,
          top: index === 0,
          bottom: index === rows.length - 1,
        }),
      ),
    })
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    rows: rows.map((values, index) => row(values, index)),
  })
}

// [论文助手定制] 参考文献段（[1]…）悬挂缩进；识别「参考文献」标题之后的编号段落。
const isReferenceItem = (text: string) => /^\[\d+]\s*/.test(text)

// [论文助手定制] 主转换函数：Markdown 文本 + 排版参数 → docx Buffer。
export async function markdownToDocx(markdown: string, options: ThesisDocxOptions = {}): Promise<Buffer> {
  const fontFamily = options.fontFamily || DEFAULTS.fontFamily
  const fontSize = options.fontSize || DEFAULTS.fontSize
  const lineSpacing = options.lineSpacing || DEFAULTS.lineSpacing
  const pageMargin = options.pageMargin || DEFAULTS.pageMargin
  const titleNumbering = options.titleNumbering ?? DEFAULTS.titleNumbering
  // [论文助手定制] 标题字体可配（默认黑体；兼容旧请求：未传且正文是宋体时沿用黑体）。
  const headingFont = options.headingFont?.trim() || (fontFamily === "宋体" ? DEFAULTS.headingFont : fontFamily)
  // [论文助手定制] 首行缩进字符数可配（1 字符 = 20 twip × 字号 pt，默认 2 字符）。
  const firstLineIndent = Math.round(fontSize * 20 * (options.firstLineIndent ?? DEFAULTS.firstLineIndent))
  // [论文助手定制] 段后间距可配（单位 pt，1pt = 20 twip，默认 6pt）。
  const paragraphSpacing = (options.paragraphSpacing ?? DEFAULTS.paragraphSpacing) * 20

  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const children: (Paragraph | Table)[] = []
  let index = 0

  // [论文助手定制] 封面：毕业论文等类型需要时插入，标题居中二号黑体，信息三号宋体，末尾分页。
  if (options.cover?.title) {
    const coverLines: (Paragraph | Table)[] = []
    for (let i = 0; i < 4; i += 1) coverLines.push(new Paragraph({ children: [] }))
    coverLines.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 480, line: 480 },
      children: [new TextRun({ text: options.cover.title, font: { ascii: "Times New Roman", hAnsi: "Times New Roman", eastAsia: headingFont }, size: 44, bold: true })],
    }))
    for (let i = 0; i < 3; i += 1) coverLines.push(new Paragraph({ children: [] }))
    for (const [label, value] of [["作者", options.cover.author], ["单位", options.cover.affiliation], ["日期", options.cover.date]] as const) {
      if (value) {
        coverLines.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240, line: 480 },
          children: [new TextRun({ text: `${label}：${value}`, font: { ascii: "Times New Roman", hAnsi: "Times New Roman", eastAsia: fontFamily }, size: 32 })],
        }))
      }
    }
    coverLines.push(new Paragraph({ children: [new TextRun({ children: [new PageBreak()] })] }))
    children.push(...coverLines)
  }

  const pushParagraph = (runs: TextRun[], opts: Partial<IParagraphOptions> = {}, text = "") => {
    // [论文助手定制] 普通正文段：首行缩进 2 字符；参考文献条目改为悬挂缩进；列表/引用等由调用方传 indent 覆盖。
    const isRef = isReferenceItem(text)
    const indent = opts.indent ?? (isRef
      ? { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.4) }
      : { firstLine: firstLineIndent })
    children.push(new Paragraph({
      children: runs,
      spacing: { after: Math.round(paragraphSpacing), line: Math.round(240 * lineSpacing) },
      ...opts,
      indent,
    }))
  }

  while (index < lines.length) {
    const line = lines[index]

    // 代码块
    if (/^\s*```/.test(line)) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !/^\s*```/.test(lines[index])) {
        code.push(lines[index])
        index += 1
      }
      index += 1
      pushParagraph([
        new TextRun({
          text: code.join("\n"),
          font: { ascii: "Consolas", hAnsi: "Consolas", eastAsia: "宋体" },
          size: Math.round(fontSize * 1.5),
        }),
      ], {
        spacing: { before: 120, after: 120, line: Math.round(240 * lineSpacing) },
        shading: { type: "clear", fill: "F7F7F7" },
        indent: { left: convertInchesToTwip(0.2), right: convertInchesToTwip(0.2) },
      })
      continue
    }

    // 表格：收集连续的表格行（第二行为分隔行），转三线表。
    if (line.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const rows: string[][] = [splitRow(line)]
      index += 2
      while (index < lines.length && lines[index].includes("|") && lines[index].trim() !== "" && !isTableSeparator(lines[index])) {
        rows.push(splitRow(lines[index]))
        index += 1
      }
      const width = Math.max(...rows.map((row) => row.length))
      const normalized = rows.map((row) => [...row, ...Array<string>(width - row.length).fill("")])
      children.push(threeLineTable(normalized, width))
      continue
    }

    // 标题
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3 | 4 | 5 | 6
      const text = heading[2].trim()
      // [论文助手定制] 摘要/参考文献/致谢等标题不参与自动编号；编号开关关闭时全部不编号。
      const numbered = titleNumbering && !NO_NUMBER_TITLE.test(text) && level <= 3
      children.push(new Paragraph({
        heading: headingLevels[level],
        numbering: numbered ? { reference: "thesis-headings", level: (level - 1) as 0 | 1 | 2 } : undefined,
        spacing: { before: 260, after: 160, line: Math.round(240 * lineSpacing) },
        children: inlineRuns(text),
      }))
      index += 1
      continue
    }

    // 分割线
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      children.push(new Paragraph({
        spacing: { before: 120, after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999" } },
        children: [],
      }))
      index += 1
      continue
    }

    // 引用
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = []
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""))
        index += 1
      }
      pushParagraph(inlineRuns(quote.join("\n")), {
        indent: { left: convertInchesToTwip(0.3) },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: "BBBBBB", space: 8 } },
        shading: { type: "clear", fill: "FAFAFA" },
      })
      continue
    }

    // 无序列表
    const bullet = line.match(/^\s*([-*+])\s+(.*)$/)
    if (bullet && !/^\s*[-*+]\s*$/.test(line)) {
      children.push(new Paragraph({
        numbering: { reference: "thesis-bullets", level: 0 },
        spacing: { after: 60, line: Math.round(240 * lineSpacing) },
        indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) },
        children: inlineRuns(bullet[2]),
      }))
      index += 1
      continue
    }

    // 有序列表
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.*)$/)
    if (ordered) {
      children.push(new Paragraph({
        numbering: { reference: "thesis-numbers", level: 0 },
        spacing: { after: 60, line: Math.round(240 * lineSpacing) },
        indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) },
        children: inlineRuns(ordered[2]),
      }))
      index += 1
      continue
    }

    // 普通段落（含空行跳过）
    const text = plainText(line).trim()
    if (text) {
      pushParagraph(inlineRuns(line.trim()), {}, text)
    }
    index += 1
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "thesis-bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) } } },
            },
          ],
        },
        {
          reference: "thesis-numbers",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) } } },
            },
          ],
        },
        // [论文助手定制] 标题多级自动编号：1 / 1.1 / 1.1.1，只启用前三级。
        ...(titleNumbering
          ? [{
              reference: "thesis-headings",
              levels: [
                { level: 0, format: LevelFormat.DECIMAL, text: "%1", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 0, hanging: 0 } } } },
                { level: 1, format: LevelFormat.DECIMAL, text: "%1.%2", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 0, hanging: 0 } } } },
                { level: 2, format: LevelFormat.DECIMAL, text: "%1.%2.%3", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 0, hanging: 0 } } } },
              ],
            }]
          : []),
      ],
    },
    styles: {
      default: {
        document: {
          run: {
            font: { ascii: "Times New Roman", hAnsi: "Times New Roman", eastAsia: fontFamily },
            size: Math.round(fontSize * 2), // pt → half-points
          },
          paragraph: { spacing: { line: Math.round(240 * lineSpacing), after: Math.round(paragraphSpacing) } },
        },
        heading1: { run: { font: { ascii: "Times New Roman", hAnsi: "Times New Roman", eastAsia: headingFont }, size: 32, bold: true } },
        heading2: { run: { font: { ascii: "Times New Roman", hAnsi: "Times New Roman", eastAsia: headingFont }, size: 28, bold: true } },
        heading3: { run: { font: { ascii: "Times New Roman", hAnsi: "Times New Roman", eastAsia: headingFont }, size: 24, bold: true } },
        heading4: { run: { font: { ascii: "Times New Roman", hAnsi: "Times New Roman", eastAsia: headingFont }, size: 22, bold: true } },
      },
    },
    sections: [{
      properties: { page: { margin: MARGINS[pageMargin] } },
      // [论文助手定制] 页眉：填了页眉文字才生成（居中 + 下边框细线，9pt 正文同字体）。
      headers: options.headerText?.trim()
        ? {
            default: new Header({
              children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000", space: 1 } },
                children: [new TextRun({
                  text: options.headerText.trim(),
                  font: { ascii: "Times New Roman", hAnsi: "Times New Roman", eastAsia: fontFamily },
                  size: 18, // 9pt
                })],
              })],
            }),
          }
        : undefined,
      // [论文助手定制] 页脚页码可关闭（默认开启，居中当前页）。
      footers: options.pageNumber === false
        ? undefined
        : {
            default: new Footer({
              children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: [PageNumber.CURRENT] })],
              })],
            }),
          },
      children,
    }],
  })

  return Packer.toBuffer(doc)
}

// [论文助手定制] —— 上传模板模式 ——
// 用户上传自己的 .docx 模板（如学校发的模板，含页眉/页脚/页面设置/封面），
// 排版时把 AI 生成的排版稿（Markdown）转成 WordprocessingML 段落，
// 插入模板的 word/document.xml 正文区（保留模板的 <w:sectPr> 页面设置），
// 从而实现「套用模板」而不是从零排版。模板模式下视觉参数（字体/字号/行距等）不生效。

const escapeXmlText = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

// [论文助手定制] 行内标记 → 一串 <w:r>：**加粗**、*斜体*、`行内代码`。
const inlineDocXml = (text: string): string => {
  const parts: string[] = []
  let index = 0
  for (const match of text.matchAll(INLINE_RE)) {
    if (match.index !== undefined && match.index > index) {
      parts.push(`<w:t xml:space="preserve">${escapeXmlText(text.slice(index, match.index))}</w:t>`)
    }
    index = (match.index ?? 0) + match[0].length
    const raw = match[0]
    if (raw.startsWith("**")) {
      parts.push(`<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXmlText(raw.slice(2, -2))}</w:t></w:r>`)
    } else if (raw.startsWith("`")) {
      parts.push(`<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/></w:rPr><w:t xml:space="preserve">${escapeXmlText(raw.slice(1, -1))}</w:t></w:r>`)
    } else if (raw.startsWith("*")) {
      parts.push(`<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${escapeXmlText(raw.slice(1, -1))}</w:t></w:r>`)
    }
  }
  if (index < text.length) parts.push(`<w:t xml:space="preserve">${escapeXmlText(text.slice(index))}</w:t>`)
  return parts.join("")
}

// [论文助手定制] Markdown 正文 → WordprocessingML 段落 XML。
// 标题段落尽量用模板的 Heading1/2/3 命名样式，并带内联粗体+字号兜底（模板缺样式也能显示）。
// 正文段落：1.5 倍行距 + 首行缩进 2 字符；参考文献条目悬挂缩进；表格转简单全边框表格。
const markdownToDocXml = (markdown: string): string => {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const parts: string[] = []
  let index = 0
  const HEADING_SIZES = [32, 28, 24, 22, 20, 18] // 三号→小四（半磅）

  while (index < lines.length) {
    const line = lines[index]

    // 代码块 → 等宽字体灰底段落
    if (/^\s*```/.test(line)) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !/^\s*```/.test(lines[index])) {
        code.push(lines[index])
        index += 1
      }
      index += 1
      const text = code.join("\n")
      parts.push(
        `<w:p><w:pPr><w:spacing w:line="300" w:lineRule="auto" w:before="120" w:after="120"/>` +
          `<w:shd w:val="clear" w:color="auto" w:fill="F7F7F7"/></w:pPr>` +
          `<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/></w:rPr>` +
          `<w:t xml:space="preserve">${escapeXmlText(text)}</w:t></w:r></w:p>`,
      )
      continue
    }

    // 表格：连续表格行（第二行为分隔行）→ 简单全边框表格
    if (line.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const rows: string[][] = [splitRow(line)]
      index += 2
      while (index < lines.length && lines[index].includes("|") && lines[index].trim() !== "" && !isTableSeparator(lines[index])) {
        rows.push(splitRow(lines[index]))
        index += 1
      }
      const width = Math.max(...rows.map((row) => row.length))
      const normalized = rows.map((row) => [...row, ...Array<string>(width - row.length).fill("")])
      const borders = ["top", "left", "bottom", "right", "insideH", "insideV"]
        .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`)
        .join("")
      parts.push(
        `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>` +
          `<w:tblBorders>${borders}</w:tblBorders></w:tblPr>` +
          normalized
            .map(
              (row) =>
                `<w:tr>` +
                row
                  .map(
                    (cell) =>
                      `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>` +
                      `<w:p><w:r><w:t xml:space="preserve">${escapeXmlText(cell.trim())}</w:t></w:r></w:p></w:tc>`,
                  )
                  .join("") +
                `</w:tr>`,
            )
            .join("") +
          `</w:tbl><w:p/>`,
      )
      continue
    }

    // 标题：# ~ ###### → 模板 Heading 样式 + 内联粗体字号
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = Math.min(heading[1].length, 6)
      const text = plainText(heading[2]).trim()
      parts.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/><w:outlineLvl w:val="${level - 1}"/>` +
          `<w:spacing w:before="240" w:after="120"/></w:pPr>` +
          `<w:r><w:rPr><w:b/><w:sz w:val="${HEADING_SIZES[level - 1] ?? 20}"/></w:rPr>` +
          `<w:t xml:space="preserve">${escapeXmlText(text)}</w:t></w:r></w:p>`,
      )
      index += 1
      continue
    }

    // 图片行：模板模式下不内嵌图片，转为居中图注段落（避免 asset:// 路径原文出现在正文里）。
    const image = line.match(/^\s*!\[([^\]]*)]\([^)]+\)\s*$/)
    if (image) {
      parts.push(
        `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="360" w:lineRule="auto"/></w:pPr>` +
          `<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">（插图：${escapeXmlText(image[1] || "未命名")}）</w:t></w:r></w:p>`,
      )
      index += 1
      continue
    }

    // 无序列表：带「• 」前缀的普通段落
    const bullet = line.match(/^\s*([-*+])\s+(.*)$/)
    if (bullet && !/^\s*[-*+]\s*$/.test(line)) {
      parts.push(
        `<w:p><w:pPr><w:spacing w:line="360" w:lineRule="auto"/><w:ind w:left="480" w:hanging="240"/></w:pPr>` +
          `<w:r><w:t xml:space="preserve">• </w:t></w:r>${inlineDocXml(bullet[2])}</w:p>`,
      )
      index += 1
      continue
    }

    // 有序列表：带「1. 」前缀的普通段落
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.*)$/)
    if (ordered) {
      parts.push(
        `<w:p><w:pPr><w:spacing w:line="360" w:lineRule="auto"/><w:ind w:left="480" w:hanging="240"/></w:pPr>` +
          `<w:r><w:t xml:space="preserve">${ordered[1]}. </w:t></w:r>${inlineDocXml(ordered[2])}</w:p>`,
      )
      index += 1
      continue
    }

    // 普通段落（空行跳过）
    const text = plainText(line).trim()
    if (text) {
      const isRef = isReferenceItem(text)
      parts.push(
        `<w:p><w:pPr><w:spacing w:line="360" w:lineRule="auto" w:after="120"/>` +
          (isRef
            ? `<w:ind w:left="720" w:hanging="480"/>`
            : `<w:ind w:firstLine="480"/>`) +
          `</w:pPr>${inlineDocXml(line.trim())}</w:p>`,
      )
    }
    index += 1
  }
  return parts.join("")
}

// [论文助手定制] 套用模板：解压模板 docx，用排版正文替换 body 内容（保留模板末尾的 <w:sectPr> 页面设置），
// 重新打包返回 Buffer。模板的页眉/页脚/样式/封面等其它部件原样保留。
export async function applyDocxTemplate(template: Buffer, markdown: string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(template)
  const documentXml = await zip.file("word/document.xml")?.async("string")
  if (!documentXml) throw new Error("模板文件不是有效的 Word 文档（缺少 word/document.xml）")
  const sectPrs = documentXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g)
  const sectPr = sectPrs?.[sectPrs.length - 1] ?? ""
  const bodyStart = documentXml.indexOf("<w:body>")
  const bodyEnd = documentXml.lastIndexOf("</w:body>")
  if (bodyStart === -1 || bodyEnd === -1) throw new Error("模板文件结构异常（缺少 body）")
  const prefix = documentXml.slice(0, bodyStart + "<w:body>".length)
  const suffix = documentXml.slice(bodyEnd)
  zip.file("word/document.xml", prefix + markdownToDocXml(markdown) + sectPr + suffix)
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
}
