// [论文助手定制] 论文工作台页面（核心页面）。
// 论文生产不再以“和模型对话”为主体，而是以“四步标准化流程”为主体：
//   提纲助手 → 辅助写作 → 论文排版 → 论文评审
// 每步：左侧输入表单 + 右侧产物（Markdown），「生成」按钮调用模型并保存产物；
// 产物与设置按论文项目持久化（localStorage），生成记录落在该项目专属会话里。
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useNavigate } from "@solidjs/router"
import { createMemo, Show } from "solid-js"
import type { Project } from "@opencode-ai/sdk/v2/client"
import { StepFormatting } from "@/components/thesis-workflow/step-formatting"
import { StepOutline } from "@/components/thesis-workflow/step-outline"
import { StepReview } from "@/components/thesis-workflow/step-review"
import { StepWriting } from "@/components/thesis-workflow/step-writing"
import { ThesisKnowledgeProvider } from "@/components/thesis-workflow/thesis-knowledge-store"
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

  const project = createMemo(() =>
    layout.projects.list().find((item) => item.worktree === sdk().directory),
  )
  // [论文助手定制] layout 里的项目是 Partial 类型，这里按 SDK Project 使用（工作台里的论文一定来自服务端，有 id）。
  const title = createMemo(() =>
    project() ? thesisName(project() as unknown as Project) : getFilename(sdk().directory),
  )

  return (
    // [论文助手定制] 外层容器与主页卡片一致（self-stretch 撑满主区域宽度、圆角卡片浮在深色底上），
    // 顶部栏已删除（主页/标题/资料/生成记录集中到左侧边栏），布局为：侧边栏 + 当前步骤内容。
    <div class="m-2 min-h-0 flex-1 self-stretch overflow-hidden rounded-[10px] bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]">
      <div class="flex size-full min-h-0 min-w-0 gap-2 overflow-hidden p-2">
        {/* [论文助手定制] 左侧侧边栏：四步切换 + 顶部（主页/标题）+ 底部工具（资料/生成记录） */}
        <ThesisStepSidebar
          title={title()}
          hasProject={!!project()}
          onHome={() => navigate("/")}
          onUpload={() => {
            const current = project()
            if (current) dialog.show(() => <ThesisUploadDialog thesis={current as unknown as Project} />)
          }}
        />
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
