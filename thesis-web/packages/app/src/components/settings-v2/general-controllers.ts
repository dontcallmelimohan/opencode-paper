// [论文助手定制] 设置面板的控制器。字体 / Shell / 音效 / 会话级权限的控制器随对应设置项一起移除。
import type { ColorScheme } from "@opencode-ai/ui/theme/context"
import { useTheme } from "@opencode-ai/ui/theme/context"

export function createAppearanceSettingsController() {
  const theme = useTheme()

  return {
    scheme: {
      current: theme.colorScheme,
      select: (value: ColorScheme) => theme.setColorScheme(value),
    },
  }
}

export type AppearanceSettingsController = ReturnType<typeof createAppearanceSettingsController>
