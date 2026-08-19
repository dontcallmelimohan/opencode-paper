// [论文助手定制] 论文导出 Word / PDF 的共享逻辑：
// - Word：把 Markdown 文稿文本交给后端 /thesis/export-docx（后端用 docx 库转换），写入项目「正文」目录；
// - PDF：前端用 marked 把 Markdown 渲染成带学术样式的 HTML，交给后端 /thesis/export-pdf
//   （后端用 Chrome headless 打印成 PDF），同样写入「正文」目录。
// 文件名格式：项目名-步骤标签.docx/.pdf（非法文件名字符会被去掉）。
import { createSignal } from "solid-js"
import { marked } from "marked"
import { useLayout } from "@/context/layout"
import { useSDK } from "@/context/sdk"
import { showToast } from "@/utils/toast"
import { thesisName } from "@/pages/home/thesis-home"
import type { InstanceThesisExportDocxOptions, Project } from "@opencode-ai/sdk/v2/client"
import type { DirectorySDK } from "@/context/sdk"
import { ensureFigureDataUrls, parseFigures, resolveAssetUrls } from "@/components/thesis-workflow/thesis-assets"

// [论文助手定制] 导出前把文稿里的 asset:// 插图解析成本机 data URL（PDF 由 Chrome 渲染 data: 图片）。
const withResolvedFigureUrls = async (sdk: DirectorySDK, content: string) => {
  const refs = parseFigures(content).map((figure) => figure.ref)
  if (refs.length === 0) return content
  await ensureFigureDataUrls(sdk, sdk.directory, refs)
  return resolveAssetUrls(content, sdk.directory)
}

// [论文助手定制] 找到当前论文项目：优先用 layout 已加载的项目（主页进入时已打开），
// 直接访问工作台 URL 时 layout 可能还没加载项目，退回服务端 project.list() 查询。
export const useThesisProject = () => {
  const sdk = useSDK()
  const layout = useLayout()
  return async (): Promise<Project | undefined> => {
    const local = layout.projects.list().find((item) => item.worktree === sdk().directory)
    if (local?.id) return local as unknown as Project
    const res = await sdk().client.project.list()
    return res.data?.find((item) => item.worktree === sdk().directory)
  }
}

const safeFilename = (title: string) => title.replace(/[\\/:*?"<>|\n\r]/g, "").trim() || "论文"
const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

// [论文助手定制] PDF 页面模板：A4 学术样式（宋体/黑体标题、段首缩进、表格边框、代码块底色）。
const pdfTemplate = (title: string, body: string) => `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 25mm 22mm; }
  body { font-family: "PingFang SC", "Songti SC", "SimSun", serif; font-size: 12pt; line-height: 1.8; color: #1a1a1a; }
  h1 { font-size: 18pt; text-align: center; margin: 0 0 24px; }
  h2 { font-size: 15pt; margin: 22px 0 10px; }
  h3 { font-size: 13pt; margin: 18px 0 8px; }
  h4 { font-size: 12pt; margin: 14px 0 6px; }
  p { margin: 6px 0; text-indent: 2em; }
  ul, ol { margin: 6px 0; padding-left: 2em; }
  li { margin: 3px 0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 11pt; }
  th, td { border: 1px solid #999; padding: 5px 8px; text-align: left; }
  th { background: #f2f2f2; }
  blockquote { margin: 10px 0; padding: 4px 14px; border-left: 3px solid #bbb; color: #555; background: #fafafa; }
  pre { background: #f6f6f6; border: 1px solid #e0e0e0; border-radius: 4px; padding: 10px 12px; white-space: pre-wrap; word-break: break-all; font-size: 10pt; }
  code { font-family: "SF Mono", Consolas, monospace; }
  p code, li code { background: #f2f2f2; padding: 1px 4px; border-radius: 3px; font-size: 10.5pt; }
  hr { border: none; border-top: 1px solid #ccc; margin: 16px 0; }
  strong { font-weight: 700; }
</style>
</head>
<body>${body}</body>
</html>`

const errorMessage = (err: unknown) => {
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message)
  return String(err)
}

export function useThesisDocxExport(label: string, getOptions?: () => InstanceThesisExportDocxOptions) {
  const sdk = useSDK()
  const resolveProject = useThesisProject()
  const [exporting, setExporting] = createSignal(false)

  const exportDocx = async (content: string) => {
    const proj = await resolveProject()
    if (!proj) {
      showToast({ variant: "error", icon: "circle-x", title: "找不到当前论文项目" })
      return
    }
    if (!content?.trim()) {
      showToast({ variant: "error", icon: "circle-x", title: "没有可导出的文稿内容" })
      return
    }
    if (exporting()) return
    setExporting(true)
    try {
      const res = await sdk().client.instance.thesisExportDocx({
        projectID: proj.id,
        filename: `${safeFilename(thesisName(proj))}-${label}.docx`,
        content,
        // [论文助手定制] 排版参数（字体/字号/行距/页边距/标题编号/封面）随请求传给后端 docx 引擎。
        options: getOptions ? getOptions() : undefined,
      })
      if (res.error) throw new Error(errorMessage(res.error))
      showToast({ variant: "success", icon: "circle-check", title: `已导出 Word（${label}）`, description: res.data?.path })
    } catch (err) {
      showToast({ variant: "error", icon: "circle-x", title: "导出失败", description: errorMessage(err) })
    } finally {
      setExporting(false)
    }
  }

  return { exporting, exportDocx }
}

export function useThesisPdfExport(label: string) {
  const sdk = useSDK()
  const resolveProject = useThesisProject()
  const [exporting, setExporting] = createSignal(false)

  const exportPdf = async (content: string) => {
    const proj = await resolveProject()
    if (!proj) {
      showToast({ variant: "error", icon: "circle-x", title: "找不到当前论文项目" })
      return
    }
    if (!content?.trim()) {
      showToast({ variant: "error", icon: "circle-x", title: "没有可导出的文稿内容" })
      return
    }
    if (exporting()) return
    setExporting(true)
    try {
      const title = thesisName(proj)
      // [论文助手定制] marked 默认开启 GFM：表格、列表、代码块都能正确渲染成 HTML。
      // asset:// 插图先解析成 data URL，Chrome headless 打印时图片会出现在 PDF 里。
      const html = pdfTemplate(title, marked.parse(await withResolvedFigureUrls(sdk(), content)) as string)
      const res = await sdk().client.instance.thesisExportPdf({
        projectID: proj.id,
        filename: `${safeFilename(title)}-${label}.pdf`,
        html,
      })
      if (res.error) throw new Error(errorMessage(res.error))
      showToast({ variant: "success", icon: "circle-check", title: `已导出 PDF（${label}）`, description: res.data?.path })
    } catch (err) {
      showToast({ variant: "error", icon: "circle-x", title: "导出失败", description: errorMessage(err) })
    } finally {
      setExporting(false)
    }
  }

  return { exporting, exportPdf }
}
