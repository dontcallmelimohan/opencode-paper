# opencode 论文辅助 Skills 仓库（已分类）

本目录收集了适用于 OpenCode / Claude Code / Cursor 等支持 `SKILL.md` 格式的 AI 编程助手的
**论文相关 skill**，并按五个使用场景分类整理好。

> 所有 skill 实际文件都在 `sources/` 里（原始 git 克隆），`categories/` 下是**软链接**，
> 指向 `sources/` 中对应的 skill 目录。修改/升级时只需在 `sources/` 里 `git pull`，链接自动跟随。

## 产品定义

本仓库不是一个"技能合集"，而是一个**论文写作全流程智能体工作台**的模块仓库：OpenCode 是运行底座，
五个分类板块覆盖"写论文"生命周期的五个相位（文献检索 → 提纲 → 写作 → 排版 → 评审），而非五个独立工具。
其中**文献检索已独立为最顶上的 `00_文献检索` 板**——它最重的专职使用在写前提纲，但写中/写后仍会被写作/评审板按需调用。

> 对外一句话定位：**覆盖从文献检索、选题提纲、协同写作、规范排版到盲审评审的论文写作全流程智能体工作台。**
> （"投稿与返修"为规划中的第六相位，本期未纳入。）

四个板块围绕一个共享的"论文上下文"构成闭环：提纲产出结构 → 写作读结构成文 → 排版出合规成品
→ 评审找问题 → 返修回流到提纲/写作。没有这个闭环，就只是工具箱；有了它，才是产品。

### 五板块的定位与意义

| 板块 | 角色 | 相位 | 意义 |
|---|---|---|---|
| 文献检索（00） | 领航员+图书管理员 | 最上游（0 号位） | 检索/精读/管理/综述/引用，构建"论文空间"（文献库）；解决"不知领域已有什么、找不到/管不住国内外文献" |
| 提纲助手（01） | 架构师 | 上游 | 把想法变成可执行结构；决定整篇质量上限，解决"无从下笔" |
| 论文写作（02） | 协作者 | 核心 | 把结构落成文字，用户停留最久、调用最频的主战场 |
| 论文排版（03） | 工匠 | 出口 | 把内容变成符合规范的成品，决定"能不能递交"，消除格式返工 |
| 论文评审（04） | 守门员 | 下游 | 模拟盲审/答辩抓硬伤，是质量闸，也是返修回流的起点 |

文献检索、提纲与评审是"元环节"（管检索/规划/检验），写作与排版是"生产环节"（管产出与呈现）。
当前写作/排版类 skill 已较饱和，提纲多从多用途仓库映射而来，而**文献检索已补上专精 skill**（lit-search-cite 国内外通吃、cnki-skills 知网深度）——说明上下游仍是值得重点投入的蓝海。

### 五板块的功能差异（为何不能互相替代）

| 维度 | 文献检索 | 提纲助手 | 论文写作 | 论文排版 | 论文评审 |
|---|---|---|---|---|---|
| 输入 → 输出 | 主题/问题 → 文献集+引用库 | 想法 → 结构 | 结构 → 正文 | 内容 → 合规文档 | 文档 → 问题清单 |
| 成功标准 | 查全查准、可复现引用、覆盖 OA | 架构自洽、可展开 | 清晰、正确、流畅 | 通过编译/符合模板 | 找到真实缺陷 |
| 依赖工具 | OpenAlex/CNKI/Zotero/BibTeX | 检索、知识图谱 | 写作、引用、术语 | LaTeX/Typst/Word、编译器、模板 | 评审清单、对照集、批判阅读 |
| Agent 应扮角色 | 检索员+图书管理员 | 规划者（向外发散） | 写作者（向内落成） | 工匠（守规范） | 批判者（对抗挑错） |
| 典型失败模式 | 漏检、编造 DOI、付费墙卡死 | 空泛、无重点 | 跑题、注水 | 编译报错、格式不达标 | 走过场、漏真问题 |

关键：这五个角色在行为上**互相拉扯**。写作要"帮我写得多"，评审要"帮我挑错"，
排版要"严格守规范"——同一时刻让一个 Agent 同时扮演，结果就是四不像的平庸中间态。

### 为什么不直接用通用 Agent 完成所有工作

通用 Agent 能"全都做"，但天花板低、不可复现、缺质量闸。分模块的理由：

1. **角色约束决定产出质量。** 让通用 Agent "写论文"，它会讨好式地全盘兼顾，产出平淡；
   而评审模块强制采用"盲审员/对手"的对抗姿态——这种批判性立场通用 Agent 天然抗拒，正是其价值所在。
