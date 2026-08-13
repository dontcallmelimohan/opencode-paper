// [论文助手定制] 提纲助手配置面板（Step 1）。
// 用户在此填写综述需求、方向侧重、检查点并勾选知识库材料后，
// 点击“生成提纲”会把所有输入打包成结构化提示词，通过当前会话发送给大模型。
import { Button } from "@opencode-ai/ui/button"
import { Checkbox } from "@opencode-ai/ui/checkbox"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { TextField } from "@opencode-ai/ui/text-field"
import { createResource, createSignal, For, Show } from "solid-js"
import type { FileNode } from "@opencode-ai/sdk/v2/client"
import { useLocal } from "@/context/local"
import { useSDK } from "@/context/sdk"
import { showToast } from "@/utils/toast"
import { useThesisPromptSender } from "./thesis-prompt-sender"
import { useWritingMode, type OutlineModeConfig } from "./writing-mode"

// [论文助手定制] 方向侧重的四个选项，勾选项会写进发给模型的提示词。
const DIRECTIONS = [
  { key: "review", label: "现状梳理", hint: "梳理该方向的研究现状与进展" },
  { key: "depth", label: "深度", hint: "对关键问题做深入分析" },
  { key: "standard", label: "标准", hint: "按学术规范组织章节" },
  { key: "clue", label: "论文线索", hint: "标注各章节相关的论文线索" },
] as const

type DirectionKey = (typeof DIRECTIONS)[number]["key"]
type Status = "idle" | "sending" | "sent"

