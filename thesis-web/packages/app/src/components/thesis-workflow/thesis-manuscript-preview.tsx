// [论文助手定制] 论文「文件空间」：
// 工作台侧边栏底部「文件空间」按钮打开的悬浮面板，是一个轻量文件管理器——
//   - 平铺浏览项目文件（不再区分「正文/资料」，按目录进入查看）；
//   - 支持新建文件夹 / 新建文本文件 / 上传文件（可传到当前目录）/ 删除（文件夹递归）；
//   - 点击文件即可预览——
//   - .docx：用 mammoth 在浏览器端解析成 HTML 渲染；
//   - .pdf：读取二进制后用 Blob URL 在 <iframe> 中显示；
//   - .md：用工作台统一的 Markdown 组件渲染；
//   - .txt / 其他文本：直接以纯文本展示；
//   - 其余格式：提示暂不支持。
// 数据来源：file.list / file.read 列目录读文件；新建/删除走后端 thesis 定制接口
// （thesisMkdir / thesisWriteFile / thesisDeleteEntry / thesisUpload）。
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon, type IconProps } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { TextField } from "@opencode-ai/ui/text-field"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { createEffect, createResource, createSignal, For, Show, onCleanup, type JSX } from "solid-js"
import type { FileNode } from "@opencode-ai/sdk/v2/client"
import { useSDK } from "@/context/sdk"
import { showToast } from "@/utils/toast"
import { dataUrlOf, IMAGE_EXTENSIONS, mimeOf, resolveMarkdownImages } from "./thesis-assets"
import { useThesisProject } from "./thesis-export"

// [论文助手定制] base64 → Uint8Array（浏览器环境没有 Node Buffer，用 atob 解码）。
export const base64ToBytes = (base64: string) => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export const extension = (path: string) => path.split(".").pop()?.toLowerCase() ?? ""

// [论文助手定制] 预览结果类型：文本 / Markdown / 图片 / docx（本地查看）/ PDF Blob URL / 不支持。
type ManuscriptPreview =
  | { kind: "markdown"; text: string; filename: string }
  | { kind: "text"; text: string; filename: string }
  | { kind: "image"; dataUrl: string; bytes: Uint8Array; filename: string }
  | { kind: "docx"; bytes: Uint8Array; filename: string }
  | { kind: "pdf"; url: string; filename: string }
  | { kind: "unsupported"; reason: string }

export const errorMessage = (err: unknown) => {
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message)
  return String(err)
}

export const basename = (path: string) => path.split("/").pop() ?? "文稿"

// [论文助手定制] 「本地查看」：把内容转成 Blob 下载到本地（md/txt 用文本，docx 用字节）。
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
export const downloadBytes = (bytes: Uint8Array, filename: string, mime: string) =>
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

// [论文助手定制] 「文件空间」分组：正文（正文/ 目录）、资料（根目录上传的文件）、其他（其余子目录）。
type FileEntry = { path: string; name: string }
type FileGroup = { key: "manuscript" | "materials" | "other"; label: string; icon: IconProps["name"]; files: FileEntry[] }

// [论文助手定制] 新建文件夹 / 新建文本文件的输入弹窗（名称可为相对路径，如 资料/图片 或 摘要.md）。
function NewEntryDialog(props: { kind: "folder" | "file"; onDone: (name: string) => void }) {
  const dialog = useDialog()
  const [name, setName] = createSignal("")
  const isFolder = props.kind === "folder"
  return (
    <Dialog
      title={isFolder ? "新建文件夹" : "新建文件"}
      description={isFolder ? "支持多级路径，如 资料/图片" : "支持子目录路径，如 摘要/结论.md"}
    >
      <form
        class="flex w-[420px] max-w-full flex-col gap-4 px-2.5 pb-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (name().trim()) {
            props.onDone(name().trim())
            dialog.close()
          }
        }}
      >
        <TextField
          type="text"
          label={isFolder ? "文件夹名称" : "文件名"}
          placeholder={isFolder ? "例如：实验数据" : "例如：摘要.md"}
          value={name()}
          autofocus
          onChange={(value) => setName(value)}
        />
        <div class="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => dialog.close()}>
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={!name().trim()}>
            创建
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

