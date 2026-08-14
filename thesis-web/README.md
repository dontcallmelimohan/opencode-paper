# 论文助手（thesis-web）

基于 opencode 二次开发的论文写作 Web 应用（套壳）。本仓库采用 **前后端分离** 的双 workspace 结构：

- `thesis-web/`（本目录）：前端 Web 应用，浏览器直接访问的界面
- `backend/`：后端服务（opencode server），提供 API、模型调用、会话执行

前端技术栈：SolidJS + Vite + Tailwind CSS + TanStack Query + Effect，使用 Bun 管理 monorepo。

---

## 一、项目结构

```
opencode-dev/
├── thesis-web/                  # ★ 前端 workspace（本 README）
│   ├── package.json             # bun workspace 根，管理 packages/* 与 packages/sdk/js
│   └── packages/
│       ├── app/                 # 应用本体：路由、页面、全局状态（改功能主要在这）
│       │   └── src/
│       │       ├── entry.tsx        # 入口：决定连接哪个后端（默认 http://localhost:4096）
│       │       ├── app.tsx          # 路由表 + 全局 Provider 组装
│       │       ├── index.css        # 全局样式
│       │       ├── pages/           # 页面
│       │       │   ├── home/        # 论文主页（项目列表、上传资料、生成记录、Skill 管理入口）
│       │       │   ├── thesis-workbench.tsx  # 论文工作台（四步标准化流程，核心页面）
│       │       │   ├── session/     # 会话页（对话界面）
│       │       │   ├── new-session/ # 新建会话（draft）
│       │       │   └── skills.tsx   # Skill 管理独立页
│       │       ├── components/      # 组件
│       │       │   ├── thesis-workflow/  # 论文工作台组件（四步流程、知识库、生成器）
│       │       │   └── session/          # 会话组件（原写作模式侧边栏/配置面板已删除）
│       │       ├── context/         # 全局状态（server、sync、settings、tabs、sdk 等）
│       │       └── utils/           # 工具函数
│       ├── session-ui/          # 会话 UI 库：消息列表、输入框（PromptInputV2 等）
│       ├── ui/                  # 基础 UI 组件库：button、dialog、icon、theme（亮暗模式）
│       ├── client/              # 后端 API 客户端（generated，类型安全的请求封装）
│       ├── sdk/                 # SDK：类型定义 + 方法生成（v2）
│       ├── core/                # 前端侧共享工具
│       ├── protocol/            # 协议定义
│       └── schema/              # 数据模型 / Zod 定义
│
└── backend/                     # 后端 workspace（一般不动）
    └── packages/
        ├── opencode/            # 服务入口：src/index.ts serve
        ├── server/              # HTTP 服务、路由、鉴权
        ├── cli/                 # CLI 命令（serve/web 等）
        ├── core/  llm/  plugin/  tui/  ui/
        ├── protocol/  schema/  sdk/
        └── ...
```

### 依赖层级（前端）

```
schema ─┬─> protocol ──> core ──> server（后端方向）
        └─> client / sdk（只依赖 schema/protocol，不依赖 core/server）

app ──依赖──> client、sdk、session-ui、ui、core
```

- `app` 是唯一直接面向用户的包，页面和组件都从这里发起 API 调用
- `session-ui` 提供对话框组件（消息流、输入框、技能选择菜单），`app` 负责数据与状态
- `ui` 是纯展示组件库，不依赖任何业务逻辑
- 前端两个 workspace 的依赖完全分开安装：`thesis-web/node_modules` 与 `backend/node_modules` 互不相通

---

## 二、启动方式

需要开两个终端，**先启动后端，再启动前端**。

### 1. 启动后端（端口 4096）

```bash
cd backend/packages/opencode
bun run --conditions=browser ./src/index.ts serve --port 4096
```

后端监听 `http://localhost:4096`，提供：

- `/api/...`：全部业务 API（会话、模型、skill、论文等）
- `/openapi.json`：OpenAPI 文档
- `/`：非 API 请求会被**代理到本地前端** `http://localhost:3000`（见 `backend/packages/opencode/src/server/shared/ui.ts` 的 `UI_UPSTREAM`）

### 2. 启动前端（端口 3000）

```bash
cd thesis-web/packages/app
bun run dev        # vite dev server
```

