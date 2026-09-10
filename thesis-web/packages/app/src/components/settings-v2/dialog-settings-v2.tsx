// [论文助手定制] 设置弹窗：只保留本平台自己的三块内容。
// opencode 的「快捷键」「服务器」两个页签已从这里移除（服务器改由会话顶栏的状态浮层入口进入）。
import { Component, createSignal, startTransition } from "solid-js"
import { Dialog } from "@opencode-ai/ui/v2/dialog-v2"
import { TabsV2 } from "@opencode-ai/ui/v2/tabs-v2"
import { Icon } from "@opencode-ai/ui/icon"
import { usePlatform } from "@/context/platform"
import { SettingsGeneralV2 } from "./general"
import { SettingsModelApisV2 } from "./model-apis"
import "./settings-v2.css"
import { SettingsThesisV2 } from "./thesis"

export const DialogSettings: Component<{
  defaultValue?: string
}> = (props) => {
  const platform = usePlatform()
  const [tab, setTab] = createSignal(props.defaultValue ?? "general")

  return (
    <Dialog size="x-large" variant="settings" class="settings-v2-dialog">
      <TabsV2
        orientation="vertical"
        variant="settings"
        value={tab()}
        onChange={(value) => void startTransition(() => setTab(value))}
        class="settings-v2"
      >
        <TabsV2.List>
          <div class="flex flex-col justify-between h-full w-full">
            <div class="flex flex-col gap-1.5 w-full">
              <TabsV2.SectionTitle>设置</TabsV2.SectionTitle>
              <div class="flex flex-col gap-1.5 w-full">
                <TabsV2.Trigger value="general">
                  <Icon name="sliders" />
                  通用设置
                </TabsV2.Trigger>
                <TabsV2.Trigger value="thesis">
                  <Icon name="pencil-line" />
                  论文设置
                </TabsV2.Trigger>
                <TabsV2.Trigger value="models">
                  <Icon name="models" />
                  模型与 API
                </TabsV2.Trigger>
              </div>
            </div>
            <div class="settings-v2-nav-footer">
              <span>agent4paper</span>
              <span>v{platform.version}</span>
            </div>
          </div>
        </TabsV2.List>
        <TabsV2.Content value="general" class="settings-v2-panel">
          <SettingsGeneralV2 />
        </TabsV2.Content>
        <TabsV2.Content value="thesis" class="settings-v2-panel">
          <SettingsThesisV2 />
        </TabsV2.Content>
        <TabsV2.Content value="models" class="settings-v2-panel">
          <SettingsModelApisV2 />
        </TabsV2.Content>
      </TabsV2>
    </Dialog>
  )
}