// [论文助手定制] 删除确认弹窗（文件或文件夹，文件夹递归删除不可恢复）。
function DeleteEntryDialog(props: { path: string; name: string; isDir: boolean; onDone: () => void }) {
  const sdk = useSDK()
  const dialog = useDialog()
  const resolveProject = useThesisProject()
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>(undefined)

  async function remove() {
    setBusy(true)
    setError(undefined)
    try {
      const proj = await resolveProject()
      if (!proj) throw new Error("论文项目不存在")
      const res = await sdk().client.instance.thesisDeleteEntry({ projectID: proj.id, path: props.path })
      if (res.error) throw new Error(errorMessage(res.error))
      showToast({ variant: "success", icon: "circle-check", title: `已删除「${props.name}」` })
      props.onDone()
      dialog.close()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="删除确认"
      description={`确定删除「${props.name}」吗？${props.isDir ? "文件夹内的内容将一并删除，" : ""}删除后不可恢复。`}
    >
      <div class="flex w-[420px] max-w-full flex-col gap-3 px-2.5 pb-4">
        <Show when={error()}>
          <div class="text-13-regular text-icon-critical-base">{error()}</div>
        </Show>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => dialog.close()}>
            取消
          </Button>
          <Button type="button" variant="primary" icon="circle-x" disabled={busy()} onClick={() => void remove()}>
            {busy() ? "删除中…" : "删除"}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

export function ThesisFileManager(props: { directory: string }) {
  const sdk = useSDK()
  const dialog = useDialog()
  const resolveProject = useThesisProject()
  // [论文助手定制] 当前浏览的目录（相对项目根，空串 = 根目录）。
  const [currentDir, setCurrentDir] = createSignal("")
  const [selected, setSelected] = createSignal<string | undefined>(undefined)
  const [uploading, setUploading] = createSignal(false)
  let fileInput: HTMLInputElement | undefined

  const joinPath = (dir: string, name: string) => (dir ? `${dir}/${name}` : name)
  const parentOf = (dir: string) => dir.split("/").slice(0, -1).join("/")

  // [论文助手定制] 列出当前目录条目：过滤 .git 等隐藏项，文件夹在前、按名称排序。
  const [entries, { refetch }] = createResource(
    () => [props.directory, currentDir()] as const,
    async ([directory, dir]) => {
      if (!directory) return []
      try {
        const res = await sdk().client.file.list({ directory, path: dir })
        if (res.error) return []
        return (res.data ?? [])
          .filter((node) => !node.name.startsWith("."))
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === "directory" ? -1 : 1
            return a.name.localeCompare(b.name, "zh-Hans-CN")
          })
      } catch {
        return []
      }
    },
  )

  // [论文助手定制] 未手动选择时默认预览当前目录第一个文件。
  const activePath = () => selected() ?? (entries() ?? []).find((node) => node.type === "file")?.name

  // [论文助手定制] 预览刷新计数：编辑保存后 +1 强制重新读取文件。
  const [tick, setTick] = createSignal(0)

  // [论文助手定制] 读取并转换所选文件；PDF 的 Blob URL 在切换/关闭时回收。
  let lastPdfUrl: string | undefined
  const [preview] = createResource(() => [activePath(), tick()] as const, async ([path]) => {
    if (lastPdfUrl) {
      URL.revokeObjectURL(lastPdfUrl)
      lastPdfUrl = undefined
    }
    if (!path) return
    const fullPath = joinPath(currentDir(), path)
    const res = await sdk().client.file.read({ directory: props.directory, path: fullPath })
    if (res.error) throw new Error(errorMessage(res.error))
    const data = res.data
    if (!data) throw new Error("读取文件失败")
    const filename = basename(fullPath)
    if (data.type === "text") {
      // [论文助手定制] md / txt 直接在面板内预览，同时提供「本地查看」下载按钮。
      if (extension(fullPath) === "md") return { kind: "markdown", text: data.content, filename } satisfies ManuscriptPreview
      return { kind: "text", text: data.content, filename } satisfies ManuscriptPreview
    }
    const bytes = base64ToBytes(data.content ?? "")
    const ext = extension(fullPath)
    // [论文助手定制] 图片：内嵌预览（与主页资料弹窗同一套 data URL 构造）。
    if ((IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
      return { kind: "image", dataUrl: dataUrlOf(fullPath, data.content ?? ""), bytes, filename } satisfies ManuscriptPreview
    }
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

  // [论文助手定制] md/txt 编辑状态：editing 保存目标路径，editText 为编辑框内容。
  const [editing, setEditing] = createSignal<{ path: string; content: string } | undefined>(undefined)
  const [editText, setEditText] = createSignal("")
  const [saving, setSaving] = createSignal(false)

  const editingActive = () => {
    const current = editing()
    const path = activePath()
    return !!current && !!path && current.path === joinPath(currentDir(), path)
  }

  // [论文助手定制] 是否正在编辑 Markdown：编辑视图对 md 额外显示「实时渲染预览」（编辑源码、看渲染结果）。
  const isMarkdownEditing = () => {
    const current = editing()
    return !!current && extension(current.path) === "md"
  }

  const startEdit = (path: string, initial: string) => {
    setEditText(initial)
    setEditing({ path, content: initial })
  }

  // [论文助手定制] 保存编辑内容：调 thesisWriteFile 写回文件，成功后刷新预览与列表。
  async function saveEdit() {
    const current = editing()
    if (!current) return
    const proj = await resolveProject()
    if (!proj) return
    setSaving(true)
    try {
      const res = await sdk().client.instance.thesisWriteFile({ projectID: proj.id, path: current.path, content: editText() })
      if (res.error) throw new Error(errorMessage(res.error))
      showToast({ variant: "success", icon: "circle-check", title: "已保存" })
      setEditing(undefined)
      setTick((value) => value + 1)
      refetch()
    } catch (err) {
      showToast({
        variant: "error",
        icon: "circle-x",
        title: "保存失败",
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setSaving(false)
    }
  }

  // [论文助手定制] 插图预览：把 Markdown 里的 asset:// 引用与本地相对路径图片（如 ![4](4.jpg)，
  // 相对 md 所在目录）统一解析成本机 data URL（复用 thesis-assets 的 resolveMarkdownImages）。
  // 异步完成前先用原文渲染（alt 兜底，不会出现空白）。
  // 竞态保护：连续切换文件时，旧文件的异步解析结果可能后返回，用版本号丢弃过期结果，
  // 避免出现“预览内容/图片显示成别的文件”的问题。
  const [resolvedMarkdown, setResolvedMarkdown] = createSignal<string | undefined>(undefined)
  let resolveVersion = 0
  createEffect(() => {
    const version = ++resolveVersion
    const result = preview()
    const text = result?.kind === "markdown" ? result.text : undefined
    setResolvedMarkdown(text)
    if (!text) return
    void resolveMarkdownImages(sdk(), props.directory, currentDir(), text).then((next) => {
      if (version === resolveVersion && next !== text) setResolvedMarkdown(next)
    })
  })

  // [论文助手定制] 编辑态右侧实时预览：与正常预览一样解析图片（编辑的是源码、看的是渲染结果），
  // 否则编辑 md 时 ![4](4.jpg) 这类本地图片会显示为裂图；同样带版本号竞态保护（打字快时丢弃过期结果）。
  const [resolvedEditText, setResolvedEditText] = createSignal<string | undefined>(undefined)
  let editResolveVersion = 0
  createEffect(() => {
    const version = ++editResolveVersion
    const text = editingActive() && isMarkdownEditing() ? editText() : undefined
    setResolvedEditText(text)
    if (!text) return
    void resolveMarkdownImages(sdk(), props.directory, currentDir(), text).then((next) => {
      if (version === editResolveVersion && next !== text) setResolvedEditText(next)
    })
  })

  // [论文助手定制] 新建文件夹 / 新建文本文件：路径拼上当前目录后调用后端接口。
  function createEntry(kind: "folder" | "file") {
    dialog.show(() => (
      <NewEntryDialog
        kind={kind}
        onDone={(name) => {
          void (async () => {
            const proj = await resolveProject()
            if (!proj) return
            const target = joinPath(currentDir(), name)
            try {
              const res =
                kind === "folder"
                  ? await sdk().client.instance.thesisMkdir({ projectID: proj.id, path: target })
                  : await sdk().client.instance.thesisWriteFile({ projectID: proj.id, path: target, content: "" })
              if (res.error) throw new Error(errorMessage(res.error))
              showToast({ variant: "success", icon: "circle-check", title: kind === "folder" ? "文件夹已创建" : "文件已创建" })
              refetch()
              // [论文助手定制] 新建文件后自动打开编辑：跳到文件所在目录、选中它并进入编辑态（内容为空）。
              if (kind === "file") {
                const isNested = name.includes("/")
                navigate(isNested ? parentOf(target) : currentDir())
                setSelected(isNested ? name.split("/").pop()! : name)
                startEdit(target, "")
              }
            } catch (err) {
              showToast({
                variant: "error",
                icon: "circle-x",
                title: "创建失败",
                description: err instanceof Error ? err.message : String(err),
              })
            }
          })()
        }}
      />
    ))
  }

  // [论文助手定制] 删除确认（文件或文件夹，文件夹递归删除）。
  function confirmDelete(node: { fullPath: string; name: string; type: "file" | "directory" }) {
    dialog.show(() => (
      <DeleteEntryDialog path={node.fullPath} name={node.name} isDir={node.type === "directory"} onDone={() => refetch()} />
    ))
  }

  // [论文助手定制] 上传文件到当前目录（复用后端 thesisUpload，新增 directory 参数）。
  const toBase64 = (file: File) =>
    file.arrayBuffer().then((buffer) => {
      const bytes = new Uint8Array(buffer)
      let binary = ""
      const CHUNK = 0x8000
      for (let index = 0; index < bytes.length; index += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK))
      }
      return btoa(binary)
    })

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return
    const proj = await resolveProject()
    if (!proj) return
    setUploading(true)
    try {
      let uploaded = 0
      for (const file of files) {
        const content = await toBase64(file)
        const res = await sdk().client.instance.thesisUpload({
          projectID: proj.id,
          filename: file.name,
          content,
          directory: currentDir() || undefined,
        })
        if (res.error) throw new Error(errorMessage(res.error))
        uploaded += 1
      }
      showToast({ variant: "success", icon: "circle-check", title: `已上传 ${uploaded} 个文件` })
      refetch()
    } catch (err) {
      showToast({
        variant: "error",
        icon: "circle-x",
        title: "上传失败",
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setUploading(false)
    }
  }

  // [论文助手定制] 面包屑：根目录 / 各级目录，点击可跳转。
  const crumbs = () => {
    const parts = currentDir().split("/").filter(Boolean)
    const items = [{ label: "根目录", dir: "" }]
    let acc = ""
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part
      items.push({ label: part, dir: acc })
    }
    return items
  }

  const navigate = (dir: string) => {
    setCurrentDir(dir)
    setSelected(undefined)
  }

  return (
    // [论文助手定制] 整页/弹窗共用主体：min-h-0 + flex-1 让高度跟随外层容器（整页撑满视口，页面本身不滚动，
    // 文件列表、预览区、编辑区各自内部滚动）。
    <div class="flex min-h-0 flex-1 gap-3 px-2.5 pb-4">
        {/* [论文助手定制] 左侧：文件浏览器（路径栏 + 操作 + 列表） */}
        <div class="flex w-64 shrink-0 flex-col gap-1.5 rounded-[10px] bg-v2-background-bg-layer-01 p-1.5">
          <div class="flex items-center gap-1 px-1 pb-0.5 pt-0.5">
            <Icon name="folder" size="small" class="shrink-0 text-v2-text-text-faint" />
            <div class="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
              <For each={crumbs()}>
                {(crumb, index) => (
                  <>
                    <button
                      type="button"
                      class="shrink-0 cursor-pointer whitespace-nowrap text-11-medium transition-colors hover:text-v2-text-text-base"
                      classList={{
                        "text-v2-text-text-base": index() === crumbs().length - 1,
                        "text-v2-text-text-faint": index() !== crumbs().length - 1,
                      }}
                      onClick={() => navigate(crumb.dir)}
                    >
                      {crumb.label}
                    </button>
                    <Show when={index() < crumbs().length - 1}>
                      <Icon name="chevron-right" size="small" class="shrink-0 text-v2-text-text-faint" />
                    </Show>
                  </>
                )}
              </For>
            </div>
            <IconButton
              type="button"
              icon="arrow-up"
              size="small"
              variant="ghost"
              aria-label="上一级"
              disabled={!currentDir()}
              onClick={() => navigate(parentOf(currentDir()))}
            />
          </div>
          <div class="flex gap-1 px-1">
            <Button type="button" size="small" variant="secondary" icon="folder-add-left" class="flex-1" onClick={() => createEntry("folder")}>
              新建文件夹
            </Button>
            <Button type="button" size="small" variant="secondary" icon="plus-small" class="flex-1" onClick={() => createEntry("file")}>
              新建文件
            </Button>
          </div>
          <div class="px-1">
            <Button
              type="button"
              size="small"
              variant="ghost"
              icon="cloud-upload"
              class="w-full justify-start"
              disabled={uploading()}
              onClick={() => fileInput?.click()}
            >
              {uploading() ? "上传中…" : "上传文件"}
            </Button>
            <input
              ref={fileInput}
              type="file"
              multiple
              class="hidden"
              onChange={(event) => void uploadFiles(Array.from(event.currentTarget.files ?? []))}
            />
          </div>
          <div class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
            <Show
              when={entries.loading}
              fallback={
                <Show
                  when={entries() && entries()!.length > 0}
                  fallback={<div class="px-2 py-2 text-12-regular text-v2-text-text-faint">空文件夹</div>}
                >
                  <For each={entries()}>
                    {(node) => {
                      const fullPath = joinPath(currentDir(), node.name)
                      return (
                        <div
                          class="group flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-v2-background-bg-base"
                          classList={{
                            "bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]": activePath() === node.name,
                          }}
                        >
                          <button
                            type="button"
                            class="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
                            onClick={() => {
                              if (node.type === "directory") navigate(fullPath)
                              else setSelected(node.name)
                            }}
                          >
                            <Icon
                              name={node.type === "directory" ? "folder" : "open-file"}
                              size="small"
                              class="shrink-0 text-v2-text-text-faint"
                            />
                            <span class="min-w-0 flex-1 truncate text-12-regular text-v2-text-text-base">{node.name}</span>
                          </button>
                          <IconButton
                            type="button"
                            icon="circle-x"
                            size="small"
                            variant="ghost"
                            aria-label={`删除 ${node.name}`}
                            class="opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={() => confirmDelete({ fullPath, name: node.name, type: node.type })}
                          />
                        </div>
                      )
                    }}
                  </For>
                </Show>
              }
            >
              <div class="px-2 py-2 text-12-regular text-v2-text-text-faint">加载中…</div>
            </Show>
          </div>
        </div>

        {/* [论文助手定制] 右侧预览区（relative 供 iframe 绝对定位撑满） */}
        <div class="relative min-w-0 flex-1 overflow-hidden rounded-[10px] bg-v2-background-bg-layer-01">
          <Show when={activePath()} fallback={<div class="p-4 text-13-regular text-v2-text-text-faint">选择左侧文件即可预览</div>}>
            {/* [论文助手定制] 编辑视图：md/txt 点击「编辑」后显示，保存调 thesisWriteFile 写回。 */}
            <Show
              when={editingActive()}
              fallback={
                <Show
                  when={preview.loading}
                  fallback={
                    <Show when={preview.error} fallback={<Show when={preview()}>{(result) => renderPreview(result(), resolvedMarkdown(), (text) => startEdit(joinPath(currentDir(), activePath()!), text))}</Show>}>
                      <div class="p-4 text-13-regular text-icon-critical-base">读取失败：{errorMessage(preview.error)}</div>
                    </Show>
                  }
                >
                  <div class="flex items-center gap-2 p-4 text-13-regular text-v2-text-text-faint">
                    <span class="size-3 animate-spin rounded-full border-2 border-v2-border-border-focus border-t-transparent" />
                    加载中…
                  </div>
                </Show>
              }
            >
              <div class="flex h-full flex-col">
                <PreviewToolbar filename={basename(editing()!.path)}>
                  <Button type="button" size="small" variant="ghost" onClick={() => setEditing(undefined)}>
                    取消
                  </Button>
                  <Button type="button" size="small" variant="primary" icon="check" disabled={saving()} onClick={() => void saveEdit()}>
                    {saving() ? "保存中…" : "保存"}
                  </Button>
                </PreviewToolbar>
                {/* [论文助手定制] md：左右分屏——左侧编辑源码（渲染前版本），右侧实时渲染预览（渲染后版本）。 */}
                <Show
                  when={isMarkdownEditing()}
                  fallback={
                    <textarea
                      class="min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-13-regular leading-relaxed text-v2-text-text-base outline-none"
                      value={editText()}
                      onInput={(event) => setEditText(event.currentTarget.value)}
                      placeholder="在此输入内容…"
                    />
                  }
                >
                  <div class="flex min-h-0 flex-1">
                    <div class="min-h-0 w-1/2">
                      <textarea
                        class="h-full w-full resize-none bg-transparent p-3 font-mono text-13-regular leading-relaxed text-v2-text-text-base outline-none"
                        value={editText()}
                        onInput={(event) => setEditText(event.currentTarget.value)}
                        placeholder="在此输入 Markdown 源码…"
                      />
                    </div>
                    <div class="min-h-0 w-1/2 overflow-y-auto border-l border-v2-border-border-base p-3">
                      <Markdown text={resolvedEditText() ?? editText()} />
                    </div>
                  </div>
                </Show>
              </div>
            </Show>
          </Show>
        </div>
      </div>
  )
}



// [论文助手定制] 悬浮弹窗版文件空间：工作台侧边栏等场景弹出使用（保留原入口）。
export function ThesisManuscriptDialog(props: { directory: string }) {
  return (
    <Dialog title="文件空间" description="项目文件统一管理：可新建文件夹 / 文件、上传，点击文件即可预览" size="x-large">
      <ThesisFileManager directory={props.directory} />
    </Dialog>
  )
}

// [论文助手定制] 整页版文件空间：独立路由打开，空间更大，方便查看图片与长文本。
export function ThesisFilesPage(props: { directory: string; onBack: () => void }) {
  return (
    // [论文助手定制] 整页不滚动：min-h-0 + flex-1 + self-stretch 撑满路由容器，内容区内部滚动。
    <div class="flex min-h-0 flex-1 self-stretch flex-col">
      <div class="flex shrink-0 items-center gap-2 border-b border-v2-border-border-base px-4 py-2.5">
        <Button type="button" size="small" variant="ghost" icon="arrow-left" onClick={props.onBack}>
          返回工作台
        </Button>
        <Icon name="folder" size="small" class="text-v2-text-text-base" />
        <span class="text-13-medium text-v2-text-text-base">文件空间</span>
      </div>
      {/* [论文助手定制] 内容区必须是 flex 容器（flex-col），ThesisFileManager 的 flex-1 才能撑满整页高度，
          否则高度按文件/图片内容走，没有内容时页面下方会空出一截。 */}
      <div class="flex min-h-0 flex-1 flex-col pt-3">
        <ThesisFileManager directory={props.directory} />
      </div>
    </div>
  )
}

function renderPreview(result: ManuscriptPreview, resolvedMarkdown?: string, onEdit?: (text: string) => void) {
  switch (result.kind) {
    case "markdown":
      // [论文助手定制] md：面板内 Markdown 预览 + 顶部「编辑」「本地查看」按钮。
      return (
        <div class="flex h-full flex-col">
          <PreviewToolbar filename={result.filename}>
            {/* [论文助手定制] 编辑入口：点击进入文本编辑，保存写回文件。 */}
            <Show when={onEdit}>
              <Button type="button" size="small" variant="secondary" icon="pencil-line" onClick={() => onEdit?.(result.text)}>
                编辑
              </Button>
            </Show>
            <LocalViewButton onClick={() => downloadBlob(new Blob([result.text], { type: "text/markdown" }), result.filename)} />
          </PreviewToolbar>
          <div class="min-h-0 flex-1 overflow-y-auto p-3">
            <Markdown text={resolvedMarkdown ?? result.text} />
          </div>
        </div>
      )
    case "text":
      // [论文助手定制] txt：面板内纯文本预览 + 顶部「编辑」「本地查看」按钮。
      return (
        <div class="flex h-full flex-col">
          <PreviewToolbar filename={result.filename}>
            {/* [论文助手定制] 编辑入口：点击进入文本编辑，保存写回文件。 */}
            <Show when={onEdit}>
              <Button type="button" size="small" variant="secondary" icon="pencil-line" onClick={() => onEdit?.(result.text)}>
                编辑
              </Button>
            </Show>
            <LocalViewButton onClick={() => downloadBlob(new Blob([result.text], { type: "text/plain" }), result.filename)} />
          </PreviewToolbar>
          <pre class="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap p-3 text-13-regular text-v2-text-text-base">{result.text}</pre>
        </div>
      )
    case "image":
      // [论文助手定制] 图片：面板内直接预览 + 「本地查看」下载按钮。
      // 尺寸适配预览区（max-w-full / max-h-full + object-contain），图片超出时预览区内部滚动，不撑破整页。
      return (
        <div class="flex h-full flex-col">
          <PreviewToolbar filename={result.filename}>
            <LocalViewButton onClick={() => downloadBytes(result.bytes, result.filename, mimeOf(result.filename))} />
          </PreviewToolbar>
          <div class="flex min-h-0 flex-1 items-center justify-center overflow-y-auto overflow-x-auto p-3">
            <img src={result.dataUrl} alt={result.filename} class="max-h-full max-w-full rounded-md object-contain" />
          </div>
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
