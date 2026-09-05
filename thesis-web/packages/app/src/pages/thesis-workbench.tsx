// [论文助手定制] 论文工作台页面（核心页面）。
// 论文生产不再以“和模型对话”为主体，而是以“四步标准化流程”为主体：
//   提纲助手 → 辅助写作 → 论文排版 → 论文评审
// 每步：左侧输入表单 + 右侧产物（Markdown），「生成」按钮调用模型并保存产物；
// 产物与设置按论文项目持久化（localStorage），生成记录落在该项目专属会话里。
// [论文助手定制] GitHub 式扁平布局：左侧固定宽度侧边栏（220px，可收起）+ 右侧当前步骤全宽产物，
// 各步骤的配置面板为浮窗（见 step-*.tsx），产物/会话/并列切换在 StepProductPanel 的 tab 栏。
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useNavigate } from "@solidjs/router"
import { createMemo, createSignal, onMount, Show } from "solid-js"
import { IconButton } from "@opencode-ai/ui/icon-button"
import type { Project } from "@opencode-ai/sdk/v2/client"
import { StepFormatting } from "@/components/thesis-workflow/step-formatting"
import { StepOutline } from "@/components/thesis-workflow/step-outline"
import { StepReview } from "@/components/thesis-workflow/step-review"
import { StepWriting } from "@/components/thesis-workflow/step-writing"
import { ThesisKnowledgeProvider } from "@/components/thesis-workflow/thesis-knowledge-store"
import { ThesisLiveProvider } from "@/components/thesis-workflow/thesis-live-store"
import { useThesisManuscriptFile } from "@/components/thesis-workflow/thesis-manuscript-file"
import { useThesisProject } from "@/components/thesis-workflow/thesis-export"
import { ThesisStepSidebar } from "@/components/thesis-workflow/thesis-step-sidebar"
import { ThesisWorkflowProvider, useThesisWorkflow, type StepKey } from "@/components/thesis-workflow/thesis-workflow-store"
import { useLayout } from "@/context/layout"
import { useSDK } from "@/context/sdk"
import { getFilename } from "@opencode-ai/core/util/path"
import { ThesisUploadDialog, thesisName } from "./home/thesis-home"

export default function ThesisWorkbenchPage() {
  const sdk = useSDK()
  const directory = () => sdk().directory
  return (
    // [论文助手定制] 每篇论文一份工作流状态 + 知识库 + 流式 progress（都按工作区路径隔离）。
    <ThesisWorkflowProvider directory={directory()}>
      <ThesisLiveProvider>
        <ThesisKnowledgeProvider directory={directory()}>
          <ThesisWorkbenchInner />
        </ThesisKnowledgeProvider>
      </ThesisLiveProvider>
    </ThesisWorkflowProvider>
  )
}

function ThesisWorkbenchInner() {
  const sdk = useSDK()
  const navigate = useNavigate()
  const layout = useLayout()
  const dialog = useDialog()
  const { state } = useThesisWorkflow()
  // [论文助手定制] 文稿文件化迁移：打开工作台时把已有 result 落盘为项目根目录 <step>.md（幂等覆盖写）。
  const manuscript = useThesisManuscriptFile(sdk().directory)
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
  // [论文助手定制] 四个板块配置全部浮窗化：默认收起，点击会话输入框底栏「配置」图标打开。
  const [stepConfigOpen, setStepConfigOpen] = createSignal<Record<StepKey, boolean>>({
    outline: false,
    writing: false,
    formatting: false,
    review: false,
  })
  const toggleStepConfig = (step: StepKey) => {
    setStepConfigOpen((current) => ({
      ...current,
      [step]: !(current[step] ?? true),
    }))
  }
  const setStepConfig = (step: StepKey, next: boolean) => {
    setStepConfigOpen((current) => ({
      ...current,
      [step]: next,
    }))
  }
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
    // [论文助手定制] GitHub 式扁平外壳：与主页同一套纯色页面 + 1px 边框（不再用多层浮层卡片），
    // 内部为「侧边栏 | 当前步骤内容」两块，侧边栏与内容之间以 1px 竖线分隔。
    // 顶部栏已删除（主页/标题/资料/生成记录集中到左侧边栏）。
    <div class="workbench-page m-1.5 flex min-h-0 flex-1 self-stretch overflow-hidden rounded-[10px] border workbench-border md:m-2">
      <div class="flex size-full min-h-0 min-w-0 overflow-hidden">
        {/* [论文助手定制] 左侧侧边栏：四步切换 + 顶部（主页/标题）+ 底部工具（资料/生成记录）。
            固定宽度 220px（max-w-full 保证窄屏不溢出），不再挂拖拽手柄——画布宽度保持稳定；
            可收起：点顶部「收起」按钮折叠，折叠时换成一列「展开」按钮。 */}
        <Show
          when={!collapsed()}
          fallback={
            <div class="workbench-subtle flex min-h-0 w-10 shrink-0 flex-col items-center gap-1 border-r workbench-border py-1.5">
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
          <div class="workbench-page flex min-h-0 w-[220px] max-w-full shrink-0 border-r workbench-border">
            <ThesisStepSidebar
              title={title()}
              hasProject={!!project()}
              configOpen={stepConfigOpen()[state().activeStep] ?? false}
              onHome={() => navigate("/")}
              onCollapse={() => toggleCollapsed(true)}
              onToggleConfig={() => toggleStepConfig(state().activeStep)}
              onUpload={() => {
                // [论文助手定制] 直接访问工作台 URL 时 layout 可能还没加载项目，用 useThesisProject 兜底查询服务端。
                void resolveProject().then((current) => {
                  if (current) dialog.show(() => <ThesisUploadDialog thesis={current} />)
                })
              }}
            />
          </div>
        </Show>
        {/* 右侧当前步骤内容（表单 + 产物） */}
        <div class="flex min-h-0 min-w-0 flex-1 flex-col">
          <Show when={state().activeStep === "outline"}>
            <StepOutline
              configOpen={stepConfigOpen().outline ?? false}
              onToggleConfig={() => toggleStepConfig("outline")}
              onSetConfigOpen={(next) => setStepConfig("outline", next)}
            />
          </Show>
          <Show when={state().activeStep === "writing"}>
            <StepWriting
              configOpen={stepConfigOpen().writing ?? false}
              onToggleConfig={() => toggleStepConfig("writing")}
              onSetConfigOpen={(next) => setStepConfig("writing", next)}
            />
          </Show>
          <Show when={state().activeStep === "formatting"}>
            <StepFormatting
              configOpen={stepConfigOpen().formatting ?? true}
              onToggleConfig={() => toggleStepConfig("formatting")}
              onSetConfigOpen={(next) => setStepConfig("formatting", next)}
            />
          </Show>
          <Show when={state().activeStep === "review"}>
            <StepReview
              configOpen={stepConfigOpen().review ?? true}
              onToggleConfig={() => toggleStepConfig("review")}
              onSetConfigOpen={(next) => setStepConfig("review", next)}
            />
          </Show>
        </div>
      </div>
    </div>
  )
}
