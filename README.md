# 论文助手（Thesis Assistant）

基于 [OpenCode](https://github.com/anomalyco/opencode) 二次开发的论文写作 Web 应用：把「对话式」的 OpenCode 改造成一套**按标准化流程产出论文**的工作台（提纲 → 写作 → 排版 → 评审），支持自定义 Skill、参考资料库、Word/PDF 导出。

- 前端：独立 SolidJS Web 应用（`thesis-web/`）
- 后端：复用 OpenCode Server 的会话、模型调用、工具系统（`backend/`）
- 两个目录是独立的 Bun workspace，共享包在两边各保留一份源码

## 环境要求

- macOS / Linux（Windows 见 [Windows 运行说明](#windows-运行说明)，未完整实测）
- [Bun](https://bun.sh) >= 1.3（唯一运行时，不需要 Node）
- Git

## 快速开始（本地运行）

### 1. 克隆仓库

```bash
git clone <repo-url> opencode-dev
cd opencode-dev
```

### 2. 安装依赖（两个 workspace 分开装）

```bash
cd backend && bun install && cd ..
cd thesis-web && bun install && cd ..
```

> 注意：两个 workspace 依赖独立，**不要**在仓库根目录运行 `bun install`。

### 3. 配置模型提供商（必做，否则无法对话/生成）

后端复用 OpenCode 的 Provider 体系，任选一种方式：

**方式 A：环境变量（推荐，最简单）**

```bash
export OPENAI_API_KEY=sk-xxx        # 或 ANTHROPIC_API_KEY / 其它支持的提供商
```

**方式 B：OpenCode 全局配置文件**

编辑 `~/.config/opencode/opencode.json`（没有就创建），参考：

```json
{
  "provider": {
    "openai": { "options": { "apiKey": "sk-xxx" } }
  }
}
```

> 支持 OpenAI / Anthropic / Google / Mistral / xAI 等 15+ 提供商，配置方式与原版 OpenCode 一致。

### 4. 启动后端（端口 4096）

```bash
cd backend/packages/opencode
bun run --conditions=browser ./src/index.ts serve --port 4096
```

看到 `opencode server listening on http://127.0.0.1:4096` 即成功。

### 5. 启动前端（端口 3000，新开一个终端）

```bash
cd thesis-web/packages/app
bun run dev
```

### 6. 访问

浏览器打开 **http://localhost:3000**

验证流程：

1. 主页能看到论文项目列表（新环境为空）
2. 点击「新建论文」输入标题 → 在 `~/thesis-workspace/<标题>/` 下创建项目
3. 进入「论文工作台」→ 四个步骤（提纲助手 → 辅助写作 → 论文排版 → 论文评审）依次生成
4. 会话页里选择模型（对话框底部），确认能正常对话

### 前后端关系

- **前端 3000**（`thesis-web/packages/app`，Vite dev server）：负责页面渲染与交互，开发时访问 **http://localhost:3000**（带 HMR 热更新）。
- **后端 4096**（`backend/packages/opencode`）：提供全部 API，同时把「非 API 的页面请求」**反向代理**到前端 3000（见 `backend/packages/opencode/src/server/shared/ui.ts` 的 `UI_UPSTREAM`）。本项目没有内置打包好的前端（`opencode-web-ui.gen.ts` 不存在），所以后端**不会**自带界面。
- 因此**开发时必须两个进程都跑**：只跑后端、前端没启动时，访问 `http://localhost:4096` 会返回 **500**（代理找不到 3000），前端页面是打不开的。
- 想少开一个终端、不要 HMR：先 `cd thesis-web/packages/app && bun run build`，再用静态服务占住 3000（二选一）：

  ```bash
  bunx serve dist -l 3000        # 方式一：任意静态服务器
  bun run serve --port 3000      # 方式二：vite preview（同样读 dist）
  ```

  后端代理逻辑不变，依然访问 3000；区别只是 3000 从「开发服务器」变成了「构建产物静态托管」，启动更快、可长期挂着。

## 配置说明

| 配置项 | 说明 | 默认值 |
|---|---|---|
| `VITE_OPENCODE_SERVER_HOST` / `VITE_OPENCODE_SERVER_PORT` | 前端连接的后端地址（启动前端前设置） | `localhost` / `4096` |
| `OPENCODE_SERVER_PASSWORD` / `OPENCODE_SERVER_USERNAME` | 后端 Basic 认证（当前已在代码中注释禁用，访问无需登录） | 不设 / `opencode` |
| 论文工作区路径 | 论文项目的根目录，可在应用「设置」里修改（对应配置 `thesisWorkspace`） | `~/thesis-workspace` |
| Skill 全局目录 | 上传的 skill 存这里，所有论文项目通用 | `~/.config/opencode/skills/<name>/SKILL.md` |
| Agent 全局目录 | 上传 skill 时同步生成的 agent | `~/.config/opencode/agent/<name>.md` |
| PDF 提取 | 上传 PDF 自动提取文本（内置 unpdf 库，**无需**系统安装 pdftotext） | 自动 |

后端地址解析逻辑在 `thesis-web/packages/app/src/entry.tsx` 的 `getCurrentUrl()`。

> **后端认证**：Basic 认证（用户名/密码）当前已在代码中注释禁用，任何请求都直接放行、无需登录。
> 禁用点：`backend/packages/opencode/src/server/routes/instance/httpapi/middleware/authorization.ts`
> 与 `backend/packages/server/src/middleware/authorization.ts`（均带 `[论文助手定制]` 注释）。
> 后续有需要时取消注释即可恢复：设置 `OPENCODE_SERVER_PASSWORD` 后后端会要求 Basic 登录，
> 前端在「设置 → 服务器」里填同样的用户名/密码即可，所有请求会自动带上认证头。

## Windows 运行说明

> 本项目主要在 macOS/Linux 上开发，**Windows 未完整实测**。Bun 1.3 已支持 Windows（PowerShell），理论上可跑通，注意以下几点。

### 安装与启动（PowerShell）

```powershell
# 1. 安装依赖（在仓库根目录）
cd backend; bun install; cd ..
cd thesis-web; bun install; cd ..

# 2. 配置模型（PowerShell 环境变量，只对当前窗口生效）
$env:OPENAI_API_KEY = "sk-xxx"

# 3. 启动后端
cd backend/packages/opencode
bun run --conditions=browser ./src/index.ts serve --port 4096

# 4. 新开一个终端，启动前端
cd thesis-web/packages/app
bun run dev
```

### 已知风险点

1. **PDF 导出依赖 Chrome**：`backend/packages/opencode/src/server/routes/instance/httpapi/thesis-pdf.ts` 探测的是 macOS/Linux 的 Chrome 路径，Windows 上请先设置环境变量指定浏览器（Chrome 或 Edge 均可）：

   ```powershell
   $env:OPENCODE_CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
   # 或 Edge：
   # $env:OPENCODE_CHROME_PATH = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
   ```

2. **原生依赖编译**：`node-pty` 等原生包在 Windows 上可能需要 C++ 编译工具链；若 `bun install` 或启动报错，装 [VS Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（含「使用 C++ 的桌面开发」）后重试，或改用 WSL。
3. **全局配置路径**：opencode 全局配置 / skill 目录在 Windows 上走 XDG 映射（`%LOCALAPPDATA%` / `%APPDATA%` 下），与 `~/.config/opencode/...` 不同，以实际日志输出为准。
4. **论文工作区路径**：默认在 `C:\Users\<用户名>\thesis-workspace`，可在应用「设置」里修改。
5. **更省事的替代**：有 Linux/macOS 环境的话，优先用 WSL，直接照「快速开始」跑。

## 项目结构

```
opencode-dev/
├── backend/                     # 后端 workspace
│   ├── package.json             # Bun workspace 根
│   └── packages/
│       ├── opencode/            # 服务入口：src/index.ts serve（含 thesis 相关路由）
│       ├── server/              # HTTP 服务、路由、鉴权
│       ├── core/                # 核心业务逻辑、数据库 schema、工具
│       ├── llm/                 # LLM 提供商抽象层
│       ├── plugin/              # 插件系统
│       ├── protocol/            # HTTP API 协议定义
│       ├── schema/              # 数据模型 / Effect Schema
│       ├── sdk/                 # SDK 生成（含 js/ 子包）
│       ├── tui/                 # 终端 UI（SolidJS + opentui）
│       └── ...                  # 其他工具包
│
├── thesis-web/                  # 前端 workspace
│   ├── package.json             # Bun workspace 根
│   └── packages/
│       ├── app/                 # ★ 主应用：路由、页面、全局状态
│       │   └── src/
│       │       ├── entry.tsx        # 入口：后端地址配置
│       │       ├── app.tsx          # 路由表 + 全局 Provider
│       │       ├── pages/           # 页面组件
│       │       │   ├── home/        # 论文主页（项目列表、上传资料、Skill 管理入口）
│       │       │   ├── thesis-workbench.tsx  # 论文工作台（四步标准化流程，核心页面）
│       │       │   ├── session/     # 会话页（对话界面）
│       │       │   └── skills.tsx   # Skill 管理页
│       │       ├── components/      # 业务组件（thesis-workflow/ 工作台四步流程等）
│       │       ├── context/         # 全局状态
│       │       └── utils/           # 工具函数
│       ├── session-ui/          # 会话 UI 库（消息列表、输入框）
│       ├── ui/                  # 基础 UI 组件库（button、dialog、icon、theme）
│       ├── client/              # 后端 API 客户端（generated）
│       ├── sdk/                 # SDK 类型定义 + 方法生成（v2）
│       ├── core/                # 前端侧共享工具
│       ├── protocol/            # 协议定义
│       └── schema/              # 数据模型 / Zod 定义
│
├── .opencode/                   # 本仓库自己的 OpenCode 配置（agents、skills、tools）
└── README.md                    # 本文件
```

### 依赖层级

```
schema ─┬─> protocol ──> core ──> server（后端方向）
        └─> client / sdk（只依赖 schema/protocol，不依赖 core/server）

app ──> client、sdk、session-ui、ui、core
```

## 核心功能

### 论文主页（`/`）

- 论文项目列表，按最后编辑时间排序
- 新建论文：输入标题，后端在论文工作区下创建目录
- 上传资料：文件写入项目「资料」目录，PDF 自动提取文本（生成同名 `.txt` 供模型阅读）
- 生成记录：查看该论文下的所有会话

### 论文工作台（四步标准化流程）

- **提纲助手**：输入选题想法/材料 → 生成分章节综述大纲
- **辅助写作**：按提纲与写作设定撰写初稿，支持插图管理（从「资料」引用图片，`asset://` 标记）
- **论文排版**：Markdown 排版 + 一键导出 Word（页眉、页码、字体、缩进等参数可配）和 PDF
- **论文评审**：生成评审报告（评分 + 分项意见 + 修改建议）
- 每步配置面板可多选 Skill、可开启「允许使用工具」（脚本型 Skill 需要）；生成支持边输出边显示

### 会话页（`/session`）

- 与模型的普通对话，可继续修改论文
- 多选 Skill：输入框上方显示已挂载的 `@skill名` 标签，可逐个移除
- Markdown 文件预览：附件可切换源码/渲染视图
- 消息通过 SSE 流式返回

### Skill 管理（`/skills`）

- 上传 Markdown 文件：自动解析 frontmatter 的 `name`/`description`，创建同名 agent
- 支持从本地文件夹导入（须含 `SKILL.md`）
- 安装后的 skill 写入用户级全局目录，所有论文项目通用；支持启用/停用

## 常见问题（FAQ）

| 现象 | 处理 |
|---|---|
| 前端打开空白 | 后端 4096 **和** 前端 3000 都要启动；`curl http://127.0.0.1:4096/` 需在 3000 也在跑时才返回 200 |
| 访问 `http://localhost:4096` 返回 500 | 前端 3000 没启动，后端只是把页面请求代理到 3000；先启动前端，或 build 后用静态服务占住 3000（见「前后端关系」） |
| 弹窗提示输入用户名/密码（401） | Basic 认证已在代码中注释禁用；若仍出现，说明有旧的后端进程还在运行，重启后端即可 |
| 对话报 401 / 无权限 / 免费模型不可用 | 检查第 3 步的模型配置（API key / 环境变量），或在会话页换一个可用模型 |
| 端口被占用 | 换端口启动：后端 `--port 4097`，前端 `VITE_OPENCODE_SERVER_PORT=4097 bun run dev` |
| PDF 提取失败 | 上传的 PDF 需是文本型（扫描件无 OCR）；提取不依赖系统命令 |
| 找不到论文项目目录 | 默认在 `~/thesis-workspace/`，可在应用「设置」里修改 |

## 开发规范

1. **改动留痕**：所有相对原版 OpenCode 的定制改动，在代码处加中文注释 `// [论文助手定制] ...`
2. **依赖安装**：两个 workspace 各自独立安装，不要在根目录 `bun install`
3. **共享包同步**：`core/protocol/schema/sdk/ui` 在 `backend/packages/` 与 `thesis-web/packages/` 各有一份源码，改共享逻辑时**两边要同步**（尤其加 thesis 接口时：后端 `instance.ts` 路由 + 前端 `thesis-web/packages/sdk/js/src/v2/gen/*.gen.ts` 手改或重新生成）
4. **不要直接编辑生成文件**：`thesis-web/packages/client/src/generated*` 由脚本产出
5. **类型检查**：在对应包目录下运行 `bun run typecheck`

## 相关链接

- [OpenCode 原项目](https://github.com/anomalyco/opencode)
- [Bun 文档](https://bun.sh/docs)
- [SolidJS 文档](https://www.solidjs.com/)
