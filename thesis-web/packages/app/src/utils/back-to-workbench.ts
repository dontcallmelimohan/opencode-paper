// [论文助手定制] 会话页「返回工作台」按钮的挂载信号。
// 顶部标题栏删除后，会话页需要一个返回工作台的入口：
// TargetSessionRoute（/server/.../session/:id）挂载回调，会话标题行（message-timeline 的
// sticky 标题栏）读取后与标题并列渲染，避免之前悬浮按钮遮挡会话标题。
import { createSignal } from "solid-js"

export type BackToWorkbench = { onClick: () => void }

export const [backToWorkbench, setBackToWorkbench] = createSignal<BackToWorkbench | undefined>(undefined)
