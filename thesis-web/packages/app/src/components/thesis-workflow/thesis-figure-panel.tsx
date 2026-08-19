// [论文助手定制] Step 2「辅助写作」的插图管理面板：
// 图片统一在主页「资料」上传，这里从「资料」引用已有图片为插图（![图注](asset://materials/<名字>)），
// 并可编辑图注、删除引用。缩略图从 asset:// 解析为本机 data URL 显示（见 thesis-assets.ts）。
import { Icon } from "@opencode-ai/ui/icon"
import { createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js"
import type { FileNode } from "@opencode-ai/sdk/v2/client"
import { useSDK } from "@/context/sdk"
import { showToast } from "@/utils/toast"
import { cachedDataUrl, ensureFigureDataUrls, IMAGE_EXTENSIONS, MATERIALS_DIR, type Figure } from "./thesis-assets"

const errorMessage = (err: unknown) => {
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message)
  return String(err)
}

const isImageName = (name: string) =>
  (IMAGE_EXTENSIONS as readonly string[]).includes(name.split(".").pop()?.toLowerCase() ?? "")

// [论文助手定制] 可被 asset:// 标记引用的名字：不含空格/括号，避免破坏 Markdown 图片标记解析。
const isReferenceableName = (name: string) => /^[^[\]()\s]+$/.test(name)

export function ThesisFigurePanel(props: {
  directory: string
  figures: Figure[]
  busy: boolean
  onInsertMaterial: (name: string) => Promise<void>
  onRename: (ref: string, alt: string) => Promise<void>
  onRemove: (ref: string) => Promise<void>
}) {
  const sdk = useSDK()
  const [drafts, setDrafts] = createSignal<Record<string, string>>({})
  const [thumbsTick, setThumbsTick] = createSignal(0)

  // [论文助手定制] 「资料」目录里的图片文件，可直接引用为插图。
  const [materialImages] = createResource(
    () => props.directory,
    async (directory) => {
      if (!directory) return []
      try {
        const res = await sdk().client.file.list({ directory, path: MATERIALS_DIR })
        if (res.error) return []
        return (res.data ?? [])
          .filter(
            (node): node is FileNode & { type: "file" } =>
              node.type === "file" && isImageName(node.name) && isReferenceableName(node.name),
          )
          .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))
      } catch {
        return []
      }
    },
  )

  // [论文助手定制] 缩略图 data URL：先确保所有引用文件已缓存，异步回来后刷新一次。
  createEffect(() => {
    const refs = props.figures.map((figure) => figure.ref)
    const key = `${props.directory}\u0000${refs.join(",")}`
    void (async () => {
      try {
        await ensureFigureDataUrls(sdk(), props.directory, refs)
      } catch {
        // 读图失败不阻塞交互，缩略图显示 alt 文本兜底。
      }
      if (`${props.directory}\u0000${props.figures.map((figure) => figure.ref).join(",")}` === key) {
        setThumbsTick((count) => count + 1)
      }
    })()
  })

  const thumbs = createMemo(() => {
    const _ = thumbsTick()
    return new Map(props.figures.map((figure) => [figure.ref, cachedDataUrl(props.directory, figure.ref) ?? ""]))
  })

  const insertMaterial = async (name: string) => {
    if (!name) return
    try {
      await props.onInsertMaterial(name)
    } catch (err) {
      showToast({ variant: "error", icon: "circle-x", title: "引用插图失败", description: errorMessage(err) })
    }
  }

  const draftOf = (ref: string) => drafts()[ref] ?? props.figures.find((figure) => figure.ref === ref)?.alt ?? ""

  const commitAlt = async (figure: Figure) => {
    const value = draftOf(figure.ref).trim()
    if (!value || value === figure.alt) return
    try {
      await props.onRename(figure.ref, value)
    } catch (err) {
      showToast({ variant: "error", icon: "circle-x", title: "保存图注失败", description: errorMessage(err) })
    }
  }

  const removeFigure = async (ref: string) => {
    try {
      await props.onRemove(ref)
      setDrafts((prev) => {
        const { [ref]: _dropped, ...rest } = prev
        return rest
      })
    } catch (err) {
      showToast({ variant: "error", icon: "circle-x", title: "删除插图失败", description: errorMessage(err) })
    }
  }

  return (
    <section class="flex flex-col gap-1.5">
      <span class="text-12-medium text-v2-text-text-base">插图</span>
      <Show when={materialImages.loading}>
        <div class="text-11-regular text-v2-text-text-faint">加载「资料」图片…</div>
      </Show>
      <Show when={!materialImages.loading && (!materialImages() || materialImages()!.length === 0)}>
        <div class="flex items-start gap-1.5 rounded-md bg-v2-background-bg-layer-01 px-2.5 py-2 text-11-regular text-v2-text-text-faint">
          <Icon name="folder-add-left" size="small" class="mt-0.5 shrink-0" />
          资料里还没有图片，可在主页「资料」上传（支持 png/jpg/gif/webp/bmp/svg）。
        </div>
      </Show>
      <Show when={materialImages() && materialImages()!.length > 0}>
        <div class="flex items-center gap-1.5 rounded-md bg-v2-background-bg-layer-01 px-2 py-1.5">
          <Icon name="folder-add-left" size="small" class="shrink-0 text-v2-text-text-faint" />
          <select
            class="h-7 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-12-regular text-v2-text-text-base focus:outline-none hover:border-v2-border-border-base"
            disabled={props.busy}
            onChange={(event) => void insertMaterial(event.currentTarget.value)}
          >
            <option value="">从「资料」引用已有图片…</option>
            <For each={materialImages()}>{(node) => <option value={node.name}>{node.name}</option>}</For>
          </select>
        </div>
      </Show>
      <Show when={props.figures.length > 0}>
        <div class="flex flex-col gap-2 rounded-md bg-v2-background-bg-layer-01 p-2">
          <For each={props.figures}>
            {(figure, index) => (
              <div class="flex flex-col gap-1">
                <div class="flex items-center gap-2">
                  <span class="w-7 shrink-0 text-11-medium text-v2-text-text-faint">图{index() + 1}</span>
                  <Show
                    when={thumbs().get(figure.ref)}
                    fallback={<span class="flex size-9 shrink-0 items-center justify-center rounded border border-v2-border-border-base text-11-regular text-v2-text-text-faint">图</span>}
                  >
                    <img
                      src={thumbs().get(figure.ref)}
                      alt={figure.alt}
                      class="size-9 shrink-0 rounded border border-v2-border-border-base object-cover"
                    />
                  </Show>
                  <input
                    type="text"
                    value={draftOf(figure.ref)}
                    disabled={props.busy}
                    class="h-7 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-12-regular text-v2-text-text-base transition-colors focus:border-v2-border-border-focus focus:outline-none hover:border-v2-border-border-base"
                    onChange={(event) => setDrafts((prev) => ({ ...prev, [figure.ref]: event.currentTarget.value }))}
                    onBlur={() => void commitAlt(figure)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur()
                    }}
                  />
                  <button
                    type="button"
                    class="flex shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-11-regular text-v2-text-text-faint transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-icon-critical-base"
                    disabled={props.busy}
                    onClick={() => void removeFigure(figure.ref)}
                  >
                    <Icon name="trash" size="small" />
                    删除
                  </button>
                </div>
                {/* [论文助手定制] 占位标记：会话里手动输入时直接复制/粘贴这段即可（全选态）。 */}
                <span class="block select-all truncate pl-9 font-mono text-10-regular leading-normal text-v2-text-text-faint">
                  {figure.marker}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </section>
  )
}