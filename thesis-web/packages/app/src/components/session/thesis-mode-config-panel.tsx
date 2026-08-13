// [论文助手定制] 通用写作模式配置面板（提纲助手之外的模式先用这个简单版本）。
// 内容暂时只放一个“任务要求”输入框；点击“发送到会话”会把输入打包成提示词
// 发给当前会话，模型在对话中可以看到这份配置。
// 每个模式的配置独立保存（modeConfigs），切换模式后再次打开仍是自己的内容。
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { TextField } from "@opencode-ai/ui/text-field"
import { createEffect, createSignal, on, Show } from "solid-js"
import { ThesisOutlineAssistant } from "./thesis-outline-assistant"
import { useThesisPromptSender } from "./thesis-prompt-sender"
import { useWritingMode, WRITING_MODES, type WritingModeKey } from "./writing-mode"

export function ThesisModeConfigPanel(props: {
  mode: Exclude<WritingModeKey, "outline">
  sessionID: string | undefined
  onClose?: () => void
  onCollapse?: () => void
}) {
  // [论文助手定制] 初始化时读取本模式保存的配置；每次输入都写回 modeConfigs。
  const { modeConfigs, setModeConfig } = useWritingMode()
  const [text, setText] = createSignal(modeConfigs()[props.mode]?.text ?? "")
  const sender = useThesisPromptSender({ sessionID: props.sessionID })

  const item = () => WRITING_MODES.find((mode) => mode.key === props.mode)

  const updateText = (value: string) => {
    setText(value)
    setModeConfig(props.mode, { text: value })
  }

  const send = async () => {
    if (!text().trim()) return
    // [论文助手定制] 打包格式：标明写作模式，再附上用户填写的任务要求。
    const packaged = [
      `我正在使用「${item()?.label ?? props.mode}」写作模式，请按以下配置执行对应任务：`,
      ``,
      text().trim(),
    ].join("\n")
    const ok = await sender.send(packaged)
    // [论文助手定制] 发送成功后关闭面板；配置内容保留（每个模式一份，切换回来仍在）。
    if (ok) props.onClose?.()
  }

  return (
    <div class="flex h-full w-full flex-col overflow-hidden">
      <div class="flex items-center gap-2 px-4 pb-1.5 pt-4">
        <Icon name={item()?.icon ?? "settings-gear"} size="small" class="text-v2-text-text-strong" />
        <span class="text-13-medium text-v2-text-text-strong">{item()?.label ?? props.mode}</span>
        <span class="ml-auto rounded-full bg-v2-accent-accent-soft px-2 py-0.5 text-10-medium text-v2-accent-accent-strong">
          配置
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
        <section class="flex flex-col gap-1.5">
          <div class="text-12-medium text-v2-text-text-strong">任务要求</div>
          <TextField
            multiline
            placeholder={`填写「${item()?.label ?? props.mode}」的任务要求，例如目标、约束、输出格式...`}
            value={text()}
            onChange={updateText}
          />
        </section>
        <Button type="button" variant="primary" disabled={sender.sending()} onClick={() => void send()}>
          {sender.sending() ? "发送中…" : "发送到会话"}
        </Button>
        <Show when={!props.sessionID}>
          <div class="text-11-regular text-v2-text-text-faint">
            当前还没有会话，发送时会自动创建新会话并把配置发过去。
          </div>
        </Show>
      </div>
    </div>
  )
}

// [论文助手定制] 配置面板条：显示在会话框（对话区）上部，而不是悬浮窗。
// 控制按钮全部放在会话页面上（侧边栏不再有 ⚙）：
// - 关闭状态：一行控制条，点「打开配置」展开面板。
// - 打开状态：完整面板（h-72），头部「收起」按钮 → 变为一条细栏。
// - 收起状态：一行细栏，点「展开」恢复。
// 切换写作模式时会自动打开该模式自己的配置面板。
export function ThesisConfigPanelStrip(props: { sessionID?: string }) {
  const { mode, configMode, openConfig, closeConfig } = useWritingMode()
  const [collapsed, setCollapsed] = createSignal(false)
  const currentMode = () => mode()
  const item = () => WRITING_MODES.find((entry) => entry.key === currentMode())
  const opened = () => configMode() === currentMode()

  // [论文助手定制] 切换写作模式时：恢复展开，并自动打开该模式自己的配置面板。
  createEffect(
    on(currentMode, (key) => {
      setCollapsed(false)
      if (key) openConfig(key)
    }, { defer: true }),
  )

  // [论文助手定制] 面板打开/关闭时同步收起状态（重新打开时总是展开）。
  createEffect(() => {
    opened()
    setCollapsed(false)
  })

  return (
    <Show when={currentMode() !== undefined}>
      <div class="relative z-10 mb-2 shrink-0 overflow-hidden rounded-[10px] bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]">
        <Show
          when={opened()}
          fallback={
            // [论文助手定制] 关闭状态：一行控制条（打开按钮在会话页面上）。
            <div class="flex items-center gap-2 px-3 py-1.5">
              <Icon name={item()?.icon ?? "settings-gear"} size="small" class="text-v2-text-text-strong" />
              <span class="text-12-medium text-v2-text-text-strong">{item()?.label ?? currentMode()}</span>
              <span class="text-11-regular text-v2-text-text-faint">配置面板已关闭</span>
              <div class="ml-auto">
                <Button
                  type="button"
                  variant="ghost"
                  size="small"
                  icon="settings-gear"
                  onClick={() => {
                    const key = currentMode()
                    if (key) openConfig(key)
                  }}
                >
                  打开配置
                </Button>
              </div>
            </div>
          }
        >
          <Show
            when={!collapsed()}
            fallback={
              // [论文助手定制] 收起后的细栏：只占一行，附「展开」与关闭按钮。
              <div class="flex items-center gap-2 px-3 py-1.5">
                <Icon name={item()?.icon ?? "settings-gear"} size="small" class="text-v2-text-text-strong" />
                <span class="text-12-medium text-v2-text-text-strong">{item()?.label ?? currentMode()}</span>
                <span class="text-11-regular text-v2-text-text-faint">配置面板已收起</span>
                <div class="ml-auto flex items-center gap-1">
                  <Button type="button" variant="ghost" size="small" onClick={() => setCollapsed(false)}>
                    展开
                  </Button>
                  <IconButton
                    type="button"
                    icon="close-small"
                    size="small"
                    variant="ghost"
                    aria-label="关闭配置面板"
                    onClick={() => closeConfig()}
                  />
                </div>
              </div>
            }
          >
            <div class="flex h-72 flex-col overflow-hidden">
              <Show when={currentMode() === "outline"}>
                <ThesisOutlineAssistant
                  sessionID={props.sessionID}
                  onClose={closeConfig}
                  onCollapse={() => setCollapsed(true)}
                />
              </Show>
              <Show when={currentMode() !== undefined && currentMode() !== "outline"}>
                <ThesisModeConfigPanel
                  mode={currentMode() as Exclude<WritingModeKey, "outline">}
                  sessionID={props.sessionID}
                  onClose={closeConfig}
                  onCollapse={() => setCollapsed(true)}
                />
              </Show>
            </div>
          </Show>
        </Show>
      </div>
    </Show>
  )
}
