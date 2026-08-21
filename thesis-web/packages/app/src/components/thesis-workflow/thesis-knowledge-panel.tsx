// [论文助手定制] 论文知识库管理面板（Step 1 提纲助手内嵌）：
// 在「资料」目录文件之外，支持手写知识条目（草稿、摘录、老师意见等）：
//   - 文件夹分类（筛选）
//   - 搜索（标题/内容/文件名）
//   - 新建 / 编辑 / 删除条目
//   - 勾选条目与文件共同参与提纲生成
// 手写条目存 localStorage（thesis-knowledge-store），文件仍从论文工作区「资料」目录读取。
import { Button } from "@opencode-ai/ui/button"
import { Checkbox } from "@opencode-ai/ui/checkbox"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { TextField } from "@opencode-ai/ui/text-field"
import { createResource, createSignal, For, Show } from "solid-js"
import type { FileNode } from "@opencode-ai/sdk/v2/client"
import { useSDK } from "@/context/sdk"
import { showToast } from "@/utils/toast"
import { useThesisKnowledge, type KnowledgeItem } from "./thesis-knowledge-store"

export function ThesisKnowledgePanel(props: {
  selectedFiles: string[]
  selectedNotes: string[]
  onToggleFile: (path: string) => void
  onToggleNote: (id: string) => void
}) {
  const sdk = useSDK()
  const knowledge = useThesisKnowledge()
  const dialog = useDialog()
  const [category, setCategory] = createSignal("全部")
  const [search, setSearch] = createSignal("")

  // [论文助手定制] 资料目录文件（与原来的知识库材料一致）。
  const [files] = createResource(
    () => sdk().directory,
    async (directory) => {
      if (!directory) return []
      try {
        const res = await sdk().client.file.list({ directory, path: "" })
        if (res.error) return []
        return (res.data ?? []).filter((node): node is FileNode => node.type === "file")
      } catch {
        return []
      }
    },
  )

  const notes = () => {
    const query = search().trim().toLowerCase()
    return knowledge
      .state()
      .items.filter((item) => (category() === "全部" ? true : item.category === category()))
      .filter((item) =>
        query ? item.title.toLowerCase().includes(query) || item.content.toLowerCase().includes(query) : true,
      )
  }

  const visibleFiles = () => {
    const query = search().trim().toLowerCase()
    return (files() ?? []).filter((node) => (query ? node.name.toLowerCase().includes(query) : true))
  }

  const selectedCount = () => props.selectedFiles.length + props.selectedNotes.length

  const openEditor = (item?: KnowledgeItem) => {
    dialog.show(() => <KnowledgeItemDialog item={item} />)
  }

  return (
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <div class="text-12-medium text-v2-text-text-base">知识库材料</div>
        <div class="flex items-center gap-2">
          <span class="text-11-regular text-v2-text-text-faint">{selectedCount()} 条已选</span>
          <Button type="button" size="small" variant="secondary" icon="plus-small" onClick={() => openEditor()}>
            新建条目
          </Button>
        </div>
      </div>

      {/* [论文助手定制] 文件夹筛选 + 搜索 */}
      <div class="flex gap-1.5">
        <select
          class="h-8 min-w-0 flex-1 rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-1.5 text-12-regular text-v2-text-text-base focus:outline-none"
          value={category()}
          onChange={(event) => setCategory(event.currentTarget.value)}
        >
          <option value="全部">全部文件夹</option>
          <For each={knowledge.state().folders}>{(folder) => <option value={folder}>{folder}</option>}</For>
        </select>
        <input
          type="search"
          class="h-8 min-w-0 flex-1 rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-12-regular text-v2-text-text-base placeholder:text-v2-text-text-faint focus:outline-none"
          placeholder="搜索标题、内容、文件名"
          value={search()}
          onInput={(event) => setSearch(event.currentTarget.value)}
        />
      </div>

      <Show
        when={notes().length > 0 || visibleFiles().length > 0}
        fallback={
          <div class="flex items-center gap-1.5 rounded-md bg-v2-background-bg-layer-01 px-2.5 py-2 text-11-regular text-v2-text-text-faint">
            <Icon name="folder-add-left" size="small" />
            知识库暂无可选材料（可新建条目或在主页「资料」上传文件）。
          </div>
        }
      >
        <div class="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-md bg-v2-background-bg-layer-01 p-1.5">
          {/* [论文助手定制] 手写条目列表：勾选 + 编辑 + 删除 */}
          <Show when={notes().length > 0}>
            <For each={notes()}>
              {(item) => (
                <div class="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-v2-background-bg-base">
                  <Checkbox checked={props.selectedNotes.includes(item.id)} onChange={() => props.onToggleNote(item.id)}>
                    <span class="min-w-0 flex-1 truncate">
                      {item.title}
                      <span class="ml-1.5 text-11-regular text-v2-text-text-faint">[{item.category}]</span>
                    </span>
                  </Checkbox>
                  <div class="ml-auto flex shrink-0 items-center gap-0.5">
                    <IconButton type="button" icon="edit-small-2" size="small" variant="ghost" aria-label="编辑" onClick={() => openEditor(item)} />
                    <IconButton
                      type="button"
                      icon="close-small"
                      size="small"
                      variant="ghost"
                      aria-label="删除"
                      onClick={() => {
                        knowledge.removeItem(item.id)
                        if (props.selectedNotes.includes(item.id)) props.onToggleNote(item.id)
                        showToast({ variant: "success", icon: "circle-check", title: "已删除知识条目" })
                      }}
                    />
                  </div>
                </div>
              )}
            </For>
          </Show>
          {/* 资料目录文件列表：勾选 */}
          <Show when={visibleFiles().length > 0}>
            <For each={visibleFiles()}>
              {(node) => (
                <Checkbox checked={props.selectedFiles.includes(node.path)} onChange={() => props.onToggleFile(node.path)}>
                  <span class="min-w-0 truncate">{node.name}</span>
                </Checkbox>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  )
}

// [论文助手定制] 知识条目编辑对话框（模块级组件，避免在渲染函数内定义组件导致状态重置）。
export function KnowledgeItemDialog(props: { item?: KnowledgeItem }) {
  const knowledge = useThesisKnowledge()
  const dialog = useDialog()
  const [title, setTitle] = createSignal(props.item?.title ?? "")
  const [category, setCategory] = createSignal(props.item?.category ?? knowledge.state().folders[0] ?? "默认文件夹")
  const [content, setContent] = createSignal(props.item?.content ?? "")

  const save = () => {
    if (!content().trim()) {
      showToast({ variant: "error", icon: "circle-x", title: "内容不能为空" })
      return
    }
    if (props.item) {
      knowledge.updateItem(props.item.id, { title: title(), category: category(), content: content() })
      showToast({ variant: "success", icon: "circle-check", title: "知识条目已更新" })
    } else {
      knowledge.addItem({ title: title(), category: category(), content: content() })
      showToast({ variant: "success", icon: "circle-check", title: "知识条目已保存" })
    }
    dialog.close()
  }

  return (
    <Dialog title={props.item ? "编辑知识条目" : "新建知识条目"} description="手写草稿、文献摘录、老师意见等，可勾选参与提纲生成。">
      <form
        class="flex w-[520px] max-w-full flex-col gap-4 px-2.5 pb-4"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <TextField
          type="text"
          label="标题"
          placeholder="例如：导师对第一章的意见"
          value={title()}
          autofocus
          onChange={(value) => setTitle(value)}
        />
        <div class="flex flex-col gap-1.5">
          <label class="text-12-medium text-v2-text-text-base">文件夹</label>
          <select
            class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
            value={category()}
            onChange={(event) => setCategory(event.currentTarget.value)}
          >
            <For each={knowledge.state().folders}>{(folder) => <option value={folder}>{folder}</option>}</For>
          </select>
        </div>
        <TextField
          multiline
          label="内容"
          placeholder="粘贴摘要、摘录或写下老师意见…"
          value={content()}
          onChange={(value) => setContent(value)}
        />
        <div class="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => dialog.close()}>
            取消
          </Button>
          <Button type="submit" variant="primary">
            保存
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
