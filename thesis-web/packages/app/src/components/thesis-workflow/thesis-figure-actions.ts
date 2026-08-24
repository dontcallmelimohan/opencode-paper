// [论文助手定制] 插图动作共享 hook（Step 2「辅助写作」）：
// 插图管理从配置面板挪到会话输入框底栏「插图」浮窗后，插资料图 / 改图注 / 删图引用
// 的统一落盘逻辑收敛到这里（更新 workflow state + 写回 正文/全文稿.md，预览随后从文件重读）。
import { useSDK } from "@/context/sdk"
import { useThesisManuscriptFile } from "./thesis-manuscript-file"
import { useThesisWorkflow } from "./thesis-workflow-store"
import { ASSET_MATERIALS, figureMarker, parseFigures, removeFigure, replaceFigureAlt } from "./thesis-assets"

export function useThesisFigureActions() {
  const sdk = useSDK()
  const { state, setStepResult } = useThesisWorkflow()
  const manuscript = useThesisManuscriptFile(sdk().directory)

  // [论文助手定制] 插图改动的统一落盘：更新 workflow state + 写回 正文/全文稿.md。
  const applyManuscript = async (next: string) => {
    if (!next.trim()) return
    setStepResult("writing", next)
    await manuscript.save("writing", next)
  }

  // [论文助手定制] 引用「资料」目录里已有的图片作为插图（图片在主页「资料」上传）。
  const insertMaterialFigure = async (name: string) => {
    const current = state().steps.writing.result ?? ""
    const marker = figureMarker(`${ASSET_MATERIALS}/${name}`, `图${parseFigures(current).length + 1}`)
    const next = current ? `${current}\n\n${marker}` : marker
    await applyManuscript(next)
  }

  const renameFigure = async (ref: string, alt: string) => {
    const current = state().steps.writing.result ?? ""
    const next = replaceFigureAlt(current, ref, alt)
    if (next === current) return
    await applyManuscript(next)
  }

  const removeFigureFromManuscript = async (ref: string) => {
    const current = state().steps.writing.result ?? ""
    const next = removeFigure(current, ref)
    if (next === current) return
    await applyManuscript(next)
  }

  return { insertMaterialFigure, renameFigure, removeFigureFromManuscript }
}
