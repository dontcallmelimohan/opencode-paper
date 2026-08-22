// [论文助手定制] 流式 progress 轻量 store：与主 workflow store 解耦。
// 主 store 的 setState 会触发所有读取 state() 的组件整树重算；流式期间每 150ms
// 写入一次会高频触发全量重渲染。这里用独立细粒度信号，只影响读取 progress 的组件。
import { createSimpleContext } from "@opencode-ai/ui/context"
import { createSignal } from "solid-js"
import type { StepKey } from "./thesis-workflow-store"

export const { use: useThesisLive, provider: ThesisLiveProvider } = createSimpleContext({
  name: "ThesisLive",
  init: () => {
    const [progress, setProgress] = createSignal<Partial<Record<StepKey, string>>>({})
    const setStepProgress = (step: StepKey, text: string) =>
      setProgress((prev) => (prev[step] === text ? prev : { ...prev, [step]: text }))
    const clearStepProgress = (step: StepKey) =>
      setProgress((prev) => {
        if (!prev[step]) return prev
        const next = { ...prev }
        delete next[step]
        return next
      })
    return { progress, setStepProgress, clearStepProgress }
  },
})
