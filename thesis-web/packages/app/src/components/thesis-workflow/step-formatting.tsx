// [论文助手定制] 「论文排版」模块（论文工作台，方案 B 去线性化）：
// 独立模块，排版源稿来源可在配置浮窗里显式选择：自动用辅助写作的全文稿 / 手动粘贴 / 无源稿。
// 按目标期刊/学校模板、参考文献格式、标题层级等要求生成排版后的最终稿。
// [论文助手定制] 配置面板浮窗化（与提纲/辅助写作一致）：左侧配置列取消，改为会话视图输入框底栏
// 「配置」图标 → 居中浮窗（FormattingConfigForm）；Skill 不在配置面板选，直接在会话输入框用 @ 选择；
// 生成 = 会话发送（模板、源稿、配置由「同步到文件空间」一并 @ 进输入框），回复留在会话里
// 手动「应用到画布」才写入 排版稿.md；产物区域改为全宽 StepProductPanel，
// docx/pdf 成品预览与重新导出保留（导出走配置里的排版参数 / 模板）。
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createEffect, createResource, createSignal, Show, onCleanup } from "solid-js"
import { useSDK } from "@/context/sdk"
import { useThesisWorkflow } from "./thesis-workflow-store"
import { useThesisLive } from "./thesis-live-store"
import { StepProductPanel } from "./thesis-workflow-ui"
import { FormattingConfigForm } from "./thesis-config-forms"
import { useThesisDocxExport, useThesisPdfExport } from "./thesis-export"
import { base64ToBytes, downloadBytes, errorMessage } from "./thesis-manuscript-preview"

type FormattingArtifact = {
  format: "docx" | "pdf"
  filename: string
  path?: string
}

const artifactReadPath = (artifact: FormattingArtifact) => {
  const path = artifact.path?.trim()
  if (path && !path.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(path)) return path
  return artifact.filename
}

