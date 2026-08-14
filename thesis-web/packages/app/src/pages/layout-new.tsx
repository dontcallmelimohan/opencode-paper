import { createEffect, Suspense, type ParentProps } from "solid-js"
import { DebugBar } from "@/components/debug-bar"
import { TabsInfoPopup } from "@/components/help-button"
import { setV2Toast, ToastRegion } from "@/utils/toast"
import { debugToolsVisible } from "@/utils/debug-tools"

export default function NewLayout(props: ParentProps) {
  createEffect(() => setV2Toast(true))

  // [论文助手定制] 顶部标题栏已整个删除（Home/标签页/新建会话等都不再显示），
  // 各页面顶部空间被腾出来；调试栏（NAV/FPS 统计）默认隐藏，由主页上的 DEV 按钮切换。
  return (
    <div
      class="relative bg-v2-background-bg-deep flex-1 min-h-0 min-w-0 flex flex-col select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text"
      style={{
        "padding-top": "env(safe-area-inset-top, 0px)",
        "padding-bottom": "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <main class="flex-1 min-h-0 min-w-0 overflow-x-hidden flex flex-col items-start contain-strict">
        <Suspense>{props.children}</Suspense>
      </main>
      {import.meta.env.DEV && debugToolsVisible() && <DebugBar inline />}
      <TabsInfoPopup />
      <ToastRegion v2 />
    </div>
  )
}
