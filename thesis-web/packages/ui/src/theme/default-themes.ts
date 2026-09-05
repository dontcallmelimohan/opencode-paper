import type { DesktopTheme } from "./types"
import oc2ThemeJson from "./themes/oc-2.json"

export const oc2Theme = oc2ThemeJson as DesktopTheme

// [论文助手定制] 仅保留默认主题 OC-2（亮/暗两套配色），其余主题已移除。
export const DEFAULT_THEMES: Record<string, DesktopTheme> = {
  "oc-2": oc2Theme,
}
