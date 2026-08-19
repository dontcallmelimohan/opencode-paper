// [论文助手定制] 论文工作台产物区域的「会话」视图：
// 在展示文稿的同一个位置显示该论文专属会话的聊天记录，并支持直接继续对话：
//   - 底部输入框：与主会话页同款完整对话框（PromptInputV2），带模型选择、skill 选择、
//     @引用/附件等；发送后复用该论文的专属会话（还没有则自动创建），模型回复流式显示；
//   - 每条助手消息可「存为当前文稿」：把该回复采纳为当前步骤的产物，支持反复修改迭代。
import { Icon } from "@opencode-ai/ui/icon"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { createAutoScroll } from "@opencode-ai/ui/hooks"
import { Message } from "@opencode-ai/session-ui/message-part"
import { createEffect, createMemo, createResource, For, onMount, Show } from "solid-js"
import type { AssistantMessage } from "@opencode-ai/sdk/v2"
import type { FileNode } from "@opencode-ai/sdk/v2/client"
import { PromptInputV2Composer, usePromptInputV2Controller } from "@/components/prompt-input-v2"
import { usePrompt, type ContentPart } from "@/context/prompt"
import { useServerSync } from "@/context/server-sync"
import { useLocal } from "@/context/local"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { createPromptInputController } from "@/pages/session/composer"
import { createPromptModelSelection } from "@/pages/session/composer/prompt-model-selection"
import { useSessionKey } from "@/pages/session/session-layout"
import { useComposerCommands } from "@/pages/session/use-composer-commands"
import { showToast } from "@/utils/toast"
import { normalizeSessionMessages } from "@/utils/session-message"
import { useThesisManuscriptFile } from "./thesis-manuscript-file"
import { useThesisWorkflow } from "./thesis-workflow-store"
import { figureMarker, IMAGE_EXTENSIONS, MATERIALS_DIR } from "./thesis-assets"

const isImageName = (name: string) =>
  (IMAGE_EXTENSIONS as readonly string[]).includes(name.split(".").pop()?.toLowerCase() ?? "")

// [论文助手定制] 可被 asset:// 标记引用的名字：不含空格/括号，避免破坏 Markdown 图片标记解析。
const isReferenceableName = (name: string) => /^[^[\]()\s]+$/.test(name)

