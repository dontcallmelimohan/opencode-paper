// [论文助手定制] 论文工作台产物区域的「会话」视图：
// 在展示文稿的同一个位置切换为“该论文专属会话”的聊天记录，
// 生成过程中可以实时看到模型输出进度（消息/文本增量通过 sync 数据流式刷新）。
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { createAutoScroll } from "@opencode-ai/ui/hooks"
import { Message } from "@opencode-ai/session-ui/message-part"
import { useNavigate } from "@solidjs/router"
import { createEffect, createMemo, For, onMount, Show } from "solid-js"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { normalizeSessionMessages } from "@/utils/session-message"
import { useThesisWorkflow } from "./thesis-workflow-store"

export function ThesisSessionView() {
  const sdk = useSDK()
  const sync = useSync()
  const navigate = useNavigate()
  const { state } = useThesisWorkflow()
  const sessionID = () => state().sessionID

  // [论文助手定制] 复用主会话页的自动滚动 Hook：内容渲染完成后（ResizeObserver 在布局后触发）
  // 自动保持底部，用户上翻时暂停跟随，回到底部后恢复。这样每次切到「会话」视图都会定位到最底部，
  // 生成中的流式内容增长也不会把视图留在顶部。
  const autoScroll = createAutoScroll({ working: () => true, overflowAnchor: "none" })

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

  const openFullSession = () => {
    const id = sessionID()
    if (!id) return
    navigate(`/${base64Encode(sdk().directory)}/session/${id}`)
  }

  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden">
      <Show
        when={sessionID()}
        fallback={
          <div class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <Icon name="speech-bubble" size="large" class="text-v2-text-text-faint" />
            <div class="text-12-regular text-v2-text-text-faint">
              还没有会话记录，先生成一次，即可在这里切换查看对话过程。
            </div>
          </div>
        }
      >
        <div class="flex shrink-0 items-center justify-between gap-2 border-b border-v2-border-border-base px-3 py-2">
          <span class="text-12-regular text-v2-text-text-faint">该论文的专属会话 · 实时生成记录</span>
          <Button type="button" variant="ghost" size="small" icon="square-arrow-top-right" onClick={openFullSession}>
            打开完整会话
          </Button>
        </div>
        <div ref={autoScroll.scrollRef} onScroll={autoScroll.handleScroll} class="min-h-0 flex-1 overflow-y-auto">
          <Show
            when={normalized().messages.length > 0}
            fallback={
              <div class="flex h-full items-center justify-center px-6 text-center text-12-regular text-v2-text-text-faint">
                会话已创建，等待生成内容…
              </div>
            }
          >
            <div ref={autoScroll.contentRef} class="flex flex-col">
              <For each={normalized().messages}>
                {(message) => (
                  <div class="px-4 py-2 md:px-5">
                    <Message message={message} parts={sync().data.part[message.id] ?? []} useV2Actions />
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}
