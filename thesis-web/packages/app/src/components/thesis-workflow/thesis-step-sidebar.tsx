// [论文助手定制] 论文工作台左侧面板。
// 按用户要求，把原来页面顶部的栏目（返回主页 / 论文标题 / 资料）集中到这里，顶部栏已删除；
// 会话管理也集中到侧边栏：显示“当前论文项目专属”的会话条目 + 新建会话按钮（对应项目只管对应项目的会话管理）。
// 侧边栏从上到下：返回主页 → 论文标题 → 四步切换 → 本项目会话记录 → 底部工具（资料）。
import type { SessionV2Info } from "@opencode-ai/sdk/v2/client"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { useQuery, useQueryClient } from "@tanstack/solid-query"
import { DateTime } from "luxon"
import { For, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { useSDK } from "@/context/sdk"
import { showToast } from "@/utils/toast"
import { useThesisWorkflow, type StepKey } from "./thesis-workflow-store"

// [论文助手定制] 方案 B（去线性化）：四个模块并列展示，不再标注「第 N 步」，
// 暗示四步独立、可任意顺序使用。
const STEPS = [
  { key: "outline", label: "提纲助手", icon: "bullet-list" },
  { key: "writing", label: "辅助写作", icon: "pencil-line" },
  { key: "formatting", label: "论文排版", icon: "layout-left" },
  { key: "review", label: "论文评审", icon: "magnifying-glass" },
] as const

export function ThesisStepSidebar(props: {
  title: string
  hasProject: boolean
  onHome: () => void
  onCollapse: () => void
  onUpload: () => void
}) {
  // [论文助手定制] 会话记录联动：点击会话记录条目后在右侧产物面板显示该会话。
  const { state, setActiveStep, setDisplaySession, setProductView } = useThesisWorkflow()
  const sdk = useSDK()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const active = () => state().activeStep
  const stepStatus = (key: StepKey) => state().steps[key].status

  // [论文助手定制] 会话管理（按项目隔离）：只拉取当前论文目录下的会话，最新的在前。
  const sessions = useQuery(() => ({
    queryKey: ["thesis", "sessions", sdk().directory],
    queryFn: async () => {
      const res = await sdk().client.v2.session.list({ directory: sdk().directory, limit: 20 })
      const list = res.data?.data ?? []
      return list.sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
    },
  }))

  // [论文助手定制] 打开会话：不再跳转到全局会话页，而是在工作台右侧产物面板显示该会话。
  // 板块专属会话会顺带切到对应板块（配置/产物上下文跟随），普通会话只显示会话界面。
  function openSessionInPanel(session: { id: string }) {
    const step = STEPS.find((item) => state().steps[item.key].sessionID === session.id)
    if (step) setActiveStep(step.key)
    setDisplaySession(session.id)
    setProductView("session")
  }

  // [论文助手定制] 新建会话：在当前论文目录下创建，刷新列表后打开它。
  async function createSession() {
    try {
      const created = await sdk().api.session.create({ location: { directory: sdk().directory } })
      if (!created?.id) throw new Error("创建会话失败")
      await queryClient.invalidateQueries({ queryKey: ["thesis", "sessions", sdk().directory] })
      const res = await sdk().client.v2.session.list({ directory: sdk().directory, limit: 20 })
      const found = (res.data?.data ?? []).find((item) => item.id === created.id)
      if (found) openSessionInPanel(found)
    } catch (err) {
      showToast({
        variant: "error",
        icon: "circle-x",
        title: "新建会话失败",
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const statusLabel = (key: StepKey) => {
    const status = stepStatus(key)
    if (status === "done") return "已完成"
    if (status === "generating") return "生成中…"
    return "未开始"
  }

  return (
    // [论文助手定制] 可拖拽布局：宽度由外层容器（thesis-workbench.tsx 的 ResizeHandle）控制，这里不再写死 220px。
    <div class="flex w-full shrink-0 flex-col overflow-y-auto rounded-[10px] bg-v2-background-bg-base p-1 shadow-[var(--v2-elevation-raised)]">
      {/* [论文助手定制] 顶部：返回主页 + 收起侧边栏 */}
      <div class="flex items-center gap-1 pr-1">
        <Button
          type="button"
          variant="ghost"
          size="small"
          icon="chevron-left"
          class="w-full justify-start"
          onClick={props.onHome}
        >
          主页
        </Button>
        <IconButton
          type="button"
          icon="collapse"
          variant="ghost"
          size="small"
          aria-label="收起侧边栏"
          onClick={props.onCollapse}
        />
      </div>
      {/* [论文助手定制] 论文标题 + 工作台标识（原来在顶部栏，现放入侧边栏） */}
      <div class="flex items-center gap-1.5 px-3 pb-2 pt-1">
        <Icon name="pencil-line" size="small" class="shrink-0 text-v2-text-text-base" />
        <span class="min-w-0 flex-1 truncate text-13-medium text-v2-text-text-base">{props.title}</span>
        <Show when={props.hasProject}>
          <span class="shrink-0 rounded-full bg-v2-background-bg-layer-02 px-2 py-0.5 text-10-medium text-v2-text-text-faint">
            论文工作台
          </span>
        </Show>
      </div>
      {/* [论文助手定制] 方案 B：四个独立模块切换（不再标注顺序） */}
      <div class="flex flex-col gap-1">
        <For each={STEPS}>
          {(item) => (
            <button
              type="button"
              class="flex w-full cursor-pointer flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-colors"
              classList={{
                "bg-v2-background-bg-layer-01": active() === item.key,
                "hover:bg-v2-background-bg-layer-01": active() !== item.key,
              }}
              onClick={() => setActiveStep(item.key)}
            >
              <span class="flex w-full items-center gap-1.5">
                <Icon name={item.icon} size="small" class="shrink-0 text-v2-text-text-base" />
                <span
                  class="min-w-0 flex-1 truncate text-13-medium"
                  classList={{
                    "text-v2-text-text-accent": active() === item.key,
                    "text-v2-text-text-base": active() !== item.key,
                  }}
                >
                  {item.label}
                </span>
                {/* [论文助手定制] 状态圆点：完成=绿色勾，生成中=旋转，未开始=灰点 */}
                <span class="shrink-0">
                  <Show
                    when={stepStatus(item.key) === "done"}
                    fallback={
                      <Show
                        when={stepStatus(item.key) === "generating"}
                        fallback={<span class="block size-2 rounded-full bg-v2-text-text-faint" />}
                      >
                        <span class="block size-3 animate-spin rounded-full border-2 border-v2-border-border-focus border-t-transparent" />
                      </Show>
                    }
                  >
                    <Icon name="circle-check" size="small" class="text-v2-text-text-accent" />
                  </Show>
                </span>
              </span>
              <span
                class="pl-5 text-11-regular"
                classList={{
                  "text-v2-text-text-accent": stepStatus(item.key) === "done",
                  "text-v2-text-text-faint": stepStatus(item.key) !== "done",
                }}
              >
                {statusLabel(item.key)}
              </span>
            </button>
          )}
        </For>
      </div>
      {/* [论文助手定制] 本项目会话记录：条目可点击打开（当前生成会话高亮）+ 新建会话按钮 */}
      <div class="mt-1 flex flex-col gap-1 border-t border-v2-border-border-base pt-1">
        <div class="flex items-center justify-between gap-1 px-2 pt-0.5">
          <span class="text-11-regular text-v2-text-text-faint">会话记录</span>
          <Button
            type="button"
            variant="ghost"
            size="small"
            icon="plus-small"
            class="h-6 gap-0.5 px-1.5 text-11-medium"
            onClick={() => void createSession()}
          >
            新会话
          </Button>
        </div>
        <Show
          when={sessions.data && sessions.data.length > 0}
          fallback={
            <div class="px-2 pb-1 pt-0.5 text-11-regular text-v2-text-text-faint">
              暂无会话，生成或新建后会出现在这里
            </div>
          }
        >
          <For each={sessions.data}>
            {(session) => {
              // [论文助手定制] 板块归属：会话 ID 与某板块的专属会话一致时，显示板块图标/名称/状态。
              const step = STEPS.find((item) => state().steps[item.key].sessionID === session.id)
              return (
                <button
                  type="button"
                  class="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-v2-background-bg-layer-01"
                  classList={{
                    "bg-v2-background-bg-layer-01":
                      state().displaySessionID === session.id || state().steps[active()].sessionID === session.id,
                  }}
                  onClick={() => openSessionInPanel(session)}
                >
                  <Icon
                    name={step?.icon ?? "speech-bubble"}
                    size="small"
                    class="shrink-0 text-v2-text-text-faint"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-12-regular text-v2-text-text-base">
                      {step ? `${step.label} · ${session.title || "未命名对话"}` : session.title || "未命名对话"}
                    </span>
                    <span class="block text-10-regular text-v2-text-text-faint">
                      {step ? `${statusLabel(step.key)} · ` : ""}
                      {DateTime.fromMillis(session.time.updated ?? session.time.created).toRelative() ?? ""}
                    </span>
                  </span>
                </button>
              )
            }}
          </For>
        </Show>
      </div>
      {/* [论文助手定制] 底部工具：文件空间——改为跳转到独立整页（/:dir/files），空间更大，便于预览图片与长文本。 */}
      <div class="mt-auto flex flex-col gap-1 border-t border-v2-border-border-base pt-1">
        <Button
          type="button"
          variant="ghost"
          size="small"
          icon="folder"
          class="w-full justify-start"
          onClick={() => navigate(`/${base64Encode(sdk().directory)}/files`)}
        >
          文件空间
        </Button>
      </div>
    </div>
  )
}
