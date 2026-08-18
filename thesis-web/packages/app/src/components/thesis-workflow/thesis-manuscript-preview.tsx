// [论文助手定制] 论文「正文」目录文档预览：
// 工作台侧边栏底部「正文」按钮打开的悬浮面板。
// 功能：列出论文项目「正文/」目录下的文件，点击即可预览——
//   - .docx：用 mammoth 在浏览器端解析成 HTML 渲染；
//   - .pdf：读取二进制后用 Blob URL 在 <iframe> 中显示；
//   - .md：用工作台统一的 Markdown 组件渲染；
//   - .txt / 其他文本：直接以纯文本展示；
//   - 其余格式：提示暂不支持。
// 数据来源复用后端已有的 file.list / file.read（无需新增接口）：
//   file.list({ directory, path: "正文" }) 列目录；file.read 对二进制返回 base64。
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { createResource, createSignal, For, Show, onCleanup, type JSX } from "solid-js"
import type { FileNode } from "@opencode-ai/sdk/v2/client"
import { useSDK } from "@/context/sdk"

// [论文助手定制] base64 → Uint8Array（浏览器环境没有 Node Buffer，用 atob 解码）。
const base64ToBytes = (base64: string) => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

const extension = (path: string) => path.split(".").pop()?.toLowerCase() ?? ""

// [论文助手定制] 预览结果类型：文本 / Markdown / docx（本地查看）/ PDF Blob URL / 不支持。
type ManuscriptPreview =
  | { kind: "markdown"; text: string; filename: string }
  | { kind: "text"; text: string; filename: string }
  | { kind: "docx"; bytes: Uint8Array; filename: string }
  | { kind: "pdf"; url: string; filename: string }
  | { kind: "unsupported"; reason: string }

const errorMessage = (err: unknown) => {
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message)
  return String(err)
}

const basename = (path: string) => path.split("/").pop() ?? "文稿"

// [论文助手定制] 「本地查看」：把内容转成 Blob 下载到本地（md/txt 用文本，docx 用字节）。
const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
const downloadBytes = (bytes: Uint8Array, filename: string, mime: string) =>
  // TS 5.7 把 Uint8Array 泛型化为 Uint8Array<ArrayBufferLike>，直接传 Blob 会类型不匹配，这里显式转 BlobPart。
  downloadBlob(new Blob([bytes as BlobPart], { type: mime }), filename)

// [论文助手定制] 预览区顶部工具条：文件名 + 右侧操作按钮（本地查看 / 新标签页）。
function PreviewToolbar(props: { filename: string; children?: JSX.Element }) {
  return (
    <div class="flex shrink-0 items-center gap-2 border-b border-v2-border-border-base px-3 py-1.5">
      <Icon name="open-file" size="small" class="shrink-0 text-v2-text-text-faint" />
      <span class="min-w-0 flex-1 truncate text-12-regular text-v2-text-text-base">{props.filename}</span>
      {props.children}
    </div>
  )
}

// [论文助手定制] 统一的「本地查看（下载）」按钮。
function LocalViewButton(props: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-12-medium text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
    >
      <Icon name="arrow-down-to-line" size="small" />
      本地查看
    </button>
  )
}

