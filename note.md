实测结果如下：

  1) matplotlib 本地没装

  - python3 是有的（Homebrew 3.14，pip 26.1.2 也可用），但 import matplotlib 报 ModuleNotFoundError。也就是说现在画不了 matplotlib 数据
    图。


  2) 能不能通过 skill 画图表——分两种

  - 流程图/结构图（SVG）：svg-flowchart 不依赖 matplotlib，模型直接输出 SVG 代码，现在就能用。它自带的转 PDF 脚本需要 cairosvg 或
  - 数据图表（折线/柱状/散点，matplotlib 出 PNG）：当前激活的 35 个 skill 里没有轻量的专门图表 skill。只有重型 academic-paper（ars 流水
    线）的 visualization_agent 提到会写 matplotlib/seaborn 代码，不适合当画图工具。旧归档里有 论文图表（~/.config/opencode/skills.bak-
    20260907/论文图表），是之前的旧测试技能、未接入。

  - 结论：装好 matplotlib + numpy 后，最顺的方式是通用/写作会话里让模型直接写 Python 出 PNG 存到文件空间（asset:// 引用），不需要额外
    skill。中文标签注意给 matplotlib 注册系统中文字体（系统有 STHeiti 等可用）。

  3) “没有对应工具”的 skill 清单

  - 缺 chrome-devtools MCP（Chrome 有但 MCP 没配）→ cnki- 共 10 个全部不可用*：cnki-search / advanced-search / paper-detail / parse-
    results / export / download / journal-search / journal-index / journal-toc / navigate-pages。

  - 缺 Zotero 本体/API → zotero-cite、vibe-literature、cnki-export（Zotero 路径）；bib-search-citation 的 Zotero 模式不可用，但它直接读本
    地 .bib 的模式可用（uv 已装）。

  - 缺 Typst 二进制 → typst-paper 只能出源码不能编译；latex-paper-en/latex-thesis-zh/cn-economics-thesis 里提到的 Typst 只是可选转换。
  - 依赖 xelatex（未装）→ vibe-latex-compile、latex-thesis-zh 的默认路径；tectonic 是 XeTeX 引擎，多数模板能替代，个别依赖本地字体/
    TeXLive 文件的模板需要真 xelatex 或 Overleaf。

  - 缺 matplotlib → 数据图表能力未就绪（如上）。
  - 依赖联网（有 python3/工具，但你现在网络不稳）→ lit-search-cite、literature-search-starter、deep-research、academic-paper、academic-
    researcher、academic-pipeline、academic-paper-reviewer：可跑但检索/子代理/WebFetch 会受限。

  - 纯文本/提示词型，无需额外工具、现在就能用：research-writing、chapter-structure-refactor、systematic-review-lite、formula-normalizer、
    image-description、svg-flowchart（SVG 本体）、paper-review-skill、thesis-reviewer、academic-writing（检测脚本可选，python3 已有）。

  建议的最小补齐

  - python3 -m pip install matplotlib numpy → 解锁数据图表
  - brew install typst → 解锁 typst-paper
  - 配 chrome-devtools MCP → 解锁 cnki-*（仍要人工过验证码）
  - 装 Zotero → 解锁引用管理类

  要我现在把 matplotlib + numpy（和可选的 cairosvg、typst）装上吗？装哪个告诉我即可。


   结论

  - 需要打包，但方案不是非 Docker 不可。就你目前的部署形态（一台固定 VPS + rsync 源码 + 主机直装），最优解是先把「运行时依赖安装」收敛成
    一条幂等命令，Docker 留到你确需「换机/多台/给他人复现」时再上。

  - Docker 能解决的只是「依赖安装一致性」，解决不了「GUI 类工具在无头服务器上本来就不能用」的问题（知网验证码、Zotero、Excel 实时控制
    等），这两类依赖得分开放。

  现状（已核对仓库）

  - 代码打包已存在：scripts/deploy-thesis-web.sh 负责 vite build + rsync 到 root@8.130.129.149:/root/opencode-paper + 远端 bun install 和
    重启，代码这层不需要再打包。

  - 系统依赖已有一个雏形：scripts/setup-server.sh 已是幂等脚本，装了 python3/pip/matplotlib/numpy/fonts-noto-cjk（对应你后端 agent 提示词
    里写死的「已预装」），但目前只覆盖绘图；tectonic/typst/pandoc/headless Chrome 等还没纳入。

  - 隐藏的大头不是系统工具，而是 /root/.config/opencode（agent/*.md、skills/、opencode.json 里的 MCP 与 API key）——它不在 git 仓库里，
    rsync 不携带，thesis-agents.ts:178 只会把 5 个固定角色覆盖写进去，其余 skill 要靠 web UI 或手动同步，换机时这才是「一个一个弄」的主要
    来源。

  - backend/packages/opencode/Dockerfile 是上游「opencode CLI 单二进制」镜像，不是论文助手整套服务，不能直接当部署镜像用。

  为什么先别急着 Docker

  - 无头服务器的硬限制：Chrome 人工过知网验证码、Zotero 桌面、Excel 实时控制这些，打包装了也跑不了；能上服务器的只有纯 CLI/无头依赖。
  - 必须挂 volume 的东西不少：论文工作区目录、sqlite、~/.config/opencode。容器化后这些不挂载就会「换容器即丢」，设计成本比现在的 rsync
    高。

  - 更新成本反转：现在改一行代码 rsync 秒级生效；全容器化后每次改动要重建/推几百 MB 镜像，或者又退回「rsync 进运行中容器」，反而两头不讨
    好。

  - 你的本地开发仍跑原生 macOS bun dev（Tectonic、Chrome 都是 brew 装的），Docker 只服务服务器，等于长期维护两套环境定义。

  建议路线

  - 短期（成本最低，可今天做）：扩写 scripts/setup-server.sh 为全量清单——python3/pip + matplotlib/numpy + Noto CJK + tectonic + typst +
    pandoc + chromium(no-sandbox)，全部幂等；再让 deploy 脚本顺带同步 /root/.config/opencode 的 skills 与配置（或首次部署后执行一次
    rsync）。新机器上线收敛为两条命令：setup-server.sh → deploy-thesis-web.sh。

  - 中期（当出现「重装/换机/多机复现」需求时）：把 setup-server.sh 的安装内容 1:1 搬进 debian-slim Dockerfile + docker-compose，volume 挂
    工作区、数据、config，deploy 改为「ssh 上服务器 build 或推 registry」。那时 Dockerfile 的内容基本就是现在 setup-server.sh 的镜像版，
    过渡平滑，不是推倒重来。

  要我先把短期方案落地吗？具体是：扩展 scripts/setup-server.sh 的全量依赖清单（幂等、可重复执行），并在 deploy-thesis-web.sh 里加一步把本
  地 ~/.config/opencode/skills 与相关配置同步到服务器的对应目录，这样换机后跑两遍脚本就能完整还原环境。

  核对完成。结论分两部分给你。

  先回答“skill 能不能正常用”：35 个 skill 文件全部无断链、都指向有效源码，所以“skill 本身”都正常；“能不能用”的差别在外部依赖。按今天的实
  测，大约 10 个现在就能用，绘图能力刚解锁，其余要么缺编译工具、要么缺 MCP/Zotero/稳定网络，还没就绪。清单如下。

  本机已装（2026-09-08 实测）

  - Python：python3 3.14.6（Homebrew）+ pip 26.1.2
  - 绘图：matplotlib 3.11.1 + numpy 2.5.3（今天补装，用户级 ~/Library/Python/3.14/...，默认 python3 直接能 import；command -v 显示
    MISSING 是正常的，它们是模块不是命令）

  - LaTeX：tectonic（brew，XeTeX 系引擎）
  - 其他：uv、bun、node v24.18.0、sshpass、Chrome.app、VS Code；brew 里已有 cairo（将来装 cairosvg 的 C 依赖已就绪）
  - 服务器（8.130.129.149）是另一套，由 setup-server.sh 管，我没 SSH 实测，别把本机清单当服务器状态

  本机还没装（影响面）

  - typst → aws-typst-paper 只能出源码
  - pandoc → md→docx/PDF 转换流程会退回手工
  - xelatex/latexmk → vibe-latex-compile 不可用，aws-latex-* 默认编译链不可用
  - cairosvg → svg-flowchart 自带的 SVG→PDF 脚本不可用（本体不受影响）
  - chrome-devtools MCP → cnki-* 全挂（Chrome.app 在，但 MCP 没配）
  - Zotero → zotero-cite / vibe-literature / bib-search-citation(Zotero 模式) 挂

  Skill 现状分组

  - 【现在就能用】纯提示词型：research-writing、systematic-review-lite、vibe-chapter-structure-refactor、vibe-formula-normalizer、vibe-
    image-description、vibe-academic-writing、vibe-thesis-reviewer、paper-review-skill、vibe-svg-flowchart（SVG 本体）、bib-search-
    citation（本地 .bib 模式，uv 已装）

  - 【刚解锁】数据图表：matplotlib+numpy 装好后，通用会话里让模型直接写 Python 出 PNG 即可，不需要专门 skill，中文标签用 Heiti SC/
    PingFang SC

  - 【部分可用】latex-paper-pipeline（文档点名 Tectonic，本机有，可用）；aws-latex-paper-en / aws-latex-thesis-zh / cn-economics-
    thesis（默认要 latexmk/xelatex，可改走 tectonic 或 Overleaf，个别本地字体模板不行）；aws-typst-paper（无 typst，只能出 .typ 源码）

  - 【受限】依赖联网/检索：literature-search-starter（要 API key）、academic-researcher、ars-deep-research、ars-academic-paper、ars-
    academic-pipeline、ars-academic-paper-reviewer、lit-search-cite（还需 ai4scholar/scansci/chrome-devtools MCP，目前未配）

  - 【当前不可用】cnki-* 共 10 个（advanced-search / download / export / journal-index / journal-search / journal-toc / navigate-pages /
    paper-detail / parse-results / search，全依赖 chrome-devtools MCP，且要人工过验证码）；zotero-cite、vibe-literature、cnki-export 的
    Zotero 路径（缺 Zotero）

  给你的一句话判断
  如果日常是“提纲/写作/评审 + LaTeX(tectonic) + 数据图表”，今天这个状态够用了，不用补装；等真要碰知网/Zotero/Typst 时再按上面缺失项逐个补
  即可，先不换机就不用现在做 setup-server.sh 扩写。

  要不要我把这份基线存进 note.md（标个“2026-09-08 环境基线”），以后对照、升级都有据可查？

  查完了。结论分三块说：

  ① @ 出不出来：出得来 ✅

  - 排版板块的 @ 菜单和后端 agent 权限白名单固定为 6 个技能：latex-paper-en、latex-thesis-zh、typst-paper、latex-compile、latex-paper-
    pipeline、docx-editor-cn（前后端两处白名单一致：thesis-agents.ts ↔ thesis-session-view.tsx）。

  - 我 SSH 到服务器核过了，这 6 个在技能目录里都真实存在，所以 @ 菜单会显示，且挂了中文名（如“Word 文档编辑（中文版式）”“LaTeX 排版流水
    线”）。

  ② 对得上吗：一半能用，一半名不副实（关键在服务器工具链）

  - Word 路径：docx-editor-cn 对应。但注意工作台的 Word 导出/套模板其实是内置引擎在干，skill 只在“要模型直接产出/改 .docx”时才有用；而它的生
    成脚本要 node + docx npm——服务器没装 node/npm（只有 bun），现成命令会跑不起来。

  - LaTeX 路径：只有 latex-paper-pipeline 是 tectonic 优先的（服务器已装 tectonic，能用）。latex-paper-en、latex-thesis-zh、latex-compile 都
    是按“TeX Live + xelatex”写的，服务器没有 xelatex，读模板/排源码可以，真编译会失败。

  - Typst 路径：typst-paper 配服务器已装的 typst 二进制，能用。

  ③ 够用吗：核心够，LaTeX 整套编译是短板

  - Word（无模板参数化 + 有模板套用）和打印式 PDF 是工作台内置能力，不依赖 skill，稳。


• 选 A：先摸清 docx-editor-cn 的结构和脚本写法，决定是装 Node 还是改成 bun 兼容、依赖怎么放才稳。

 A 项已完成并验证 ✅

  做了什么

  - docx-editor-cn/SKILL.md 顶部新增「运行环境（本平台必读）」：说明服务器无 node/npm、用 bun；依赖预装在技能目录 node_modules；给出固定执行
    姿势（export NODE_PATH=技能目录/node_modules + bun "$SKILL_DIR/scripts/xxx.js"），并把 Quick Reference、Dependencies、Workflow 里的
    node/npm install 命令统一替换为 bun 写法。

  - thesis-agents.ts 里论文排版 agent 的提示从“依赖 node+docx npm，缺失需说明”改为“服务器用 bun，依赖已预装，按 SKILL.md 运行环境执行”。

  服务器侧

  - 完整部署一遍（仓库同步 + 后端重启，新 agent 文案已生效）。
  - 运行时技能目录 /root/opencode-skills/sources/docx-editor-cn 已同步并执行 bun install（docx/temml/fast-xml-parser 共 32 个包安装成功）。
  - 冒烟测试通过：require('docx'/'temml'/'fast-xml-parser') 全部解析成功，scripts/new_doc.js 真实生成出合法 .docx（文件头 PK）。

  仍受限（可选下一步）

  - 服务器没有 LibreOffice/Poppler：.doc→.docx、docx→PDF 转换命令仍会失败（技能里已注明要先向用户说明）；核心的 md→生成 .docx 已可用。
  - 提醒：以后若有人用 --delete 重新 rsync opencode-skills 整目录，远端 node_modules 会被清掉，需要再 bun install 一次。

  需要我把 LibreOffice/Poppler 也装上补齐转换能力，还是先到这？