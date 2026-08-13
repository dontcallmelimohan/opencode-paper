import { createPromptProjectController } from "@/components/prompt-project-selector"
import { SessionAgentSidebar } from "@/components/session/agent-sidebar"
// [论文助手定制] 侧边栏与配置面板依赖写作模式 Context，这里提供 Provider。
import { ThesisConfigPanelStrip } from "@/components/session/thesis-mode-config-panel"
// [论文助手定制] 每个模式一份技能清单：切换模式时自动换装输入框里的 @技能。
import { ThesisModeSkillsSync } from "@/components/session/thesis-mode-skills"
import { WritingModeProvider } from "@/components/session/writing-mode"
import { useTitlebarRightMount } from "@/components/titlebar"
import { usePrompt } from "@/context/prompt"
import { useSettings } from "@/context/settings"
import { createEffect, createResource } from "solid-js"
import { createNewSessionDraftController } from "./new-session/new-session-draft-controller"
import { NewSessionStatus, NewSessionView } from "./new-session/new-session-view"
import { createNewSessionWorkspaceController } from "./new-session/new-session-workspace-controller"
import { useNewSessionCommands } from "./new-session/use-new-session-commands"

/** The draft-only V2 session page. Submitting promotes the draft into a real session. */
export default function NewSessionPage() {
  const settings = useSettings()
  const prompt = usePrompt()
  const rightMount = useTitlebarRightMount()
  const workspace = createNewSessionWorkspaceController()
  const draft = createNewSessionDraftController({
    worktree: workspace.selection.value,
    resetWorktree: workspace.selection.reset,
  })
  const project = createPromptProjectController({
    controls: draft.project.controls,
    onDone: draft.input.restoreFocus,
  })
  useNewSessionCommands({
    restoreFocus: draft.input.restoreFocus,
    project: {
      empty: project.empty,
      open: () => project.setOpen(true),
    },
  })
  createEffect(() => {
    if (!draft.prompt.ready()) return
    draft.input.restoreFocus()
  })
  const ready = Promise.resolve()
  const [suspendUntilPromptReady] = createResource(
    () => draft.prompt.readyPromise() ?? ready,
    (promise) => promise.then(() => true),
  )

  return (
    <div class="relative size-full overflow-hidden flex flex-col">
      {suspendUntilPromptReady()}
      <NewSessionStatus mount={rightMount} visible={settings.visibility.status} />
      {/* [论文助手定制] Provider 提升到整行：侧边栏与会话框上部的配置面板都要读模式状态。 */}
      <WritingModeProvider>
        {/* [论文助手定制] 技能与模式挂钩：同步“每模式一份技能”到输入框（不渲染 UI）。 */}
        <ThesisModeSkillsSync prompt={prompt} />
        <div class="flex-1 min-h-0 flex flex-col gap-2 p-2 md:flex-row">
          <SessionAgentSidebar />
          <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            {/* [论文助手定制] 配置面板显示在会话框上部；发送时若无会话会自动创建并跳转。 */}
            <ThesisConfigPanelStrip />
            <NewSessionView input={draft.input} project={project} workspace={workspace} />
          </div>
        </div>
      </WritingModeProvider>
    </div>
  )
}