export function ThesisOutlineAssistant(props: {
  sessionID: string | undefined
  onClose?: () => void
  onCollapse?: () => void
}) {
  const sdk = useSDK()
  const local = useLocal()
  // [论文助手定制] 提纲助手的配置按“提纲助手”模式单独保存（每个模式一份）。
  const { modeConfigs, setModeConfig } = useWritingMode()
  // [论文助手定制] 复用通用发送逻辑（无会话时自动创建并跳转）。
  const sender = useThesisPromptSender({ sessionID: props.sessionID })

  // [论文助手定制] 打开面板时从本模式保存的配置初始化，之后每次修改都写回。
  const savedOutline = () => modeConfigs().outline
  const [needs, setNeeds] = createSignal(savedOutline().needs)
  const [directions, setDirections] = createSignal<DirectionKey[]>(savedOutline().directions as DirectionKey[])
  const [aiSuggest, setAiSuggest] = createSignal(savedOutline().aiSuggest)
  const [optimize, setOptimize] = createSignal(savedOutline().optimize)
  const [selected, setSelected] = createSignal<string[]>(savedOutline().selected)
  const [showMaterials, setShowMaterials] = createSignal(true)
  const [status, setStatus] = createSignal<Status>("idle")

  // [论文助手定制] 统一写回：任何输入变化都会同步到“提纲助手”模式的配置里。
  const updateOutline = (patch: Partial<OutlineModeConfig>) => setModeConfig("outline", patch)

  // [论文助手定制] 知识库材料 = 论文工作空间「资料」目录下的文件列表。
  const [materials] = createResource(
    () => sdk().directory,
    async (directory) => {
      if (!directory) return []
      try {
        const res = await sdk().client.file.list({ directory, path: "资料" })
        if (res.error) return []
        return (res.data ?? []).filter((node): node is FileNode => node.type === "file")
      } catch {
        return []
      }
    },
  )

  const toggleDirection = (key: DirectionKey) => {
    setDirections((prev) => {
      const next = prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
      updateOutline({ directions: [...next] })
      return next
    })
  }

  const toggleMaterial = (path: string) => {
    setSelected((prev) => {
      const next = prev.includes(path) ? prev.filter((item) => item !== path) : [...prev, path]
      updateOutline({ selected: [...next] })
      return next
    })
  }

  // [论文助手定制] 把所有输入打包成结构化提示词（模型会在对话中看到这份内容）。
  const buildPrompt = () => {
    const lines: string[] = []
    lines.push("请基于以下信息，为我生成一份「分章节综述大纲」。")
    lines.push("")
    lines.push("## 一、综述需求")
    lines.push(needs().trim())
    lines.push("")
    lines.push("## 二、方向侧重")
    const chosen = directions().map((key) => {
      const item = DIRECTIONS.find((direction) => direction.key === key)
      return item ? `${item.label}（${item.hint}）` : key
    })
    lines.push(chosen.length > 0 ? chosen.join("；") : "无特别侧重")
    if (aiSuggest()) lines.push("- 请为每个章节给出 AI 建议（写作要点与提示）")
    if (optimize()) lines.push("- 请在最后给出提纲优化提醒")
    lines.push("")
    lines.push("## 三、参考材料（知识库）")
    if (selected().length > 0) {
      lines.push("以下为已选材料，请先读取文件内容再生成：")
      lines.push(...selected().map((path) => `- ${path}`))
    } else {
      lines.push("（未选择材料）")
    }
    lines.push("")
    lines.push("## 四、输出要求")
    lines.push("按章节输出综述大纲：每个章节包含标题、写作要点、相关论文线索与写作建议，结构清晰，可直接用于后续辅助写作。")
    return lines.join("\n")
  }

  const generate = async () => {
    if (!needs().trim()) {
      showToast({ variant: "error", icon: "circle-x", title: "请先填写综述需求" })
      return
    }
    if (sender.sending()) return
    setStatus("sending")
    const ok = await sender.send(buildPrompt())
    setStatus(ok ? "sent" : "idle")
    // [论文助手定制] 发送成功后自动关闭悬浮窗口，结果在会话中查看。
    if (ok) props.onClose?.()
  }

  const clueStatus = () => (status() === "idle" ? "待生成" : status() === "sending" ? "生成中…" : "已提交")
  const resultHint = () =>
    status() === "idle"
      ? "请先输入选题想法、草稿或论文材料。"
      : status() === "sending"
        ? "正在生成提纲，请稍候…"
        : "提纲生成任务已发送，结果将出现在对话消息中。"

  return (
    <div class="flex h-full w-full flex-col overflow-hidden">
      <div class="flex items-center gap-2 px-4 pb-1.5 pt-4">
        <Icon name="bullet-list" size="small" class="text-v2-text-text-strong" />
        <span class="text-13-medium text-v2-text-text-strong">提纲助手</span>
        <span class="ml-auto rounded-full bg-v2-accent-accent-soft px-2 py-0.5 text-10-medium text-v2-accent-accent-strong">
          Step 1
        </span>
        {/* [论文助手定制] 收起配置面板（面板在会话框上部时减少占位）。 */}
        <Button type="button" variant="ghost" size="small" onClick={() => props.onCollapse?.()}>
          收起
        </Button>
        {/* [论文助手定制] 关闭配置面板。 */}
        <IconButton
          type="button"
          icon="close-small"
          size="small"
          variant="ghost"
          aria-label="关闭配置面板"
          onClick={() => props.onClose?.()}
        />
      </div>
      <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        {/* 描述综述需求 */}
        <section class="flex flex-col gap-1.5">
          <div class="text-12-medium text-v2-text-text-strong">描述综述需求</div>
          <TextField
            multiline
            placeholder="输入选题想法、已有草稿、老师意见、论文摘要或文献摘录..."
            value={needs()}
            onChange={(value) => {
              setNeeds(value)
              updateOutline({ needs: value })
            }}
          />
        </section>

        {/* 方向 */}
        <section class="flex flex-col gap-1.5">
          <div class="text-12-medium text-v2-text-text-strong">方向</div>
          <div class="flex flex-col gap-1">
            <For each={DIRECTIONS}>
              {(item) => (
                <Checkbox checked={directions().includes(item.key)} onChange={() => toggleDirection(item.key)}>
                  {item.label}
                </Checkbox>
              )}
            </For>
          </div>
        </section>

        {/* 生成提纲 */}
        <section class="flex flex-col gap-1.5">
          <div class="text-12-medium text-v2-text-text-strong">生成提纲</div>
          <div class="flex flex-col gap-2">
            <Checkbox
              checked={aiSuggest()}
              onChange={(value) => {
                setAiSuggest(value)
                updateOutline({ aiSuggest: value })
              }}
            >
              AI 建议
            </Checkbox>
            <div class="flex items-center justify-between rounded-md bg-v2-background-bg-layer-01 px-2 py-1.5">
              <span class="text-12-regular text-v2-text-text-base">相关论文线索</span>
              <span class="text-11-regular text-v2-text-text-faint">{clueStatus()}</span>
            </div>
            <Button
              type="button"
              variant="primary"
              disabled={sender.sending()}
              onClick={() => void generate()}
            >
              {sender.sending() ? "生成中…" : "生成提纲"}
            </Button>
          </div>
        </section>

        {/* 检查点 */}
        <section class="flex flex-col gap-1.5">
          <div class="text-12-medium text-v2-text-text-strong">检查点</div>
          <Checkbox
            checked={optimize()}
            onChange={(value) => {
              setOptimize(value)
              updateOutline({ optimize: value })
            }}
          >
            提纲优化提醒
          </Checkbox>
        </section>

        {/* 知识库 */}
        <section class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <div class="text-12-medium text-v2-text-text-strong">知识库</div>
            <Button type="button" variant="ghost" size="small" onClick={() => setShowMaterials(!showMaterials())}>
              管理
            </Button>
          </div>
          <div class="text-11-regular text-v2-text-text-faint">全部文件夹</div>
          <div class="text-11-regular text-v2-text-text-base">{selected().length} 条已选</div>
          <Show when={showMaterials()}>
            <Show
              when={materials.loading}
              fallback={
                <Show
                  when={materials() && materials()!.length > 0}
                  fallback={<div class="text-11-regular text-v2-text-text-faint">知识库暂无可选材料。</div>}
                >
                  <div class="flex max-h-40 flex-col gap-0.5 overflow-y-auto rounded-md bg-v2-background-bg-layer-01 p-1.5">
                    <For each={materials()}>
                      {(node) => (
                        <Checkbox checked={selected().includes(node.path)} onChange={() => toggleMaterial(node.path)}>
                          <span class="min-w-0 truncate">{node.name}</span>
                        </Checkbox>
                      )}
                    </For>
                  </div>
                </Show>
              }
            >
              <div class="text-11-regular text-v2-text-text-faint">正在读取知识库…</div>
            </Show>
          </Show>
        </section>

        {/* 生成结果 */}
        <section class="flex flex-col gap-1.5">
          <div class="text-12-medium text-v2-text-text-strong">生成结果</div>
          <div class="flex flex-col gap-1 rounded-md border border-v2-border-border-base px-2.5 py-2">
            <div class="flex items-center gap-1.5">
              <Icon name="pencil-line" size="small" class="text-v2-text-text-strong" />
              <span class="text-12-medium text-v2-text-text-strong">分章节综述大纲</span>
            </div>
            <div class="text-11-regular text-v2-text-text-faint">用于辅助写作</div>
            <div class="mt-1 text-11-regular text-v2-text-text-base">{resultHint()}</div>
          </div>
        </section>
      </div>
    </div>
  )
}
