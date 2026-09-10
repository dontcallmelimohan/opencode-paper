// [论文助手定制] 通用设置：只保留对本平台用户有意义的项。
// 语言（平台只有中文）、界面/代码/终端字体、终端 Shell、音效、自动接受权限、
// opencode 的布局迁移与桌面端显示项一律移除，不再暴露给写作者。
import { Component } from "solid-js"
import { SelectV2 } from "@opencode-ai/ui/v2/select-v2"
import { Switch } from "@opencode-ai/ui/v2/switch-v2"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { createAppearanceSettingsController } from "./general-controllers"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

const schemeOptions: ("system" | "light" | "dark")[] = ["system", "light", "dark"]

export const SettingsGeneralV2: Component = () => {
  const language = useLanguage()
  const settings = useSettings()
  const appearance = createAppearanceSettingsController()

  const ColorSchemeSetting = () => (
    <SettingsRowV2
      title={language.t("settings.general.row.colorScheme.title")}
      description={language.t("settings.general.row.colorScheme.description")}
    >
      <SelectV2
        appearance="inline"
        data-action="settings-color-scheme"
        options={schemeOptions}
        current={schemeOptions.find((option) => option === appearance.scheme.current())}
        placement="bottom-end"
        gutter={6}
        label={(option) => {
          if (option === "system") return language.t("theme.scheme.system")
          if (option === "light") return language.t("theme.scheme.light")
          return language.t("theme.scheme.dark")
        }}
        onSelect={(option) => option && appearance.scheme.select(option)}
      />
    </SettingsRowV2>
  )

  const ToggleSetting: Component<{
    action: string
    title: string
    description: string
    checked: boolean
    onChange: (checked: boolean) => void
  }> = (props) => (
    <SettingsRowV2 title={props.title} description={props.description}>
      <div data-action={props.action}>
        <Switch checked={props.checked} onChange={props.onChange} />
      </div>
    </SettingsRowV2>
  )

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">通用设置</h2>
      </div>

      <div class="settings-v2-tab-body">
        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">外观</h3>
          <SettingsListV2>
            <ColorSchemeSetting />
          </SettingsListV2>
        </div>

        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">写作界面</h3>
          <SettingsListV2>
            <ToggleSetting
              action="settings-show-file-tree"
              title="显示文件树"
              description="在工作台左侧显示资料与正文的文件列表，关闭后写作区更宽。"
              checked={settings.general.showFileTree()}
              onChange={(checked) => settings.general.setShowFileTree(checked)}
            />

            <ToggleSetting
              action="settings-show-search"
              title="显示命令面板"
              description="在顶栏显示搜索按钮，可用 ⌘K 快速跳转到工作空间、会话或执行命令。"
              checked={settings.general.showSearch()}
              onChange={(checked) => settings.general.setShowSearch(checked)}
            />
          </SettingsListV2>
        </div>

        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">消息通知</h3>
          <SettingsListV2>
            <ToggleSetting
              action="settings-notifications-agent"
              title="写作完成时提醒"
              description="论文生成或修订结束时发送浏览器通知。"
              checked={settings.notifications.agent()}
              onChange={(checked) => settings.notifications.setAgent(checked)}
            />

            <ToggleSetting
              action="settings-notifications-permissions"
              title="需要授权时提醒"
              description="需要你确认操作时发送浏览器通知。"
              checked={settings.notifications.permissions()}
              onChange={(checked) => settings.notifications.setPermissions(checked)}
            />

            <ToggleSetting
              action="settings-notifications-errors"
              title="出错时提醒"
              description="任务执行失败时发送浏览器通知。"
              checked={settings.notifications.errors()}
              onChange={(checked) => settings.notifications.setErrors(checked)}
            />
          </SettingsListV2>
        </div>
      </div>
    </>
  )
}
