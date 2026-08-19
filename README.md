# 论文助手（Thesis Assistant）

基于 [OpenCode](https://github.com/anomalyco/opencode) 二次开发的论文写作 Web 应用。采用**前后端分离**的双 workspace 结构，前端为独立的 SolidJS Web 应用，后端复用 OpenCode Server 的会话、模型调用、工具系统。

## 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Bun 1.3+ |
| 后端 | TypeScript + Effect v4 + Hono + Drizzle ORM (SQLite) |
| 前端 | SolidJS + Vite + Tailwind CSS + TanStack Query |
| LLM | Vercel AI SDK，支持 OpenAI / Anthropic / Google / Mistral / xAI 等 15+ 提供商 |
| 包管理 | Bun Workspaces（前后端各自独立安装依赖） |

## 项目结构

```
opencode-dev/
├── backend/                     # 后端 workspace
│   ├── package.json             # Bun workspace 根
│   └── packages/
│       ├── opencode/            # 服务入口：src/index.ts serve
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
│       │       │   ├── home/        # 论文主页（项目列表、上传资料）
│       │       │   ├── session/     # 会话页（对话界面）
│       │       │   └── skills.tsx   # Skill 管理页
│       │       ├── components/      # 业务组件
│       │       ├── context/         # 全局状态
│       │       └── utils/           # 工具函数
│       ├── session-ui/          # 会话 UI 库（消息列表、输入框）
│       ├── ui/                  # 基础 UI 组件库（button、dialog、theme）
│       ├── client/              # 后端 API 客户端（自动生成）
│       ├── sdk/                 # SDK 类型定义 + 方法生成
│       ├── core/                # 前端共享工具函数
│       ├── protocol/            # 协议定义
│       └── schema/              # 数据模型 / Zod 定义
│
├── .opencode/                   # OpenCode 配置（agents、skills、tools）
├── AGENTS.md                    # 开发规范与代码风格
├── CONTRIBUTING.md              # 贡献指南
└── README.md                    # 本文件
```

### 依赖层级

```
schema ─┬─> protocol ──> core ──> server（后端方向）
        └─> client / sdk（只依赖 schema/protocol，不依赖 core/server）

app ──> client、sdk、session-ui、ui、core
```

## 快速开始

**前置条件**：安装 [Bun](https://bun.sh) >= 1.3

### 1. 克隆仓库

```bash
git clone <repo-url> opencode-dev
cd opencode-dev
```

### 2. 安装依赖

```bash
# 后端
cd backend && bun install && cd ..

# 前端
cd thesis-web && bun install && cd ..
```

> 注意：两个 workspace 的依赖是独立安装的，**不要**在根目录运行 `bun install`。

### 3. 启动后端（端口 4096）

```bash
cd backend/packages/opencode
bun run --conditions=browser ./src/index.ts serve --port 4096
```

### 4. 启动前端（端口 3000）

新开一个终端：

```bash
cd thesis-web/packages/app
bun run dev
```

### 5. 访问

浏览器打开 **http://localhost:3000**

> 也可以直接访问 `http://localhost:4096`，后端会代理前端页面，但开发时推荐用 3000 端口（支持 HMR 热更新）。

### 环境变量

前端默认连接 `http://localhost:4096`，可通过环境变量覆盖：

```bash
VITE_OPENCODE_SERVER_HOST=localhost VITE_OPENCODE_SERVER_PORT=4096 bun run dev
```

后端地址解析逻辑在 `thesis-web/packages/app/src/entry.tsx` 的 `getCurrentUrl()`。

## 核心功能

### 论文主页（`/`）

- 论文项目列表，按更新时间排序
- 新建论文：输入标题，后端在 `thesis-workspace/<标题>/` 下创建目录
- 上传资料：文件写入论文目录的 `资料/` 子目录，PDF 自动提取文本
- 对话列表：查看该论文下的所有会话

### 会话页（`/session`）

- 左侧栏四步写作模式：**提纲助手 → 辅助写作 → 论文排版 → 论文评审**
- 多选 Skill：输入框上方显示已挂载的 `@skill名` 标签
- Markdown 文件预览：附件可切换源码/渲染视图
- 消息通过 SSE 流式返回

### Skill 管理（`/skills`）

- 上传 Markdown 文件自动解析 frontmatter，创建同名 agent
- 安装后的 skill 全局可用，所有论文项目均可使用
- 支持启用/停用

## 请求架构

```
浏览器
 ├─ http://localhost:3000  （Vite dev server，前端页面 + HMR）
 └─ API 调用 ──> http://localhost:4096/api/...   （后端 API）

直接访问 4096 时：
  GET / ──> 后端把非 API 请求代理到 3000 前端
```

- 前端 API 调用统一走 `@opencode-ai/client`（自动生成的类型安全客户端）
- 会话消息和事件推送使用 SSE；轮询类数据走 TanStack Query 缓存
- 修改后端协议后需在 `packages/client` 重新生成（`bun run generate`）

## 开发规范

1. **改动留痕**：所有相对原版 OpenCode 的定制改动，在代码处加中文注释 `// [论文助手定制] ...`
2. **不要在根目录安装依赖**：两个 workspace 各自独立安装
3. **不要直接编辑生成文件**：`packages/client/src/generated*` 由脚本生成
4. **类型检查**：在对应包目录下运行 `bun run typecheck`
5. **共享包同步**：前后端各保留了 core/protocol/schema/sdk 等共享包源码，修改时注意两边同步

## 相关链接

- [OpenCode 原项目](https://github.com/anomalyco/opencode)
- [Bun 文档](https://bun.sh/docs)
- [SolidJS 文档](https://www.solidjs.com/)