2. **领域知识被打包进 skill。** 各模块编码了 IMRaD、PRISMA、GB/T 7714、LaTeX 编译诊断、审稿 rubric 等
   基座模型不会稳定套用的专业规范。模块 = 可复用的封装专长。
3. **上下文经济性。** 每个模块只加载相关 references/prompts；通用 Agent 一次性载入全部，上下文膨胀、变慢、更易出错。
4. **可评估、可调试。** 模块有清晰验收标准（格式能编译？评审列出 N 条问题？）；通用 Agent 只能主观评判"写得好不好"。
5. **可组合成闭环。** 模块间靠共享上下文串联并迭代；单体 Agent 无法干净地"评审→返修→回到提纲"。

**边界：** 一次性、随手的小任务，通用 Agent 足够；本平台的收益在**重复性、规模化、带质量闸**的论文工作流。

## 目录结构

```
opencode-skills/
├── sources/            # 原始仓库克隆（10 个）
├── categories/         # 按场景分类的软链接入口
│   ├── 00_文献检索/       # 最上游：检索/精读/管理/引用（国内外通吃）
│   ├── 01_提纲助手/       # Outline
│   ├── 02_论文写作/      # Writing
│   ├── 03_论文排版/      # Typesetting / Formatting
│   └── 04_论文评审/      # Review
├── activate.sh         # 一键把某个分类链接到 opencode 的 skills 目录
└── README.md
```

## 五个分类下包含什么

### 00_文献检索（Literature Search — 最上游）
文献是横切能力，最重的专职使用在写前提纲，但写作/评审阶段也会按需调用本板。
本板**同时覆盖国内外**：国际源（OpenAlex / Crossref / PubMed / arXiv / Semantic Scholar）走 `lit-search-cite`、
`literature-search-starter`、`academic-researcher`；国内核心（知网/万方/维普）走 `cnki-skills` 系列
（复用浏览器登录态，支持筛选 CSSCI/核心、下载 PDF/CAJ、导出 Zotero + GB/T 7714）。
| 链接名 | 来源 | 作用 |
|---|---|---|
| lit-search-cite | luffysolution-svg/lit-search-cite | 国内外通吃：OpenAlex/CrossRef/arXiv + CNKI(登录态) + 万方；期刊等级/PDF 回退下载 |
| cnki-search | cookjohn/cnki-skills | 知网关键词检索（筛选 CSSCI/北大核心/CSCD） |
| cnki-advanced-search | 同上 | 知网高级检索 |
| cnki-download | 同上 | 下载知网 PDF/CAJ（需浏览器登录态与下载权限） |
| cnki-export | 同上 | 一键导出 Zotero + GB/T 7714 国标引用 |
| cnki-paper-detail | 同上 | 文献详情 / 引文网络 |
| cnki-parse-results | 同上 | 解析检索结果 |
| cnki-journal-toc / cnki-journal-index / cnki-journal-search | 同上 | 期刊目录 / 指数 / 检索 |
| cnki-navigate-pages | 同上 | 知网页面导航 |
| literature-search-starter | Rodneyli/paper-writing-skills | 国际学术 API 检索起步、检索式与来源规划 |
| zotero-cite | 同上 | Zotero 引用库管理与插入 |
| vibe-literature | MercatorProj/vibe-thesis-skills | 读 PDF / 写综述 / 插 `\cite{}` / 生成 BibTeX |
| systematic-review-lite | 同上 | 轻量 PRISMA 系统综述 |
| academic-researcher | SiluPanda/academic-researcher | 文献检索 + IEEE/APA + LaTeX 输出 |
| bib-search-citation | bahayonghang/academic-writing-skills | 文献检索与引用生成 |
| nature-reader | 原归档迁移（本机旧套件） | 论文精读：PDF/DOI/arXiv/HTML/粘贴文本 → 中英对照全文 Markdown、图文对应、溯源锚点 |

### 01_提纲助手（Outline）
文献类 skill 已上移到 `00_文献检索`，本板专注于"把想法变成结构"。
| 链接名 | 来源 | 作用 |
|---|---|---|
| ars-academic-paper | yjdyamv/opencode-academic-research | `outline-only` 模式，一句话生成论文大纲 |
| ars-deep-research | 同上 | 选题/研究规划（7 种模式，含 socratic 引导） |
| research-writing | alfonso0512/research-writing | prompt #21 `outline-gen` 大纲生成模板 |
| vibe-chapter-structure-refactor | MercatorProj/vibe-thesis-skills | 整章结构重构、章节顺序规划 |