export function ThesisSessionView() {
  const sdk = useSDK()
  const sync = useSync()
  const local = useLocal()
  const serverSync = useServerSync()
  const { state, setSessionID, setStepResult } = useThesisWorkflow()
  // [论文助手定制] 与输入框共享的全局 prompt store：插入插图标记时直接追加一个文本 part。
  const prompt = usePrompt()
  // [论文助手定制] 文稿文件化：会话里「存为当前文稿」时同样落盘到 正文/<step>.md。
  const manuscript = useThesisManuscriptFile(sdk().directory)
  const sessionID = () => state().sessionID
  const route = useSessionKey()

  // [论文助手定制] 「资料」目录里的图片，供输入框「插入插图」下拉选择（过滤规则与插图面板一致）。
  const [materialImages] = createResource(
    () => sdk().directory,
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

  // [论文助手定制] 把选中图片的占位标记插入输入框（追加到最后一个文本 part 末尾，光标移到末尾），
  // 图注默认用文件名，发送前可在输入框里按需改写。
  const insertMarker = (name: string) => {
    if (!name) return
    const marker = figureMarker(`materials/${name}`, name.replace(/\.[^.]+$/, ""))
    const parts = prompt.current()
    const last = parts[parts.length - 1]
    const content = last?.type === "text" ? `${last.content}${last.content && !last.content.endsWith("\n") ? "\n" : ""}${marker}` : marker
    const part: ContentPart =
      last?.type === "text"
        ? { ...last, content, start: content.length, end: content.length }
        : { type: "text", content, start: content.length, end: content.length }
    const next: ContentPart[] = last?.type === "text" ? [...parts.slice(0, -1), part] : [...parts, part]
    prompt.set(next, content.length)
    showToast({ variant: "success", icon: "circle-check", title: "已插入插图标记", description: marker })
  }

  // [论文助手定制] 复用主会话页的自动滚动 Hook：内容渲染完成后（ResizeObserver 在布局后触发）
  // 自动保持底部，用户上翻时暂停跟随，回到底部后恢复。这样每次切到「会话」视图都会定位到最底部，
  // 生成中的流式内容增长也不会把视图留在顶部。
  const autoScroll = createAutoScroll({ working: () => true, overflowAnchor: "none" })

  // [论文助手定制] 与主会话页一致的模型选择器（读取当前 agent 的配置模型，支持最近使用/回退）。
  const model = createPromptModelSelection({ agent: () => local.agent.current() })
  // [论文助手定制] 注册输入框快捷键/命令（模型选择、agent 循环等），与主会话页保持一致。
  useComposerCommands({ model })

  // [论文助手定制] 完整输入框控制器：agent/skill 列表、模型、会话信息都从这里取；
  // sessionKey 用工作区级 key（路由里没有会话 id），sessionID 直接用论文工作流的专属会话。
  const controls = createPromptInputController({
    sessionKey: route.sessionKey,
    sessionID,
    queryOptions: serverSync().queryOptions,
    model,
  })

  // [论文助手定制] 完整会话输入框（PromptInputV2Composer）：
  // embedded 模式=复用本论文专属会话继续对话、发送后不跳转页面；
  // 首次发送（还没有专属会话）时自动创建，onSessionCreated 把新会话写回工作流状态。
  const input = usePromptInputV2Controller({
    get controls() {
      return controls()
    },
    embedded: true,
    onSessionCreated: (id) => setSessionID(id),
    onSubmit: () => autoScroll.resume(),
  })

  // [论文助手定制] 打开会话视图时确保该会话已同步（先拉历史消息，之后 SSE 增量继续写入）。
  createEffect(() => {
    const id = sessionID()
    if (!id) return
    void sync().session.sync(id).catch(() => {})
  })

  // [论文助手定制] 消息列表来自 session_message（normalize 成标准 Message[]）；parts 用 sync().data.part 拿流式增量。
  const normalized = createMemo(() => {
    const id = sessionID()
    if (!id) return { messages: [] as ReturnType<typeof normalizeSessionMessages>["messages"], parts: new Map() }
    return normalizeSessionMessages(id, sync().data.session_message[id] ?? [])
  })

  // [论文助手定制] 每次打开/切换会话视图时强制滚到底部。
  // 注意：必须用 onMount（非响应式），不能在 createEffect 里调 resume()——
  // resume() 会读取 autoScroll store 的 userScrolled，createEffect 会因此订阅它，
  // 用户一上翻（userScrolled 变 true）effect 就重跑 resume() 把视图拉回底部，导致无法上翻。
  onMount(() => {
    if (!sessionID()) return
    autoScroll.resume()
  })

  // [论文助手定制] 提取某条助手消息的纯文本（读流式 part store，与生成器取回复文本的方式一致）。
  const assistantText = (messageId: string) => {
    const parts = sync().data.part[messageId] ?? []
    return parts
      .filter((part) => part.type === "text" && "text" in part)
      .map((part) => (part as { text: string }).text)
      .join("")
      .trim()
  }

  // [论文助手定制] 采纳回复：把该条助手消息的文本存为当前步骤的文稿（反复修改的落点）。
  const saveAsResult = async (messageId: string) => {
    const text = assistantText(messageId)
    if (!text) {
      showToast({ variant: "error", icon: "circle-x", title: "这条回复还没有文本内容" })
      return
    }
    // [论文助手定制] 先落盘再更新 result：文稿视图重读文件时能读到新内容。
    await manuscript.save(state().activeStep, text)
    setStepResult(state().activeStep, text)
    showToast({ variant: "success", icon: "circle-check", title: "已存为当前步骤文稿" })
  }

  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden">
      <div class="flex shrink-0 items-center justify-between gap-2 border-b border-v2-border-border-base px-3 py-2">
        <span class="text-12-regular text-v2-text-text-faint">该论文的专属会话 · 可继续对话修改</span>
      </div>
      <div ref={autoScroll.scrollRef} onScroll={autoScroll.handleScroll} class="min-h-0 flex-1 overflow-y-auto">
        <Show
          when={normalized().messages.length > 0}
          fallback={
            <div class="flex h-full items-center justify-center px-6 text-center text-12-regular text-v2-text-text-faint">
              {sessionID()
                ? "会话已创建，等待生成内容…"
                : "还没有会话，可以在下方输入内容直接开始对话，或先在左侧表单里「生成」。"}
            </div>
          }
        >
          <div ref={autoScroll.contentRef} class="flex flex-col">
            <For each={normalized().messages}>
              {(message) => {
                // [论文助手定制] 类型收窄：只有助手消息才有 finish/error，用于「存为当前文稿」按钮。
                const assistant = message.role === "assistant" ? (message as AssistantMessage) : undefined
                // [论文助手定制] 完成判定：该后端消息完成可能只带 time.completed（没有 finish），两个都认。
                const done = !!assistant && (!!assistant.finish || !!assistant.time.completed)
                return (
                  <div class="px-4 py-2 md:px-5">
                    {/* [论文助手定制] 助手消息完成且无错误时，提供「存为当前文稿」：把该回复采纳为当前步骤产物 */}
                    <Show when={assistant && !assistant.error}>
                      <div class="flex items-center justify-end pb-1">
                        <button
                          type="button"
                          data-action="save-message-as-result"
                          class="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-11-medium text-v2-text-text-faint transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
                          classList={{ "cursor-default opacity-40": !done }}
                          disabled={!done}
                          onClick={() => void saveAsResult(assistant!.id)}
                        >
                          <Icon name="circle-check" size="small" />
                          {done ? "存为当前文稿" : "生成中…"}
                        </button>
                      </div>
                    </Show>
                    <Message message={message} parts={sync().data.part[message.id] ?? []} useV2Actions />
                  </div>
                )
              }}
            </For>
          </div>
        </Show>
      </div>
      {/* [论文助手定制] 底部完整会话输入框：与主会话页同款（模型选择、skill 选择、@引用/附件、
          发送/停止）；embedded 模式复用本论文专属会话、发送后不跳转。 */}
      <div class="shrink-0 border-t border-v2-border-border-base p-2">
        {/* [论文助手定制] 插图快捷按钮：与技能/模型等图标并列。从「资料」选一张图片，
          把 ![图注](asset://materials/<名字>) 插入输入框，模型按图注/图片名理解意图；
          占位标记与插图面板一致，见 thesis-figure-panel.tsx。 */}
        <PromptInputV2Composer
          controller={input}
          borderUnderlay
          controlsSlot={
            <Show when={materialImages() && materialImages()!.length > 0}>
              <TooltipV2 placement="top" value="插入插图">
                <MenuV2 gutter={6} modal={false} placement="top-end">
                  <MenuV2.Trigger
                    as={IconButtonV2}
                    type="button"
                    icon={<IconV2 name="folder-add-left" />}
                    variant="ghost-muted"
                    size="large"
                    aria-label="插入插图"
                  />
                  <MenuV2.Portal>
                    <MenuV2.Content style={{ "min-width": "180px", "max-height": "240px", "overflow-y": "auto" }}>
                      <For each={materialImages()}>
                        {(node) => (
                          <MenuV2.Item onSelect={() => insertMarker(node.name)}>{node.name}</MenuV2.Item>
                        )}
                      </For>
                    </MenuV2.Content>
                  </MenuV2.Portal>
                </MenuV2>
              </TooltipV2>
            </Show>
          }
        />
      </div>
    </div>
  )
}