function FormattingArtifactPreview(props: {
  directory: string
  status: "idle" | "generating" | "done"
  artifact?: FormattingArtifact
  onExportDocx: () => void
  onExportPdf: () => void
}) {
  const sdk = useSDK()
  let lastPdfUrl: string | undefined
  const docxPreview = () => {
    const item = preview()
    return item?.kind === "docx" ? item : undefined
  }
  const pdfPreview = () => {
    const item = preview()
    return item?.kind === "pdf" ? item : undefined
  }
  const [preview] = createResource(
    () => (props.status === "done" && props.artifact ? [props.directory, props.artifact.format, artifactReadPath(props.artifact), props.artifact.filename] as const : undefined),
    async ([directory, format, path, filename]) => {
      if (lastPdfUrl) {
        URL.revokeObjectURL(lastPdfUrl)
        lastPdfUrl = undefined
      }
      const res = await sdk().client.file.read({ directory, path })
      if (res.error) throw new Error(errorMessage(res.error))
      if (!res.data || res.data.type !== "binary") throw new Error("成品文件不是可预览的二进制文件")
      const bytes = base64ToBytes(res.data.content ?? "")
      if (format === "pdf") {
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }))
        lastPdfUrl = url
        return { kind: "pdf" as const, url, bytes, filename }
      }
      const mammoth = await import("mammoth/mammoth.browser")
      const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      const html = await mammoth.convertToHtml({ arrayBuffer })
      return { kind: "docx" as const, html: html.value, bytes, filename }
    },
  )
  onCleanup(() => {
    if (lastPdfUrl) URL.revokeObjectURL(lastPdfUrl)
  })

  return (
    <div class="flex h-full min-h-0 flex-col">
      <div class="flex shrink-0 flex-wrap items-center gap-2 border-t border-v2-border-border-base bg-v2-background-bg-layer-01 px-3 py-2">
        <Icon name={props.artifact?.format === "pdf" ? "photo" : "open-file"} size="small" class="text-v2-text-text-faint" />
        <span class="min-w-0 flex-1 truncate text-12-medium text-v2-text-text-base">
          {props.artifact?.filename ?? "尚未生成成品文件"}
        </span>
        <Show when={props.artifact?.format === "docx"}>
          <Button type="button" size="small" variant="secondary" icon="download" onClick={props.onExportDocx}>
            重新导出 Word
          </Button>
        </Show>
        <Show when={props.artifact?.format === "pdf"}>
          <Button type="button" size="small" variant="secondary" icon="download" onClick={props.onExportPdf}>
            重新导出 PDF
          </Button>
        </Show>
        <Show when={docxPreview()}>
          {(result) => (
            <Button
              type="button"
              size="small"
              variant="primary"
              icon="arrow-down-to-line"
              onClick={() =>
                downloadBytes(
                  result().bytes,
                  result().filename,
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
              }
            >
              打开 Word
            </Button>
          )}
        </Show>
        <Show when={pdfPreview()}>
          {(result) => (
            <a
              href={result().url}
              target="_blank"
              rel="noreferrer"
              class="flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md bg-v2-background-bg-base px-2 text-12-medium text-v2-text-text-base shadow-[var(--v2-elevation-raised)] transition-colors hover:text-v2-text-text-accent"
            >
              <Icon name="link" size="small" />
              新标签页
            </a>
          )}
        </Show>
      </div>
      <div class="min-h-0 flex-1 bg-v2-background-bg-layer-02">
        <Show
          when={props.artifact}
          fallback={
            <div class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <Icon name="open-file" size="large" class="text-v2-text-text-faint" />
              <div class="text-13-medium text-v2-text-text-base">生成后将在这里显示成品预览</div>
              <div class="flex flex-wrap justify-center gap-2">
                <Button type="button" variant="primary" icon="download" onClick={props.onExportDocx}>
                  导出 Word
                </Button>
                <Button type="button" variant="secondary" icon="download" onClick={props.onExportPdf}>
                  导出 PDF
                </Button>
              </div>
            </div>
          }
        >
          <Show
            when={!preview.loading}
            fallback={
              <div class="flex h-full items-center justify-center gap-2 text-12-regular text-v2-text-text-faint">
                <span class="size-3 animate-spin rounded-full border-2 border-v2-border-border-focus border-t-transparent" />
                加载成品…
              </div>
            }
          >
            <Show
              when={!preview.error}
              fallback={<div class="p-4 text-13-regular text-icon-critical-base">预览失败：{errorMessage(preview.error)}</div>}
            >
              <Show when={preview()}>
                {(result) => (
                  <Show
                    when={result().kind === "pdf"}
                    fallback={
                      <div class="h-full overflow-y-auto px-6 py-5">
                        <div
                          class="mx-auto min-h-full max-w-[820px] bg-white px-[72px] py-[64px] text-[12pt] leading-[1.8] text-[#1f2933] shadow-[0_12px_34px_rgba(0,0,0,0.18)]"
                          innerHTML={result().kind === "docx" ? result().html : ""}
                        />
                      </div>
                    }
                  >
                    <iframe title={result().filename} src={result().kind === "pdf" ? result().url : undefined} class="h-full w-full border-0 bg-white" />
                  </Show>
                )}
              </Show>
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  )
}