### 02_论文写作（Writing）
| 链接名 | 来源 | 作用 |
|---|---|---|
| ars-academic-paper | yjdyamv/opencode-academic-research | `full` / `plan` / `revision` 等 10 种写作模式 |
| ars-academic-pipeline | 同上 | 38-agent 全流程编排（研究→写作→评审→返修） |
| research-writing | alfonso0512/research-writing | 30 个写作 prompt 模板（中英润色/扩写/去 AI 味） |
| vibe-academic-writing | MercatorProj/vibe-thesis-skills | 润色、人味化、术语统一 |
| academic-researcher | SiluPanda/academic-researcher | 文献检索 + IEEE/APA + LaTeX 输出（写中插引） |
| cn-economics-thesis | zehchou/cn-economics-thesis-workflow | 中文实证论文 9 阶段交互式流程 |
| 论文图表 | 原归档迁移（本机旧套件） | matplotlib 数据图：柱状/折线/散点/误差条/箱线图，中文字体 + 学术风 PNG |

> 说明：数据图表（matplotlib 出 PNG）在论文写作/通用会话中按需 `@论文图表` 使用；纯流程图/结构图仍走 `svg-flowchart`。

### 03_论文排版（Typesetting / Formatting）
| 链接名 | 来源 | 作用 |
|---|---|---|
| aws-latex-thesis-zh | bahayonghang/academic-writing-skills | 中文硕博 LaTeX：编译诊断、GB/T 7714、thuthesis/pkuthss |
| aws-typst-paper / aws-latex-paper-en | 同上 | Typst / 英文 LaTeX 论文模板 |
| aws-bib-search-citation | 同上 | 文献检索与引用生成 |
| vibe-latex-compile | MercatorProj/vibe-thesis-skills | XeLaTeX 编译 PDF |
| vibe-formula-normalizer | 同上 | 公式符号一致性 |
| vibe-svg-flowchart / vibe-image-description | 同上 | 学术流程图、图注 |
| ars-academic-paper | yjdyamv/opencode-academic-research | `format-convert` / `citation-check` 模式 |
| academic-researcher | SiluPanda/academic-researcher | IEEE/APA 引用 + BibTeX |
| cn-economics-thesis | zehchou/cn-economics-thesis-workflow | 双路线排版（python-docx / Typst） |
| docx-editor-cn | 原归档迁移（本机旧套件） | Word 文档创建/编辑（docx XML、三线表、公式、修订），面向中文论文版式 |

> 运行提示：`docx-editor-cn` 的 JS 生成依赖 `node + npm（docx 包）`，`.doc` 转换/渲染依赖 LibreOffice（soffice）；
> 纯 XML 编辑（unpack/edit/pack）与 Python 校验脚本仅需 python3。服务器部署前请确认这些运行依赖是否齐备。

### 04_论文评审（Review）
| 链接名 | 来源 | 作用 |
|---|---|---|
| ars-academic-paper-reviewer | yjdyamv/opencode-academic-research | 6 模式：EIC + 3 审稿人 + Devil's Advocate |
| paper-review-skill | guruvamsi-policharla/paper-review-skill | LaTeX 系统性评审，解析 `\input{}`，输出 report.md |
| vibe-thesis-reviewer | MercatorProj/vibe-thesis-skills | 盲审向评审、摘要专项 |
| research-writing | alfonso0512/research-writing | prompt #16 模拟审稿 |

## 如何激活到 OpenCode

OpenCode 会扫描 skills 目录（默认 `~/.config/opencode/skills/`，或项目内 `.opencode/skills/`）下
**包含 `SKILL.md` 的子目录**。两种方式：

**方式 A — 用脚本一键激活某个分类**（推荐）
```bash
# 激活“文献检索”分类到用户级 opencode skills（默认 ~/.config/opencode/skills）
./activate.sh 00

# 激活到指定目录（如当前项目的 .opencode/skills）
./activate.sh 04 /Users/limohan/Documents/coding/opencode-dev/.opencode/skills
```
分类代号：`00` 文献检索 / `01` 提纲助手 / `02` 论文写作 / `03` 论文排版 / `04` 论文评审 / `all` 全部。

**方式 B — 手动软链单个 skill**
```bash
ln -s "$(pwd)/categories/04_论文评审/paper-review-skill" ~/.config/opencode/skills/paper-review
```

激活后重启 OpenCode，即可用 `/paper-review`、`/academic-paper` 等命令（具体命令名见各 skill 的 SKILL.md）。

## 升级

```bash
cd sources/<仓库目录> && git pull
```
链接指向 `sources/`，pull 后内容自动更新，无需动 `categories/`。