// [论文助手定制] docx 本地查看：不内嵌渲染（保证版式与本地 Word 完全一致），
// 只显示提示 + 「本地查看」下载按钮，由用户主动点击下载。
function DocxLocalView(props: { bytes: Uint8Array; filename: string }) {
  return (
    <div class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <Icon name="open-file" size="large" class="text-v2-text-text-faint" />
      <div class="text-13-medium text-v2-text-text-base">docx 文件请在本地查看</div>
      <div class="max-w-sm text-12-regular text-v2-text-text-faint">{props.filename}</div>
      <LocalViewButton
        onClick={() =>
          downloadBytes(props.bytes, props.filename, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        }
      />
    </div>
  )
}

export function ThesisManuscriptDialog(props: { directory: string }) {
  const sdk = useSDK()
  const [selected, setSelected] = createSignal<string | undefined>(undefined)

  // [论文助手定制] 列出「正文」目录的文件（只取文件，按名称排序）。
  const [files] = createResource(
    () => props.directory,
    async (directory) => {
      if (!directory) return []
      try {
        const res = await sdk().client.file.list({ directory, path: "正文" })
        if (res.error) return []
        return (res.data ?? [])
          .filter((node): node is FileNode & { type: "file" } => node.type === "file")
          .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))
      } catch {
        return []
      }
    },
  )

  // [论文助手定制] 未手动选择时默认预览第一个文件。
  const activePath = () => selected() ?? files()?.[0]?.path

  // [论文助手定制] 读取并转换所选文件；PDF 的 Blob URL 在切换/关闭时回收。
  let lastPdfUrl: string | undefined
  const [preview] = createResource(activePath, async (path) => {
    if (lastPdfUrl) {
      URL.revokeObjectURL(lastPdfUrl)
      lastPdfUrl = undefined
    }
    if (!path) return
    const res = await sdk().client.file.read({ directory: props.directory, path })
    if (res.error) throw new Error(errorMessage(res.error))
    const data = res.data
    if (!data) throw new Error("读取文件失败")
    const filename = basename(path)
    if (data.type === "text") {
      // [论文助手定制] md / txt 直接在面板内预览，同时提供「本地查看」下载按钮。
      if (extension(path) === "md") return { kind: "markdown", text: data.content, filename } satisfies ManuscriptPreview
      return { kind: "text", text: data.content, filename } satisfies ManuscriptPreview
    }
    const bytes = base64ToBytes(data.content ?? "")
    const ext = extension(path)
    if (ext === "docx") {
      // [论文助手定制] docx 默认本地查看：返回字节，由 DocxLocalView 自动下载，不再内嵌渲染。
      return { kind: "docx", bytes, filename } satisfies ManuscriptPreview
    }
    if (ext === "pdf") {
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }))
      lastPdfUrl = url
      return { kind: "pdf", url, filename } satisfies ManuscriptPreview
    }
    return { kind: "unsupported", reason: `暂不支持预览 .${ext} 文件，可下载后用本地软件查看` } satisfies ManuscriptPreview
  })
  onCleanup(() => {
    if (lastPdfUrl) URL.revokeObjectURL(lastPdfUrl)
  })

  return (
    <Dialog title="正文文稿" description="点击左侧文件即可预览（支持 Word、PDF、Markdown、文本）" size="x-large">
      {/* [论文助手定制] 给面板一个明确最小高度：Dialog 内容高度默认由内容决定（最多 600px），
          若不设 min-h，flex-1 会塌缩到只剩文件列表的高度，PDF iframe 会变得非常矮（约 174px）看起来像“显示不出来”。 */}
      <div class="flex min-h-[480px] flex-1 gap-3 px-2.5 pb-4">
        {/* [论文助手定制] 左侧文件列表 */}
        <div class="flex w-52 shrink-0 flex-col gap-1 overflow-y-auto rounded-[10px] bg-v2-background-bg-layer-01 p-1.5">
          <div class="flex items-center gap-1.5 px-1.5 pb-1 pt-0.5">
            <Icon name="folder-add-left" size="small" class="text-v2-text-text-faint" />
            <span class="text-12-medium text-v2-text-text-base">正文 / {files()?.length ?? 0} 个文件</span>
          </div>
          <Show
            when={files.loading}
            fallback={
              <Show
                when={files() && files()!.length > 0}
                fallback={<div class="px-1.5 py-2 text-12-regular text-v2-text-text-faint">暂无文件，请先在各步骤中导出 Word / PDF</div>}
              >
                <For each={files()}>
                  {(node) => (
                    <button
                      type="button"
                      class="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-v2-background-bg-base"
                      classList={{
                        "bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]": activePath() === node.path,
                      }}
                      onClick={() => setSelected(node.path)}
                    >
                      <Icon name="open-file" size="small" class="shrink-0 text-v2-text-text-faint" />
                      <span class="min-w-0 flex-1 truncate text-12-regular text-v2-text-text-base">{node.name}</span>
                    </button>
                  )}
                </For>
              </Show>
            }
          >
            <div class="px-1.5 py-2 text-12-regular text-v2-text-text-faint">加载中…</div>
          </Show>
        </div>

        {/* [论文助手定制] 右侧预览区（relative 供 iframe 绝对定位撑满） */}
        <div class="relative min-w-0 flex-1 overflow-hidden rounded-[10px] bg-v2-background-bg-layer-01">
          <Show when={activePath()} fallback={<div class="p-4 text-13-regular text-v2-text-text-faint">暂无文件可预览</div>}>
            <Show
              when={preview.loading}
              fallback={
                <Show when={preview.error} fallback={<Show when={preview()}>{(result) => renderPreview(result())}</Show>}>
                  <div class="p-4 text-13-regular text-icon-critical-base">读取失败：{errorMessage(preview.error)}</div>
                </Show>
              }
            >
              <div class="flex items-center gap-2 p-4 text-13-regular text-v2-text-text-faint">
                <span class="size-3 animate-spin rounded-full border-2 border-v2-border-border-focus border-t-transparent" />
                加载中…
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </Dialog>
  )
}