export function StepFormatting(props?: { configOpen?: boolean; onToggleConfig?: () => void; onSetConfigOpen?: (next: boolean) => void }) {
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
  // [论文助手定制] 导出 Word：把排版后的最终稿转成 .docx 保存到项目「正文」目录。
  // 排版参数（字体/字号/行距/页边距/标题编号/封面）随导出传给后端 docx 引擎。
  const { exportDocx } = useThesisDocxExport("排版稿", () => {
    const input = state().steps.formatting.input
    return {
      paperType: input.paperType,
      fontFamily: input.fontFamily,
      fontSize: Number(input.fontSize),
      lineSpacing: Number(input.lineSpacing),
      pageMargin: input.pageMargin as "standard" | "narrow" | "thesis",
      titleNumbering: input.titleNumbering,
      // [论文助手定制] 扩充参数随导出一起传给后端 docx 引擎（页眉/标题字体/缩进/段间距/页码）。
      headerText: input.headerText.trim() || undefined,
      headingFont: input.headingFont,
      firstLineIndent: Number(input.firstLineIndent),
      paragraphSpacing: Number(input.paragraphSpacing),
      pageNumber: input.pageNumber,
      cover:
        input.coverTitle.trim() || input.coverAuthor.trim() || input.coverAffiliation.trim() || input.coverDate.trim()
          ? {
              title: input.coverTitle.trim() || undefined,
              author: input.coverAuthor.trim() || undefined,
              affiliation: input.coverAffiliation.trim() || undefined,
              date: input.coverDate.trim() || undefined,
            }
          : undefined,
      // [论文助手定制] 有模板时把模板相对路径传给后端，走「套用模板」分支（视觉参数不生效）。
      templatePath: input.templatePath.trim() || undefined,
    }
  })
  // [论文助手定制] 导出 PDF：把排版后的最终稿渲染成 PDF 保存到项目「正文」目录。
  const { exportPdf } = useThesisPdfExport("排版稿")
  const [artifact, setArtifact] = createSignal<FormattingArtifact | undefined>(undefined)
  const formatting = () => state().steps.formatting
  const input = () => formatting().input

  const exportCurrentDocx = async (content = formatting().result ?? "") => {
    const result = await exportDocx(content)
    if (result?.filename) setArtifact({ format: "docx", filename: result.filename, path: result.path })
    return result
  }

  const exportCurrentPdf = async (content = formatting().result ?? "") => {
    const result = await exportPdf(content)
    if (result?.filename) setArtifact({ format: "pdf", filename: result.filename, path: result.path })
    return result
  }

  // [论文助手定制] 排版格式切换后清掉旧成品预览（模板/格式变了，旧 docx/pdf 不再代表当前配置）。
  let previousOutputFormat = input().outputFormat
  createEffect(() => {
    const next = input().outputFormat
    if (next !== previousOutputFormat) {
      previousOutputFormat = next
      setArtifact(undefined)
    }
  })

  // [论文助手定制] 配置浮窗：configOpen 变 true 时居中弹出 FormattingConfigForm。
  // dialog.show 注册 dialog 层 onClose：无论用户用「同步到文件空间」按钮 / 右上角 X / 遮罩 / ESC 关闭，
  // 都统一重置哨兵并把 configOpen 同步回 false（否则哨兵被吞、图标再次点不开）。
  // configOpen 变 false（发送自动关 / 图标 toggle 关）时调用 dialog.close() 同步关闭浮窗。
  // 关闭统一走 setConfigOpen(false)，由本 effect 的 close 分支调 dialog.close()，
  // 表单按钮不再直接调 dialog.close()（dialog 有 100ms closing 窗口 + lock 防重入）。
  let configDialogShown = false
  createEffect((prev: boolean | undefined) => {
    const open = configOpen()
    if (open && !prev) {
      configDialogShown = true
      dialog.show(
        () => <FormattingConfigForm onClose={() => setConfigOpen(false)} />,
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
      title="排版后的最终稿"
      status={formatting().status}
      progressText={live.progress().formatting}
      result={formatting().result}
      onExportDocx={() => void exportCurrentDocx()}
      onExportPdf={() => void exportCurrentPdf()}
      emptyHint="在下方会话输入框发送需求开始生成"
      manuscript={{ directory: sdk().directory, step: "formatting" }}
      configOpen={configOpen()}
      onToggleConfig={() => setConfigOpen(!configOpen())}
      onSetConfigOpen={(next) => setConfigOpen(next)}
      documentOverride={
        input().outputFormat === "md" || formatting().status === "generating" ? undefined : (
          <FormattingArtifactPreview
            directory={sdk().directory}
            status={formatting().status}
            artifact={artifact()}
            onExportDocx={() => void exportCurrentDocx()}
            onExportPdf={() => void exportCurrentPdf()}
          />
        )
      }
      footer={
        <Show when={formatting().result}>
          <Button type="button" variant="ghost" size="small" onClick={() => setStepResult("formatting", "")}>
            清空排版稿
          </Button>
        </Show>
      }
    />
  )
}
