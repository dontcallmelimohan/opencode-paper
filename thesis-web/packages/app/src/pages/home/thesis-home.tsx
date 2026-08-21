import { type FileNode, type Project, type SessionV2Info } from "@opencode-ai/sdk/v2/client"
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { TextField } from "@opencode-ai/ui/text-field"
import { useTheme } from "@opencode-ai/ui/theme/context"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { useNavigate } from "@solidjs/router"
import { DateTime } from "luxon"
import { For, Show, createResource, createSignal, onCleanup, startTransition } from "solid-js"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { useSettingsDialog } from "@/components/settings-dialog"
import {
  base64ToBytes,
  basename,
  downloadBytes,
  errorMessage,
  extension,
} from "@/components/thesis-workflow/thesis-manuscript-preview"
import { dataUrlOf, IMAGE_EXTENSIONS, mimeOf } from "@/components/thesis-workflow/thesis-assets"
import { debugToolsVisible, setDebugToolsVisible } from "@/utils/debug-tools"
import { useGlobal } from "@/context/global"
import { useLayout } from "@/context/layout"
import { ServerConnection, useServer } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useTabs } from "@/context/tabs"
import { showToast } from "@/utils/toast"

const THESIS_QUERY_KEY = ["thesis", "projects"] as const

const thesisErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: unknown }).data
    if (data && typeof data === "object" && "message" in data) return String((data as { message: unknown }).message)
    if (data && typeof data === "object" && "data" in data) {
      const inner = (data as { data?: unknown }).data
      if (inner && typeof inner === "object" && "message" in inner) return String((inner as { message: unknown }).message)
    }
  }
  if (error instanceof Error) return error.message
  return fallback
}

const isPdf = (entry: { name: string }) => /\.pdf$/i.test(entry.name)

export const thesisName = (thesis: Project) => thesis.name?.trim() || thesis.worktree.split("/").pop() || thesis.worktree

// [论文助手定制] 论文卡片时间：优先用后端算好的 contentUpdatedAt（正文/资料里文件的最新修改时间，
// 真正“编辑过”才会变化）；没编辑过的项目回退到创建时间。不再用 project.time.updated——
// 那会在每次打开项目时被后端 fromDirectory 刷新，导致“没编辑却显示刚刚”。
export type ThesisWithContentTime = Project & { contentUpdatedAt?: number }
export const thesisUpdatedAt = (thesis: ThesisWithContentTime) =>
  thesis.contentUpdatedAt || thesis.time.created || thesis.time.updated || 0

