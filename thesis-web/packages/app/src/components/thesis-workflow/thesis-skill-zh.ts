// [论文助手定制] Skill 中文名对照表：技能用英文 identifier 展示时难以理解，
// 在输入框技能选择器与技能管理页把中文名跟在英文名后面显示。
// 键用 SKILL.md frontmatter 的 name（与 thesis-agents.ts / thesis-session-view.tsx 的技能白名单一致）。
export const SKILL_ZH: Record<string, string> = {
  "academic-paper": "论文写作流水线（多智能体）",
  "academic-paper-reviewer": "多视角学术论文评审",
  "academic-pipeline": "学术研究全流程编排",
  "academic-researcher": "学术研究与 LaTeX 写作",
  "academic-writing": "学术写作（润色/格式化）",
  "bib-search-citation": "本地题录检索与引用",
  "chapter-structure-refactor": "章节结构重构",
  "cnki-advanced-search": "知网高级检索",
  "cnki-download": "知网文献下载",
  "cnki-export": "知网题录导出",
  "cnki-journal-index": "期刊收录索引查询",
  "cnki-journal-search": "期刊检索",
  "cnki-journal-toc": "期刊目录浏览",
  "cnki-navigate-pages": "检索结果翻页/排序",
  "cnki-paper-detail": "知网论文详情提取",
  "cnki-parse-results": "检索结果结构化解析",
  "cnki-search": "知网文献检索",
  "customize-opencode": "opencode 配置助手",
  "deep-research": "深度研究",
  "docx-editor-cn": "Word 文档编辑（中文版式）",
  "economics-thesis": "经济学实证论文工作流",
  "formula-normalizer": "公式规范化",
  "image-description": "论文插图描述",
  "latex-compile": "LaTeX 编译",
  "latex-paper-en": "英文 LaTeX 论文助手",
  "latex-paper-pipeline": "LaTeX 排版流水线（md→tex→编译 PDF）",
  "latex-thesis-zh": "中文 LaTeX 学位论文",
  "lit-search-cite": "多库文献检索与引用",
  "literature": "文献全链路整理",
  "literature-search-starter": "免费文献检索入门",
  "nature-reader": "论文精读 / 中英对照阅读",
  "paper-review": "期刊论文系统性评审",
  "research-writing": "学术论文写作",
  "svg-flowchart": "学术流程图（SVG）",
  "systematic-review-lite": "系统综述与文献筛选",
  "thesis-reviewer": "学位论文评审",
  "typst-paper": "Typst 论文助手",
  "zotero-cite": "Zotero 引用片段",
  "论文图表": "数据图表绘制（matplotlib）",
}