浏览器访问 **http://localhost:3000**（推荐，热更新）。

前端默认连接 `http://localhost:4096` 的后端，可通过环境变量覆盖：

```bash
VITE_OPENCODE_SERVER_HOST=localhost VITE_OPENCODE_SERVER_PORT=4096 bun run dev
```

后端地址解析逻辑在 `thesis-web/packages/app/src/entry.tsx` 的 `getCurrentUrl()`。

> 直接访问 `http://localhost:4096` 也可以看到界面（后端把页面代理到 3000），但开发时请用 3000，避免代理缓存和 CORS 干扰。

---

## 三、已实现功能与实现原理

### 1. 论文主页（`/`，`pages/home/thesis-home.tsx`）

功能：

- 论文项目列表（卡片展示标题、更新时间），按更新时间排序
- 「新建论文」：输入标题 → 后端在 `thesis-workspace/<标题>/` 下创建目录并注册为项目
- 「上传资料」：把文件写入论文目录的 `资料/` 子目录；**PDF 上传后自动提取文本**，生成同名 `.txt`
- 「生成记录」：查看该论文下的所有会话（各步生成的聊天记录）
- 「开始写作」/点击卡片：进入该论文的「论文工作台」（四步标准化流程，见下）
- 右上角入口：Skill 管理、设置、亮暗模式切换

实现原理：

- 新建论文：前端调 `client.instance.thesisCreate({ title })` → 后端 `backend/packages/opencode/src/server/routes/instance/httpapi/handlers/instance.ts` 的 `createThesis`：在 `thesisWorkspace` 配置目录（默认 `~/thesis-workspace`，可用 `~` 相对路径）下建目录、初始化 git、注册为 opencode 项目并命名
- PDF 提取：上传后前端调 `client.instance.thesisPdfText` → 后端用 `unpdf` 库解析 PDF，把全文写入 `资料/<同名>.txt`，会话中可直接引用文本
- 论文工作区路径可自定义：设置里的 `thesisWorkspace` 配置项，读取逻辑见 `thesis-home.tsx` 的 `theses` 查询

### 2. 论文工作台（`/:dir/workbench`，`pages/thesis-workbench.tsx`）

> 核心页面：论文生产以「四步标准化流程」为主体，不再以聊天为主导；对话只作为生成记录。

功能：

