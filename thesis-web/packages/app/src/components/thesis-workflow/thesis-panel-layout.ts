// [论文助手定制] 论文工作台「可拖拽面板」的宽度持久化：
// 侧边栏宽度、表单/产物分割宽度都由 ResizeHandle 拖拽调整，调整结果写入 localStorage，
// 刷新或重新打开工作台后保持用户自定义的界面分布。
import { createSignal } from "solid-js"

export function usePersistentWidth(key: string, fallback: number) {
  // 读取上次保存的宽度；没有保存过或值非法时用默认宽度。
  const stored = Number(localStorage.getItem(key))
  const initial = Number.isFinite(stored) && stored > 0 ? stored : fallback
  const [width, setWidth] = createSignal(initial)
  const update = (next: number) => {
    setWidth(next)
    localStorage.setItem(key, String(Math.round(next)))
  }
  return { width, setWidth: update }
}