// [论文助手定制] Skill 中文简介对照表（选择技能时展示在名称下方的用途说明）。
// 只收录平台内置/常用技能；外部自装技能不在此表，选择时回退到其 SKILL.md 自带 description。
export const SKILL_DESC_ZH: Record<string, string> = {
  "academic-paper": "多智能体论文写作流水线：规划、提纲、全文撰写、修订与投稿前质量检查一站式完成，支持多种论文类型与引用格式。",
  "academic-paper-reviewer": "多视角学术评审：模拟多位审稿人逐节检查论文的正确性、清晰度与一致性，输出结构化评审意见。",
  "academic-pipeline": "学术研究全流程编排：把研究、写作、审查、修订、终检串成一条完整流水线，自动在多个技能之间交接。",
  "academic-researcher": "学术研究与 LaTeX 写作助手：从选题、综述到论文成稿，自动遵循 IEEE/APA 等引用规范。",
  "academic-writing": "学术写作一体化：段落级润色、术语统一、逻辑优化，以及中文人味化改写，结果输出到草稿文件。",
  "bib-search-citation": "检索本地 BibTeX/BibLaTeX 题录（含 Zotero 导出），按主题、作者、年份等筛选并生成引用片段。",
  "chapter-structure-refactor": "章节级学术重构：理清逻辑主线、重组素材、规范表达，适合方法、模型、实验等整章重塑。",
  "cnki-advanced-search": "知网专业（高级）检索：按主题词、作者、机构、发表时间等组合条件精准查找文献。",
  "cnki-download": "知网文献下载：按检索结果把原文 PDF 或题录下载保存到本地。",
  "cnki-export": "知网题录导出：把勾选或检索结果导出为标准化题录文件，方便后续引用管理。",
  "cnki-journal-index": "期刊收录与评价查询：核对期刊是否被北大核心、CSSCI、CSCD、SCI、EI 等收录，并查看影响因子等数据。",
  "cnki-journal-search": "知网期刊检索：按刊名、ISSN、CN 或主办单位定位期刊，浏览其收录信息。",
  "cnki-journal-toc": "知网期刊目录浏览：查看某刊各期目录与文章列表，方便按期跟进目标文献。",
  "cnki-navigate-pages": "知网检索结果翻页与排序：切换页码、调整排序方式，浏览更多检索结果。",
  "cnki-paper-detail": "知网论文详情提取：打开单篇详情页，抓取摘要、关键词、作者机构、参考文献等完整字段。",
  "cnki-parse-results": "知网检索结果解析：把列表页内容解析成标题、作者、期刊、年份等结构化数据。",
  "cnki-search": "知网文献检索：按关键词在知网检索学术文献并返回结果清单。",
  "customize-opencode": "opencode 配置助手：帮助完成平台设置，如添加模型、调整目录、运行与权限配置等。",
  "deep-research": "深度研究：多智能体协同的严谨研究，支持全文研究、快速简报、综述、系统评价、事实核查等模式。",
  "docx-editor-cn": "Word 文档编辑（中文版式）：新建、读取、修改 .docx，处理目录、标题、页码、图注、批注等版式。",
  "economics-thesis": "经济学实证论文工作流：从选题到排版成文的全流程交互式指导。",
  "formula-normalizer": "公式规范化：统一数学公式写法与符号、做全文符号一致性检查，可生成算法对比描述模板。",
  "image-description": "论文插图描述：为地图、流程图、数据图、概念图等插图撰写正文中的学术性说明，图文结合。",
  "latex-compile": "LaTeX 编译：用 XeLaTeX/BibTeX 编译学位论文主 .tex 并生成 PDF，也支持编译 Beamer 汇报稿。",
  "latex-paper-en": "英文 LaTeX 论文助手：面向已有 .tex 的英文期刊/会议论文，处理编译修复、版式、引用与润色。",
  "latex-paper-pipeline": "LaTeX 排版流水线：把 Markdown 全文稿按目标期刊/学位论文的 .tex 模板排版成可编译工程，可继续编译出 PDF。",
  "latex-thesis-zh": "中文 LaTeX 学位论文：编译诊断、GB/T 7714 引用、模板识别、结构格式检查、盲审隐匿与逐项终检。",
  "lit-search-cite": "多库文献检索与引用：检索知网/arXiv/PubMed/Google Scholar 等，下载 PDF、查期刊等级并生成引用。",
  "literature": "文献全链路整理：题录合并去重、文献检索、阅读综述、生成 BibTeX 或向 LaTeX 插入引用。",
  "literature-search-starter": "免费文献检索入门：零基础可用的文献检索，统一输出标题、作者、期刊、年份、DOI 等结构化信息。",
  "nature-reader": "论文精读/中英对照：从 PDF、DOI、链接或粘贴文本，把论文生成中英对照、图文位置正确的阅读稿。",
  "paper-review": "期刊论文系统性评审：先建全貌再逐节检查正确性、清晰度与一致性，输出可执行的修改意见。",
  "research-writing": "学术论文写作：30 个模板覆盖润色、翻译、综述、引言、方法、回复审稿人、去 AI 味等全流程。",
  "svg-flowchart": "学术流程图（SVG）：把流程、步骤、模块结构画成可直接插入论文的矢量图，可导出 PDF 供 LaTeX 使用。",
  "systematic-review-lite": "系统综述与文献筛选：按 PRISMA 思路筛选文献、评估纳入研究并整理成综述。",
  "thesis-reviewer": "学位论文评审：以导师/盲审专家视角做选题综述、方法、工作量、规范等全面检查与语义级精审。",
  "typst-paper": "Typst 论文助手：面向 .typ 稿件处理编译导出、版式、引用检查与润色，中英文均可。",
  "zotero-cite": "Zotero 引用：把文献写入本地 Zotero，并生成可在 Word 中刷新、换样式的活引用片段。",
  "论文图表": "数据图表绘制：用 Python matplotlib 绘制柱状图、折线图、散点图、误差条、箱线图、多子图等论文图表。",
}

// [论文助手定制] 展示用标签：英文名 + 中文名（未收录的技能保持原名）。
export function thesisSkillLabel(name: string): string {
  const zh = SKILL_ZH[name]
  return zh ? `${name} · ${zh}` : name
}

// [论文助手定制] 技能选择器展示用简介：优先本地维护的中文说明（面向不懂 agent 的用户），
// 未收录的技能回退到 SKILL.md frontmatter 的 description（可能为英文，但总比没有好）。
export function thesisSkillDescription(name: string, live?: string | null): string | undefined {
  return SKILL_DESC_ZH[name] ?? live ?? undefined
}