- 左侧四步流程面板：**提纲助手 → 辅助写作 → 论文排版 → 论文评审**（`components/thesis-workflow/thesis-step-sidebar.tsx`），竖向排列在左侧，点击切换，每步显示状态（未开始/生成中/已完成）
- 每步页面 = 左侧输入表单 + 右侧产物面板（`components/thesis-workflow/thesis-workflow-ui.tsx` 的 `StepLayout`）；产物用 Markdown 渲染（`Markdown` 组件）
- **Step 1 提纲助手**（`step-outline.tsx`）：填写综述需求、方向侧重、生成选项；**知识库面板**（`thesis-knowledge-panel.tsx`）支持手写知识条目（文件夹分类、搜索、新建/编辑/删除）与「资料」目录文件，勾选后一起打包进提示词
- **Step 2 辅助写作**（`step-writing.tsx`）：基于提纲 + 期刊/风格/侧重/参考文献格式/长度等设定生成章节草稿，多次生成自动累积成全文稿
- **Step 3 论文排版**（`step-formatting.tsx`）：以全文稿为源，按期刊/模板、参考文献格式、标题层级整理最终稿
- **Step 4 论文评审**（`step-review.tsx`）：以排版稿（优先）为评审对象，输出评审报告；报告若含 ```` ```json ```` 结构化块则渲染为「评分环 + 分项指标 + 意见 + 建议」（`thesis-review-report.tsx`），否则回退 Markdown

实现原理：

- 每篇论文一份工作流状态（`thesis-workflow-store.ts`），存 localStorage（key 按论文工作区路径隔离）：`activeStep`、各步输入/状态/产物、专属生成会话 id
- 每篇论文复用**一个专属会话**（`sessionID` 存工作流状态）：提纲/写作/排版/评审都在同一上下文里，模型能记住前面的产出
- 生成调用（`thesis-generator.ts`）：把当前步的表单配置打包成提示词 → 创建/复用会话 → `session.prompt` 发送 → 轮询同步 store 等待 assistant 回复 → 文本保存为该步产物
- 知识库条目（`thesis-knowledge-store.ts`）同样按论文隔离存 localStorage；资料文件仍从论文目录 `资料/` 读取
- 主页卡片点击 / 「开始写作」→ `startWriting` 导航到 `/:dir/workbench`（`thesis-home.tsx`）

### 3. 会话页（`/session`，`pages/session/`）

> 论文工作台上线后，会话页回归 opencode 原生对话界面：**原来加在聊天里的写作模式侧边栏与配置面板已删除**（`components/session/agent-sidebar.tsx`、`thesis-mode-config-panel.tsx`、`thesis-mode-skills.ts`、`writing-mode.tsx` 等已移除）。四个写作模式的配置与流程全部在「论文工作台」里完成，会话只作为每篇论文的生成记录 / 辅助查看。

功能：

- 会话内可多选 Skill：输入框上方显示已挂载的 `@skill名` 标签，可点 × 移除（`session-ui/src/v2/components/prompt-input/index.tsx` 的 `PromptInputV2SkillsMenu`）；Skill 由主页管理
- Markdown 文件预览：会话附件可切换「源码 / 渲染」视图（`pages/session/markdown-file-preview.tsx`）

实现原理：

- 选中 skill 后以 `PromptInputV2AgentPart` 形式附加到用户消息，随 prompt 发给后端，后端会注入对应 agent 的任务指令（多选 skill 可同时挂载）
- 消息通过 SSE 流式返回，由 `session-ui` 渲染

### 4. Skill 管理页（`/skills`，`pages/skills.tsx`）

功能：

- 上传 markdown 文件 → 自动解析 frontmatter 里的 `name`/`description`（没有则用文件名），创建同名 agent
- 支持从本地文件夹导入（文件夹须包含 `SKILL.md`）
- 安装后的 skill 列表、启用/停用

入口位置：论文主页右上角「Skill 管理」按钮 → 跳转到独立页面 `/skills`（点击卡片设为当前使用的 Agent，全局生效）。

实现原理（前后端配合）：

- 前端调 `client.instance.skillInstall({ name, description, content, prompt })`
- 后端 `instance.ts` 的 `installSkill` 写两个文件到**用户级全局目录**（所有项目通用）：
  - `~/.config/opencode/skills/<name>/SKILL.md`
  - `~/.config/opencode/agent/<name>.md`
- 写入后调用 `finalizeSkillInstall` 刷新 config / agent / skill 缓存，立即生效
- 因此上传一个 skill 后，任何论文项目都能在输入框里选择它

### 5. 全局能力

- 主题：`@opencode-ai/ui/theme`，亮/暗模式持久化
- 国际化：`app/src/i18n`，内置多语言
- 命令面板、设置对话框（模型、服务器连接等）沿用 opencode 能力

---

## 四、前后端请求链路

```
浏览器
 ├─ http://localhost:3000  （vite dev server，前端页面 + HMR）
 └─ API 调用 ──> http://localhost:4096/api/...   （后端）

直接访问 4096 时：
  GET /  ──> 后端把非 API 请求代理到 3000 前端（ui.ts 的 UI_UPSTREAM）
```

- 前端所有 API 调用统一走 `@opencode-ai/client`（generated client），baseUrl 由 `entry.tsx` 的 `getCurrentUrl()` 决定
- 会话消息、事件推送使用 SSE；轮询类数据走 TanStack Query 缓存
- 修改后端协议后需在 `packages/client` 重新生成（`bun run generate`），日常只改前端时无需处理

---

## 五、开发约定

1. **改动留痕**：本项目所有定制改动（相对原版 opencode 的修改）都要在改动处的代码里加中文注释标注，格式建议 `// [论文助手定制] ...`，方便以后 diff、迁移和回滚
2. 只改 `thesis-web` 前端；动 `backend` 前先确认
3. 两个 workspace 依赖分开安装，不要在 `opencode-dev/` 根目录统一 `bun install`
4. 类型检查（在对应包目录下执行）：
   ```bash
   cd thesis-web/packages/app && bun run typecheck
   ```
5. 前后端各保留了一份共享包（core/protocol/schema/sdk 等）的源码，改共享逻辑时注意两边是否要同步
6. 不要直接编辑 `packages/client/src/generated*`（由生成脚本产出）