function NewThesisDialog(props: { onCreated: (project: Project) => void }) {
  const dialog = useDialog()
  const sdk = useServerSDK()
  const queryClient = useQueryClient()
  const [title, setTitle] = createSignal("")
  const [error, setError] = createSignal<string | undefined>(undefined)

  const create = useMutation(() => ({
    mutationFn: async () => {
      const value = title().trim()
      if (!value) throw new Error("请输入论文标题")
      const res = await sdk().client.instance.thesisCreate({ title: value })
      if (res.error) throw new Error(thesisErrorMessage(res.error, "创建论文失败"))
      return res.data!
    },
    onSuccess: (project) => {
      dialog.close()
      void queryClient.invalidateQueries({ queryKey: THESIS_QUERY_KEY })
      props.onCreated(project)
      showToast({ variant: "success", icon: "circle-check", title: `已创建论文「${thesisName(project)}」` })
    },
    onError: (err) => setError(err instanceof Error ? err.message : String(err)),
  }))

  return (
    <Dialog title="新建论文" description="为论文创建独立工作空间，之后可上传参考资料并开始写作。">
      <form
        class="flex flex-col gap-4 px-2.5 pb-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (create.isPending) return
          setError(undefined)
          create.mutate()
        }}
      >
        <TextField
          type="text"
          label="论文标题"
          placeholder="请输入论文标题"
          value={title()}
          autofocus
          validationState={error() ? "invalid" : "valid"}
          error={error()}
          disabled={create.isPending}
          onChange={(value) => setTitle(value)}
        />
        <div class="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => dialog.close()}>
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {create.isPending ? "创建中…" : "创建并开始写作"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

// [论文助手定制] 资料预览（内嵌在资料弹窗里显示，不开新弹窗——dialog.show 会替换当前弹窗）：
// md/txt 直接渲染内容，图片内嵌预览，pdf 提供「本地查看 / 新标签页打开」，docx 提供「本地查看（下载）」，
// 其它格式提示暂不支持但仍可下载。
function MaterialPreviewBody(props: { thesis: Project; path: string; onBack: () => void }) {
  const sdk = useServerSDK()
  let lastPdfUrl: string | undefined
  const [preview] = createResource(() => props.path, async (path) => {
    if (lastPdfUrl) {
      URL.revokeObjectURL(lastPdfUrl)
      lastPdfUrl = undefined
    }
    const res = await sdk().client.file.read({ directory: props.thesis.worktree, path })
    if (res.error) throw new Error(errorMessage(res.error))
    const data = res.data
    if (!data) throw new Error("读取文件失败")
    const filename = basename(path)
    if (data.type === "text") {
      return extension(path) === "md"
        ? { kind: "markdown" as const, text: data.content, filename }
        : { kind: "text" as const, text: data.content, filename }
    }
    const bytes = base64ToBytes(data.content ?? "")
    const ext = extension(path)
    // [论文助手定制] 图片资料直接内嵌预览（与 Step 2 插图面板同一套 data URL 构造）。
    if ((IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
      return { kind: "image" as const, dataUrl: dataUrlOf(path, data.content ?? ""), filename, bytes }
    }
    if (ext === "docx") return { kind: "docx" as const, bytes, filename }
    if (ext === "pdf") {
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }))
      lastPdfUrl = url
      return { kind: "pdf" as const, url, filename, bytes }
    }
    return { kind: "unsupported" as const, reason: `暂不支持预览 .${ext} 文件，可下载后用本地软件查看`, filename, bytes }
  })
  onCleanup(() => {
    if (lastPdfUrl) URL.revokeObjectURL(lastPdfUrl)
  })

  return (
    <div class="flex min-h-0 flex-col gap-3">
      <div class="flex items-center justify-between gap-2">
        <Button size="small" variant="ghost" icon="arrow-left" onClick={props.onBack}>
          返回文件列表
        </Button>
        <Show when={preview()}>
          <span class="min-w-0 truncate text-12-regular text-v2-text-text-faint">{preview()?.filename}</span>
        </Show>
      </div>
      <Show when={preview.state === "ready" && preview()} fallback={
        <div class="py-10 text-center text-12-regular text-v2-text-text-faint">
          {preview.error ? `读取失败：${errorMessage(preview.error)}` : "加载中…"}
        </div>
      }>
        {(() => {
          const item = preview()!
          if (item.kind === "markdown") {
            return (
              <>
                <div class="flex items-center justify-end gap-2">
                  <Button size="small" variant="ghost" icon="download" onClick={() => downloadBytes(new TextEncoder().encode(item.text), item.filename, "text/markdown")}>
                    本地查看
                  </Button>
                </div>
                <div class="min-h-0 flex-1 overflow-y-auto rounded-md border border-v2-border-border-base p-3">
                  <Markdown text={item.text} cacheKey={item.text} class="text-13-regular" />
                </div>
              </>
            )
          }
          if (item.kind === "text") {
            return (
              <>
                <div class="flex items-center justify-end gap-2">
                  <Button size="small" variant="ghost" icon="download" onClick={() => downloadBytes(new TextEncoder().encode(item.text), item.filename, "text/plain")}>
                    本地查看
                  </Button>
                </div>
                <pre class="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-md border border-v2-border-border-base p-3 text-13-regular">
                  {item.text}
                </pre>
              </>
            )
          }
          if (item.kind === "pdf") {
            return (
              <div class="flex flex-col items-center gap-3 py-10 text-center">
                <Icon name="open-file" size="large" class="text-v2-text-text-faint" />
                <div class="text-12-regular text-v2-text-text-faint">PDF 请在本地或新标签页中查看</div>
                <div class="flex items-center gap-2">
                  <Button size="small" variant="secondary" icon="download" onClick={() => downloadBytes(item.bytes, item.filename, "application/pdf")}>
                    本地查看
                  </Button>
                  <a href={item.url} target="_blank" rel="noreferrer" class="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-12-medium text-v2-text-text-accent hover:underline">
                    在新标签页打开
                  </a>
                </div>
              </div>
            )
          }
          if (item.kind === "docx") {
            return (
              <div class="flex flex-col items-center gap-3 py-10 text-center">
                <Icon name="open-file" size="large" class="text-v2-text-text-faint" />
                <div class="text-12-regular text-v2-text-text-faint">docx 文件请在本地查看（下载后用 Word/WPS 打开）</div>
                <Button size="small" variant="secondary" icon="download" onClick={() => downloadBytes(item.bytes, item.filename, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}>
                  本地查看
                </Button>
              </div>
            )
          }
          if (item.kind === "image") {
            return (
              <div class="flex min-h-0 flex-col gap-2">
                <div class="flex items-center justify-end gap-2">
                  <Button size="small" variant="ghost" icon="download" onClick={() => downloadBytes(item.bytes, item.filename, mimeOf(props.path))}>
                    下载图片
                  </Button>
                </div>
                <div class="min-h-0 flex-1 overflow-y-auto rounded-md border border-v2-border-border-base p-2">
                  <img src={item.dataUrl} alt={item.filename} class="mx-auto max-h-full max-w-full object-contain" />
                </div>
              </div>
            )
          }
          return (
            <div class="flex flex-col items-center gap-3 py-10 text-center">
              <Icon name="circle-x" size="large" class="text-v2-text-text-faint" />
              <div class="text-12-regular text-v2-text-text-faint">{item.reason}</div>
              <Button size="small" variant="secondary" icon="download" onClick={() => downloadBytes(item.bytes, item.filename, "application/octet-stream")}>
                下载文件
              </Button>
            </div>
          )
        })()}
      </Show>
    </div>
  )
}

