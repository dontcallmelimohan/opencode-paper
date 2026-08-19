// [论文助手定制] 论文工作台页面（核心页面）。
// 论文生产不再以“和模型对话”为主体，而是以“四步标准化流程”为主体：
//   提纲助手 → 辅助写作 → 论文排版 → 论文评审
// 每步：左侧输入表单 + 右侧产物（Markdown），「生成」按钮调用模型并保存产物；
// 产物与设置按论文项目持久化（localStorage），生成记录落在该项目专属会话里。
// [论文助手定制] 可拖拽布局：左侧侧边栏宽度可用分割手柄拖拽调整（180~360px），
// 右侧「表单 | 产物」的宽度分割在 thesis-workflow-ui.tsx 的 StepLayout 里同样可拖拽。
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useNavigate } from "@solidjs/router"
import { createMemo, createSignal, onMount, Show } from "solid-js"
import { IconButton } from "@opencode-ai/ui/icon-button"
import type { Project } from "@opencode-ai/sdk/v2/client"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { StepFormatting } from "@/components/thesis-workflow/step-formatting"
import { StepOutline } from "@/components/thesis-workflow/step-outline"
import { StepReview } from "@/components/thesis-workflow/step-review"
import { StepWriting } from "@/components/thesis-workflow/step-writing"
import { ThesisKnowledgeProvider } from "@/components/thesis-workflow/thesis-knowledge-store"
import { useThesisManuscriptFile } from "@/components/thesis-workflow/thesis-manuscript-file"
import { useThesisProject } from "@/components/thesis-workflow/thesis-export"
import { usePersistentWidth } from "@/components/thesis-workflow/thesis-panel-layout"
import { ThesisStepSidebar } from "@/components/thesis-workflow/thesis-step-sidebar"
import { ThesisWorkflowProvider, useThesisWorkflow } from "@/components/thesis-workflow/thesis-workflow-store"
import { useLayout } from "@/context/layout"
import { useSDK } from "@/context/sdk"
import { getFilename } from "@opencode-ai/core/util/path"
import { ThesisUploadDialog, thesisName } from "./home/thesis-home"

export default function ThesisWorkbenchPage() {
  const sdk = useSDK()
  const directory = () => sdk().directory
  return (
    // [论文助手定制] 每篇论文一份工作流状态 + 知识库（都按工作区路径隔离）。
    <ThesisWorkflowProvider directory={directory()}>
      <ThesisKnowledgeProvider directory={directory()}>
        <ThesisWorkbenchInner />
      </ThesisKnowledgeProvider>
    </ThesisWorkflowProvider>
  )
}

function ThesisWorkbenchInner() {
  const sdk = useSDK()
  const navigate = useNavigate()
  const layout = useLayout()
  const dialog = useDialog()
  const { state } = useThesisWorkflow()
  // [论文助手定制] 文稿文件化迁移：打开工作台时把已有 result 落盘为 正文/<step>.md（幂等覆盖写）。
  const manuscript = useThesisManuscriptFile(sdk().directory)
  // [论文助手定制] 可拖拽布局：左侧侧边栏宽度（默认 220，可拖到 180~360，localStorage 记住）。
  const sidebarWidth = usePersistentWidth("thesis-workbench.sidebarWidth", 220)

  onMount(() => {
    const steps = state().steps
    const tasks: Promise<void>[] = []
    for (const step of ["outline", "writing", "formatting", "review"] as const) {
      const result = steps[step].result
      if (result) tasks.push(manuscript.save(step, result))
    }
    if (tasks.length > 0) void Promise.all(tasks)
  })

  // [论文助手定制] 侧边栏收起状态（localStorage 记住）。
  const [collapsed, setCollapsed] = createSignal(localStorage.getItem("thesis-workbench.sidebarCollapsed") === "1")
  const toggleCollapsed = (next: boolean) => {
    setCollapsed(next)
    localStorage.setItem("thesis-workbench.sidebarCollapsed", next ? "1" : "0")
  }

  const project = createMemo(() =>
    layout.projects.list().find((item) => item.worktree === sdk().directory),
  )
  // [论文助手定制] 解析当前论文项目（layout 优先，服务端兜底），供资料上传弹窗使用。
  const resolveProject = useThesisProject()
  // [论文助手定制] layout 里的项目是 Partial 类型，这里按 SDK Project 使用（工作台里的论文一定来自服务端，有 id）。
  const title = createMemo(() =>
    project() ? thesisName(project() as unknown as Project) : getFilename(sdk().directory),
  )

  return (
    // [论文助手定制] 外层容器与主页卡片一致（self-stretch 撑满主区域宽度、圆角卡片浮在深色底上），
    // 顶部栏已删除（主页/标题/资料/生成记录集中到左侧边栏），布局为：侧边栏 + 当前步骤内容。
    <div class="m-2 min-h-0 flex-1 self-stretch overflow-hidden rounded-[10px] bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]">
      <div class="flex size-full min-h-0 min-w-0 gap-2 overflow-hidden p-2">
        {/* [论文助手定制] 左侧侧边栏：四步切换 + 顶部（主页/标题）+ 底部工具（资料/生成记录）。
            外层容器控制宽度（可拖拽，min(宽度, 100%) 保证窄屏不溢出），右侧挂 ResizeHandle 分割手柄。
            可收起：拖拽手柄到阈值以下或点顶部「收起」按钮折叠，折叠时换成一列「展开」按钮。 */}
        <Show
          when={!collapsed()}
          fallback={
            <div class="flex min-h-0 shrink-0 flex-col items-center gap-1 rounded-[10px] bg-v2-background-bg-base p-1 shadow-[var(--v2-elevation-raised)]">
              <IconButton
                type="button"
                icon="chevron-double-right"
                variant="ghost"
                size="small"
                aria-label="展开侧边栏"
                onClick={() => toggleCollapsed(false)}
              />
            </div>
          }
        >
          <div class="relative flex min-h-0 shrink-0" style={{ width: `min(${sidebarWidth.width()}px, 100%)` }}>
            <ThesisStepSidebar
              title={title()}
              hasProject={!!project()}
              onHome={() => navigate("/")}
              onCollapse={() => toggleCollapsed(true)}
              onUpload={() => {
                // [论文助手定制] 直接访问工作台 URL 时 layout 可能还没加载项目，用 useThesisProject 兜底查询服务端。
                void resolveProject().then((current) => {
                  if (current) dialog.show(() => <ThesisUploadDialog thesis={current} />)
                })
              }}
            />
            <ResizeHandle
              direction="horizontal"
              edge="end"
              size={sidebarWidth.width()}
              min={180}
              max={360}
              collapseThreshold={50}
              onCollapse={() => toggleCollapsed(true)}
              onResize={sidebarWidth.setWidth}
            />
          </div>
        </Show>
        {/* 右侧当前步骤内容（表单 + 产物） */}
        <div class="flex min-h-0 min-w-0 flex-1 flex-col">
          <Show when={state().activeStep === "outline"}>
            <StepOutline />
          </Show>
          <Show when={state().activeStep === "writing"}>
            <StepWriting />
          </Show>
          <Show when={state().activeStep === "formatting"}>
            <StepFormatting />
          </Show>
          <Show when={state().activeStep === "review"}>
            <StepReview />
          </Show>
        </div>
      </div>
    </div>
  )
}
