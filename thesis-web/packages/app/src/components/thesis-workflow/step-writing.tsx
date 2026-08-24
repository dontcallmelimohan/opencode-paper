// [论文助手定制] 「辅助写作」模块（论文工作台，方案 B 去线性化）：
// 独立模块，不再依赖必须先完成提纲——参考提纲来源可在表单里显式选择：
// 自动用提纲模块结果 / 手动粘贴 / 不用提纲。多次生成的内容会累积成“全文稿”（writing.result）。
// [论文助手定制] 配置面板弱化（第二轮）：左侧配置列取消，改为会话视图输入框底栏「配置」图标 →
// 居中浮窗（勾选表单，无 Skill / 无文件选择 / 无插图区块）；插图管理挪到输入框底栏「插图」图标浮窗；
// 生成 = 会话发送，不自动落盘，回复留在会话里手动「应用到画布」才写入 正文/全文稿.md。
// 产物区域改为全宽 StepProductPanel；插图动作迁至 thesis-figure-actions.ts 共享 hook。
import { createEffect, createSignal, Show } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useSDK } from "@/context/sdk"
import { useThesisManuscriptFile } from "./thesis-manuscript-file"
import { useThesisWorkflow } from "./thesis-workflow-store"
import { StepProductPanel } from "./thesis-workflow-ui"
import { useThesisDocxExport, useThesisPdfExport } from "./thesis-export"
import { WritingConfigForm } from "./thesis-config-forms"

export function StepWriting(props?: { configOpen?: boolean; onToggleConfig?: () => void; onSetConfigOpen?: (next: boolean) => void }) {
  const sdk = useSDK()
  const dialog = useDialog()
  // [论文助手定制] 配置浮窗仅由点击底栏「配置」图标打开（取消切换板块时自动弹出）。
  const [localConfigOpen, setLocalConfigOpen] = createSignal(false)
  const configOpen = () => props?.configOpen ?? localConfigOpen()
  const setConfigOpen = (next: boolean) => {
    if (props?.onSetConfigOpen) props.onSetConfigOpen(next)
    else setLocalConfigOpen(next)
  }
  const { state, setStepResult } = useThesisWorkflow()
  // [论文助手定制] 文稿文件化：「应用到画布」时写入项目「正文/全文稿.md」。
  const manuscript = useThesisManuscriptFile(sdk().directory)
  // [论文助手定制] 导出 Word：把全文稿转成 .docx 保存到项目「正文」目录。
  const { exportDocx } = useThesisDocxExport("全文稿")
  // [论文助手定制] 导出 PDF：把全文稿渲染成 PDF 保存到项目「正文」目录。
  const { exportPdf } = useThesisPdfExport("全文稿")
  const writing = () => state().steps.writing

  // [论文助手定制] 配置浮窗：configOpen 变 true 时居中弹出 WritingConfigForm。
  // dialog.show 注册 dialog 层 onClose：无论用户用「添加到输入框」按钮 / 右上角 X / 遮罩 / ESC 关闭，
  // 都统一重置哨兵并把 configOpen 同步回 false（否则哨兵被吞、图标再次点不开）。
  // configOpen 变 false（发送自动关 / 图标 toggle 关）时调用 dialog.close() 同步关闭浮窗。
  // 注意：关闭统一走 setConfigOpen(false)，由本 effect 的 close 分支调 dialog.close()，
  // 表单按钮不再直接调 dialog.close()（dialog 有 100ms closing 窗口 + lock 防重入，
  // 直接 close 一旦被 lock 吞掉 onClose 不触发，configOpen/哨兵会卡死导致「点了没反应」）。
  let configDialogShown = false
  createEffect((prev: boolean | undefined) => {
    const open = configOpen()
    if (open && !prev) {
      configDialogShown = true
      dialog.show(
        () => <WritingConfigForm onClose={() => setConfigOpen(false)} />,
        () => {
          configDialogShown = false
          setConfigOpen(false)
        },
      )
    } else if (!open && prev && configDialogShown) {
      // 主动先重置哨兵：即使 dialog.close() 被 lock 吞掉，状态也已归位，下次打开不受影响。
      configDialogShown = false
      dialog.close()
    }
    return open
  }, false)

  return (
    <StepProductPanel
      title="论文全文稿（可继续追加章节）"
      status={writing().status}
      progressText=""
      result={writing().result}
      onExportDocx={() => void exportDocx(writing().result ?? "")}
      onExportPdf={() => void exportPdf(writing().result ?? "")}
      emptyHint="在下方会话输入框发送需求开始生成"
      manuscript={{ directory: sdk().directory, step: "writing" }}
      configOpen={configOpen()}
      onToggleConfig={() => setConfigOpen(!configOpen())}
      onSetConfigOpen={(next) => setConfigOpen(next)}
      footer={
        <Show when={writing().result}>
          <Button type="button" variant="ghost" size="small" onClick={() => setStepResult("writing", "")}>
            清空全文稿
          </Button>
        </Show>
      }
    />
  )
}