// [论文助手定制] 资料删除确认（内嵌在资料弹窗里显示）：调 /thesis/material-delete 删除文件
// （PDF 时其提取文本也一并删除），成功后刷新资料列表。
function MaterialDeleteBody(props: { thesis: Project; name: string; onDone: () => void; onCancel: () => void }) {
  const sdk = useServerSDK()
  const queryClient = useQueryClient()
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>(undefined)

  const remove = async () => {
    if (busy()) return
    setBusy(true)
    setError(undefined)
    try {
      const res = await sdk().client.instance.thesisDeleteMaterial({ projectID: props.thesis.id, filename: props.name })
      if (res.error) throw new Error(thesisErrorMessage(res.error, "删除失败"))
      props.onDone()
      void queryClient.invalidateQueries({ queryKey: ["thesis", "materials", props.thesis.id] })
      void queryClient.invalidateQueries({ queryKey: THESIS_QUERY_KEY })
      showToast({ variant: "success", icon: "circle-check", title: `已删除文件「${props.name}」` })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-1.5">
        <div class="text-14-medium text-v2-text-text-strong">删除文件</div>
        <div class="text-13-regular text-v2-text-text-weak">
          确定删除「{props.name}」吗？
          {isPdf({ name: props.name }) ? "若为 PDF，其提取文本也会一并删除。" : ""}删除后不可恢复。
        </div>
      </div>
      <Show when={error()}>
        <div class="text-12-regular text-v2-text-text-error">{error()}</div>
      </Show>
      <div class="flex justify-end gap-2">
        <Button variant="ghost" onClick={props.onCancel}>
          取消
        </Button>
        <Button type="button" variant="primary" icon="circle-x" disabled={busy()} onClick={() => void remove()}>
          {busy() ? "删除中…" : "确认删除"}
        </Button>
      </div>
    </div>
  )
}

export function ThesisUploadDialog(props: { thesis: Project }) {
  const dialog = useDialog()
  const sdk = useServerSDK()
  const queryClient = useQueryClient()
  let fileInput: HTMLInputElement | undefined
  const [selected, setSelected] = createSignal<File[]>([])
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>(undefined)
  // [论文助手定制] 资料弹窗内部视图切换：预览某文件 / 删除某文件（不新开弹窗，避免 dialog.show 替换当前弹窗）。
  const [previewPath, setPreviewPath] = createSignal<string | undefined>(undefined)
  const [deleteName, setDeleteName] = createSignal<string | undefined>(undefined)

  // [论文助手定制] 文件空间：平铺列出项目根目录的上传文件（正文已并入工作台「文件空间」按目录浏览）。
  const materials = useQuery(() => ({
    queryKey: ["thesis", "materials", props.thesis.id],
    queryFn: async () => {
      let files: FileNode[] = []
      try {
        const rootRes = await sdk().client.file.list({ directory: props.thesis.worktree, path: "" })
        files = (rootRes.data ?? [])
          .filter((node): node is FileNode & { type: "file" } => node.type === "file")
          // [论文助手定制] 过滤 .gitignore 等隐藏文件，只展示用户上传的可见文件。
          .filter((node) => !node.name.startsWith("."))
      } catch {
        files = []
      }
      return files
    },
  }))

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

  const [extracting, setExtracting] = createSignal<string | undefined>(undefined)

  async function extractText(filename: string) {
    if (extracting()) return
    setExtracting(filename)
    setError(undefined)
    try {
      const res = await sdk().client.instance.thesisPdfText({ projectID: props.thesis.id, filename })
      if (res.error) throw new Error(thesisErrorMessage(res.error, "提取文本失败"))
      void queryClient.invalidateQueries({ queryKey: ["thesis", "materials", props.thesis.id] })
      showToast({
        variant: "success",
        icon: "circle-check",
        title: `已提取「${filename}」的文本`,
        description: res.data ? `共 ${res.data.chars} 字，已存为 ${res.data.filename}` : undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setExtracting(undefined)
    }
  }

  async function upload() {
    setError(undefined)
    setBusy(true)
    try {
      const files = selected()
      for (const file of files) {
        const content = await toBase64(file)
        const res = await sdk().client.instance.thesisUpload({
          projectID: props.thesis.id,
          filename: file.name,
          content,
        })
        if (res.error) throw new Error(thesisErrorMessage(res.error, "上传文件失败"))
      }
      let extracted = 0
      for (const file of files.filter((file) => isPdf(file))) {
        const res = await sdk().client.instance.thesisPdfText({ projectID: props.thesis.id, filename: file.name })
        if (!res.error) extracted += 1
      }
      dialog.close()
      void queryClient.invalidateQueries({ queryKey: ["thesis", "materials", props.thesis.id] })
      void queryClient.invalidateQueries({ queryKey: THESIS_QUERY_KEY })
      showToast({
        variant: "success",
        icon: "circle-check",
        title: extracted > 0 ? `已上传 ${files.length} 个文件并提取 ${extracted} 个 PDF 文本` : `已上传 ${files.length} 个文件`,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="文件空间" description={`${thesisName(props.thesis)} · 上传的文件将存放在项目根目录`}>
      <div class="flex max-h-[65vh] min-h-[45vh] flex-col gap-4 overflow-y-auto px-2.5 pb-4">
        <Show when={previewPath()}>
          <MaterialPreviewBody thesis={props.thesis} path={previewPath()!} onBack={() => setPreviewPath(undefined)} />
        </Show>
        <Show when={!previewPath() && deleteName()}>
          <MaterialDeleteBody
            thesis={props.thesis}
            name={deleteName()!}
            onDone={() => setDeleteName(undefined)}
            onCancel={() => setDeleteName(undefined)}
          />
        </Show>
        <Show when={!previewPath() && !deleteName()}>
        {/* [论文助手定制] 文件空间：平铺列出已上传文件（可提取文本/查看/删除）。 */}
        <div class="flex flex-col gap-1.5">
          <div class="text-13-regular text-v2-text-text-weak">已上传文件</div>
          <Show
            when={materials.data && materials.data.length > 0}
            fallback={<div class="text-13-regular text-v2-text-text-weak">暂无文件，点击下方上传</div>}
          >
            <ul class="flex flex-col gap-1">
              <For each={materials.data}>
                {(entry) => (
                  <li class="flex items-center gap-2 text-13-regular text-v2-text-text-strong">
                    <Icon name="folder-add-left" size="small" class="shrink-0" />
                    <span class="min-w-0 flex-1 truncate">{entry.name}</span>
                    <Show when={isPdf(entry)}>
                      <button
                        type="button"
                        class="shrink-0 cursor-pointer text-12-regular text-v2-accent-accent-strong hover:underline disabled:cursor-wait disabled:opacity-60"
                        disabled={extracting() !== undefined}
                        onClick={() => extractText(entry.name)}
                      >
                        {extracting() === entry.name ? "提取中…" : "提取文本"}
                      </button>
                    </Show>
                    {/* [论文助手定制] 文件操作：查看（预览 md/txt/pdf/docx/图片）+ 删除（确认后删除文件）。 */}
                    <IconButton
                      type="button"
                      icon="open-file"
                      size="small"
                      variant="ghost"
                      aria-label={`查看 ${entry.name}`}
                      onClick={() => setPreviewPath(entry.path)}
                    />
                    <IconButton
                      type="button"
                      icon="circle-x"
                      size="small"
                      variant="ghost"
                      aria-label={`删除 ${entry.name}`}
                      onClick={() => setDeleteName(entry.name)}
                    />
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
        <div
          class="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-7 text-center transition-colors"
          classList={{
            "border-v2-accent-accent-strong bg-v2-accent-accent-soft": selected().length > 0,
            "border-v2-border-border-base hover:bg-v2-background-bg-layer-01": selected().length === 0,
          }}
          onClick={() => fileInput?.click()}
        >
          <Icon name="cloud-upload" size="large" />
          <div class="text-13-regular text-v2-text-text-strong">点击选择文件</div>
          <div class="text-12-regular text-v2-text-text-weak">支持 PDF、Word、Markdown、图片等文件（图片可在 Step 2 插图面板引用为论文插图）</div>
          <input
            ref={fileInput}
            type="file"
            multiple
            class="hidden"
            onChange={(event) => setSelected(Array.from(event.currentTarget.files ?? []))}
          />
        </div>
        <Show when={selected().length > 0}>
          <ul class="flex flex-col gap-1">
            <For each={selected()}>
              {(file) => <li class="text-13-regular text-v2-text-text-strong">· {file.name}</li>}
            </For>
          </ul>
        </Show>
        <Show when={error()}>
          <div class="text-13-regular text-icon-critical-base">{error()}</div>
        </Show>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => dialog.close()}>
            取消
          </Button>
          <Button variant="primary" icon="cloud-upload" disabled={busy() || selected().length === 0} onClick={upload}>
            {busy() ? "上传中…" : "上传文件"}
          </Button>
        </div>
      </Show>
      </div>
    </Dialog>
  )
}

function ThesisSessionsDialog(props: { thesis: Project }) {
  const dialog = useDialog()
  const sdk = useServerSDK()
  const global = useGlobal()
  const tabs = useTabs()
  const server = useServer()

  const sessions = useQuery(() => ({
    queryKey: ["thesis", "sessions", props.thesis.id],
    queryFn: async () => {
      const res = await sdk().client.v2.session.list({ directory: props.thesis.worktree, limit: 100 })
      const list = res.data?.data ?? []
      return list.sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
    },
  }))

  function openSession(session: SessionV2Info) {
    const conn = server.current
    if (!conn) return
    const ctx = global.ensureServerCtx(conn)
    ctx.projects.open(session.location.directory)
    ctx.projects.touch(session.location.directory)
    dialog.close()
    void startTransition(() => {
      const tab = tabs.addSessionTab({ server: ServerConnection.key(conn), sessionId: session.id })
      tabs.select(tab)
    })
  }

  return (
    <Dialog title="生成记录" description={`${thesisName(props.thesis)} · 各步生成的聊天记录`}>
      <div class="flex max-h-[65vh] flex-col gap-3 overflow-y-auto px-2.5 pb-4">
        <Show
          when={sessions.data && sessions.data.length > 0}
          fallback={
            <div class="flex flex-col items-center gap-2 py-10 text-center">
              <Icon name="speech-bubble" size="large" class="text-v2-text-text-weak" />
              <div class="text-13-regular text-v2-text-text-weak">还没有生成记录，进入论文工作台生成后这里会出现</div>
            </div>
          }
        >
          <ul class="flex flex-col gap-1.5">
            <For each={sessions.data}>
              {(session) => (
                <li>
                  <button
                    type="button"
                    class="flex w-full cursor-pointer items-center gap-3 rounded-[8px] border border-transparent px-3 py-2.5 text-left transition-colors hover:border-v2-border-border-base hover:bg-v2-background-bg-layer-01"
                    onClick={() => openSession(session)}
                  >
                    <Icon name="speech-bubble" class="shrink-0 text-v2-text-text-weak" />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-13-regular text-v2-text-text-strong">
                        {session.title || "未命名对话"}
                      </span>
                      <span class="block text-12-regular text-v2-text-text-weak">
                        {DateTime.fromMillis(session.time.updated ?? session.time.created).toRelative() ?? ""}
                      </span>
                    </span>
                    <Icon name="chevron-right" size="small" class="shrink-0 text-v2-text-text-faint" />
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => dialog.close()}>
            关闭
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

// [论文助手定制] 删除论文确认框：调后端 /thesis/delete（删除工作区目录 + 数据库记录，不可恢复），
// 成功后刷新主页列表。删除按钮只放在论文卡片上，避免误触。
function ThesisDeleteDialog(props: { thesis: ThesisWithContentTime }) {
  const dialog = useDialog()
  const sdk = useServerSDK()
  const queryClient = useQueryClient()
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>(undefined)

  const remove = async () => {
    if (busy()) return
    setBusy(true)
    setError(undefined)
    try {
      const res = await sdk().client.instance.thesisDelete({ projectID: props.thesis.id })
      if (res.error) throw new Error(thesisErrorMessage(res.error, "删除论文失败"))
      dialog.close()
      void queryClient.invalidateQueries({ queryKey: THESIS_QUERY_KEY })
      showToast({ variant: "success", icon: "circle-check", title: `已删除论文「${thesisName(props.thesis)}」` })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="删除论文"
      description={`确定删除「${thesisName(props.thesis)}」吗？将删除该项目的工作区文件夹、正文、资料与全部生成记录，且不可恢复。`}
    >
      <form
        class="flex flex-col gap-4 px-2.5 pb-4"
        onSubmit={(event) => {
          event.preventDefault()
          void remove()
        }}
      >
        {error() ? <div class="text-12-regular text-v2-text-text-error">{error()}</div> : null}
        <div class="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => dialog.close()}>
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={busy()} icon="trash">
            {busy() ? "删除中…" : "确认删除"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function ThesisHome() {
  const sdk = useServerSDK()
  const server = useServer()
  const serverSync = useServerSync()
  const layout = useLayout()
  const tabs = useTabs()
  const dialog = useDialog()
  const openSettings = useSettingsDialog()
  const theme = useTheme()
  const navigate = useNavigate()

  const home = () => serverSync().data.path.home?.replace(/\/$/, "") ?? ""

  const theses = useQuery(() => ({
    queryKey: [...THESIS_QUERY_KEY, home()],
    queryFn: async () => {
      // [论文助手定制] 列表直接走后端 /thesis/list：后端负责过滤论文工作区项目，
      // 并计算每项的 contentUpdatedAt（正文/资料文件最新修改时间），前端只负责排序显示。
      const res = await sdk().client.instance.thesisList()
      return (res.data ?? []).sort((a, b) => thesisUpdatedAt(b) - thesisUpdatedAt(a))
    },
  }))

  // [论文助手定制] 进入“论文工作台”而不是新建聊天草稿：
  // 论文生产以四步标准化流程为主体，聊天只作为生成记录/辅助查看。
  function startWriting(worktree: string) {
    layout.projects.open(worktree)
    navigate(`/${base64Encode(worktree)}/workbench`)
  }

  return (
    <div class="mx-auto flex h-full w-full max-w-4xl flex-col gap-5 overflow-y-auto px-4 py-6 lg:px-8">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <Icon name="pencil-line" size="large" class="text-v2-text-text-strong" />
          <h1 class="text-20-medium text-v2-text-text-strong">论文助手</h1>
        </div>
        <div class="flex items-center gap-1">
          {/* [论文助手定制] 顶部标题栏已删除，DEV 调试按钮挪到这里：切换底部调试栏（NAV/FPS 统计）显隐。 */}
          <Show when={import.meta.env.DEV}>
            <TooltipV2 placement="bottom" value="调试面板（NAV/FPS 统计）">
              <button
                type="button"
                data-action="home-debug-toggle"
                class="h-7 cursor-pointer rounded-sm bg-icon-interactive-base px-2 font-mono text-xs font-medium uppercase text-[#FFF]"
                aria-label="调试面板"
                aria-pressed={debugToolsVisible()}
                onClick={() => setDebugToolsVisible((value) => !value)}
              >
                DEV
              </button>
            </TooltipV2>
          </Show>
          {/* [论文助手定制] Skill 管理入口：跳转到独立页面 /skills（管理页本身不放在主页）。 */}
          <TooltipV2 placement="bottom" value="Skill 管理">
            <IconButton
              type="button"
              data-action="home-skills"
              icon="dot-grid"
              size="normal"
              variant="ghost"
              aria-label="Skill 管理"
              onClick={() => navigate("/skills")}
            />
          </TooltipV2>
          <TooltipV2 placement="bottom" value="设置">
            <IconButton
              type="button"
              data-action="home-settings"
              icon="settings-gear"
              size="normal"
              variant="ghost"
              aria-label="设置"
              onClick={() => openSettings()}
            />
          </TooltipV2>
          <TooltipV2 placement="bottom" value={theme.mode() === "dark" ? "切换为亮色模式" : "切换为暗色模式"}>
            <IconButton
              type="button"
              data-action="home-theme-toggle"
              icon={theme.mode() === "dark" ? "sun" : "moon"}
              size="normal"
              variant="ghost"
              aria-label={theme.mode() === "dark" ? "切换为亮色模式" : "切换为暗色模式"}
              onClick={() => theme.setColorScheme(theme.mode() === "dark" ? "light" : "dark")}
            />
          </TooltipV2>
          <Button
            size="normal"
            variant="primary"
            icon="plus"
            onClick={() => dialog.show(() => <NewThesisDialog onCreated={(project) => startWriting(project.worktree)} />)}
          >
            新建论文
          </Button>
        </div>
      </div>
      <Show
        when={theses.data && theses.data.length > 0}
        fallback={
          <div class="flex flex-col items-center gap-3 py-20 text-center">
            <Icon name="folder-add-left" size="large" class="text-v2-text-text-weak" />
            <div class="text-14-medium text-v2-text-text-strong">还没有论文</div>
            <div class="text-13-regular text-v2-text-text-weak">点击右上角「新建论文」开始你的第一篇论文</div>
          </div>
        }
      >
        <div class="flex flex-col gap-3">
          <For each={theses.data}>
            {(thesis) => (
              <div class="flex items-center gap-3 rounded-[10px] border border-v2-border-border-base bg-v2-background-bg-layer-01 px-4 py-3">
                <Icon name="folder-add-left" class="shrink-0 text-v2-text-text-weak" />
                {/* [论文助手定制] 点击卡片主体直接进入该论文的「论文工作台」（四步流程），而不是新建聊天 */}
                <button
                  type="button"
                  class="min-w-0 flex-1 cursor-pointer text-left"
                  onClick={() => startWriting(thesis.worktree)}
                >
                  <div class="truncate text-14-medium text-v2-text-text-strong">{thesisName(thesis)}</div>
                  <div class="text-12-regular text-v2-text-text-weak">
                    {DateTime.fromMillis(thesisUpdatedAt(thesis)).toRelative() ?? ""}
                  </div>
                </button>
                <Button
                  size="small"
                  variant="ghost"
                  icon="speech-bubble"
                  onClick={() => dialog.show(() => <ThesisSessionsDialog thesis={thesis} />)}
                >
                  生成记录
                </Button>
                <Button
                  size="small"
                  variant="ghost"
                  icon="cloud-upload"
                  onClick={() => dialog.show(() => <ThesisUploadDialog thesis={thesis} />)}
                >
                  文件空间
                </Button>
                <Button size="small" variant="primary" onClick={() => startWriting(thesis.worktree)}>
                  开始写作
                </Button>
                {/* [论文助手定制] 删除论文：确认后删除工作区与全部记录（不可恢复）。 */}
                <TooltipV2 placement="bottom" value="删除论文">
                  <IconButton
                    type="button"
                    data-action="thesis-delete"
                    icon="trash"
                    size="small"
                    variant="ghost"
                    aria-label="删除论文"
                    onClick={() => dialog.show(() => <ThesisDeleteDialog thesis={thesis} />)}
                  />
                </TooltipV2>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
