// [论文助手定制] Step 4 论文评审（论文工作台）：
// 以排版稿（优先）或全文稿为评审对象，以目标期刊审稿人身份输出评分、分项意见与修改建议。
// [论文助手定制] 配置面板浮窗化（与提纲/辅助写作一致）：左侧配置列取消，改为会话视图输入框底栏
// 「配置」图标 → 居中浮窗（ReviewConfigForm）；Skill 不在配置面板选，直接在会话输入框用 @ 选择；
// 生成 = 会话发送（评审对象文件与配置由「同步到文件空间」一并 @ 进输入框），回复留在会话里
// 手动「应用到画布」才写入 评审报告.md；产物区域改为全宽 StepProductPanel（结构化评审报告渲染）。
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createEffect, createSignal, Show } from "solid-js"
import { useSDK } from "@/context/sdk"
import { useThesisWorkflow } from "./thesis-workflow-store"
import { useThesisLive } from "./thesis-live-store"
import { StepProductPanel } from "./thesis-workflow-ui"
import { ReviewConfigForm } from "./thesis-config-forms"
import { ThesisReviewReport } from "./thesis-review-report"
import { useThesisDocxExport, useThesisPdfExport } from "./thesis-export"

export function StepReview(props?: { configOpen?: boolean; onToggleConfig?: () => void; onSetConfigOpen?: (next: boolean) => void }) {
  const sdk = useSDK()
  const dialog = useDialog()
  const [localConfigOpen, setLocalConfigOpen] = createSignal(false)
  const configOpen = () => props?.configOpen ?? localConfigOpen()
  const setConfigOpen = (next: boolean) => {
    if (props?.onSetConfigOpen) props.onSetConfigOpen(next)
    else setLocalConfigOpen(next)
  }
  const { state, setStepResult } = useThesisWorkflow()
  // [论文助手定制] 流式 progress 走轻量 live store（独立细粒度信号，不触发主 store 整树重算）。
  const live = useThesisLive()
  // [论文助手定制] 导出 Word：把评审报告转成 .docx 保存到项目「正文」目录。
  const { exportDocx } = useThesisDocxExport("评审报告")
  // [论文助手定制] 导出 PDF：把评审报告渲染成 PDF 保存到项目「正文」目录。
  const { exportPdf } = useThesisPdfExport("评审报告")
  const review = () => state().steps.review

  // [论文助手定制] 配置浮窗：configOpen 变 true 时居中弹出 ReviewConfigForm。
  // 关闭统一走 setConfigOpen(false)，由本 effect 的 close 分支调 dialog.close()，
  // 表单按钮不再直接调 dialog.close()（dialog 有 100ms closing 窗口 + lock 防重入）。
  let configDialogShown = false
  createEffect((prev: boolean | undefined) => {
    const open = configOpen()
    if (open && !prev) {
      configDialogShown = true
      dialog.show(
        () => <ReviewConfigForm onClose={() => setConfigOpen(false)} />,
        () => {
          configDialogShown = false
          setConfigOpen(false)
        },
      )
    } else if (!open && prev && configDialogShown) {
      configDialogShown = false
      dialog.close()
    }
    return open
  }, false)

  return (
    <StepProductPanel
      title="评审报告"
      status={review().status}
      progressText={live.progress().review}
      result={review().result}
      onExportDocx={() => void exportDocx(review().result ?? "")}
      onExportPdf={() => void exportPdf(review().result ?? "")}
      emptyHint="在下方会话输入框发送需求开始生成"
      render={(text) => <ThesisReviewReport text={text} />}
      manuscript={{ directory: sdk().directory, step: "review" }}
      configOpen={configOpen()}
      onToggleConfig={() => setConfigOpen(!configOpen())}
      onSetConfigOpen={(next) => setConfigOpen(next)}
      footer={
        <Show when={review().result}>
          <Button type="button" variant="ghost" size="small" onClick={() => setStepResult("review", "")}>
            清空评审报告
          </Button>
        </Show>
      }
    />
  )
}