// [论文助手定制] 按预览结果类型渲染对应内容。
function renderPreview(result: ManuscriptPreview) {
  switch (result.kind) {
    case "markdown":
      // [论文助手定制] md：面板内 Markdown 预览 + 顶部「本地查看」下载按钮。
      return (
        <div class="flex h-full flex-col">
          <PreviewToolbar filename={result.filename}>
            <LocalViewButton onClick={() => downloadBlob(new Blob([result.text], { type: "text/markdown" }), result.filename)} />
          </PreviewToolbar>
          <div class="min-h-0 flex-1 overflow-y-auto p-3"><Markdown text={result.text} /></div>
        </div>
      )
    case "text":
      // [论文助手定制] txt：面板内纯文本预览 + 顶部「本地查看」下载按钮。
      return (
        <div class="flex h-full flex-col">
          <PreviewToolbar filename={result.filename}>
            <LocalViewButton onClick={() => downloadBlob(new Blob([result.text], { type: "text/plain" }), result.filename)} />
          </PreviewToolbar>
          <pre class="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap p-3 text-13-regular text-v2-text-text-base">{result.text}</pre>
        </div>
      )
    case "docx":
      // [论文助手定制] docx：默认本地查看（自动下载一次），不内嵌渲染，保证版式与本地 Word 一致。
      return <DocxLocalView bytes={result.bytes} filename={result.filename} />
    case "pdf":
      // [论文助手定制] PDF 不做内嵌预览（浏览器内置查看器体验不可控），
      // 只提供「本地查看（下载）」与「在新标签页打开」两种方式。
      return (
        <div class="flex h-full flex-col">
          <PreviewToolbar filename={result.filename}>
            <a
              href={result.url}
              download={result.filename}
              class="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-12-medium text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
            >
              <Icon name="arrow-down-to-line" size="small" />
              本地查看
            </a>
            <a
              href={result.url}
              target="_blank"
              rel="noreferrer"
              class="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-12-medium text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
            >
              <Icon name="square-arrow-top-right" size="small" />
              在新标签页打开
            </a>
          </PreviewToolbar>
          <div class="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Icon name="open-file" size="large" class="text-v2-text-text-faint" />
            <div class="text-12-regular text-v2-text-text-faint">PDF 请在本地或新标签页中查看</div>
          </div>
        </div>
      )
    case "unsupported":
      return (
        <div class="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
          <Icon name="open-file" size="large" class="text-v2-text-text-faint" />
          <div class="text-13-regular text-v2-text-text-faint">{result.reason}</div>
        </div>
      )
  }
}
