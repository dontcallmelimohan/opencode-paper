// [论文助手定制] 全局调试栏（NAV/FPS/FRAME 统计条）的开关。
// 顶部标题栏已整个删除，DEV 按钮移到主页；开关用模块级信号共享：
// layout-new 负责按此信号渲染调试栏，主页上的 DEV 按钮负责切换（默认隐藏）。
import { createSignal } from "solid-js"

export const [debugToolsVisible, setDebugToolsVisible] = createSignal(false)
