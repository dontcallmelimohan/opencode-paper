import { ThesisHome } from "./home/thesis-home"

export function NewHome() {
  return (
    <div
      class={`
        m-2 min-h-0 flex-1 self-stretch overflow-hidden rounded-[10px]
        bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]
      `}
    >
      <ThesisHome />
    </div>
  )
}
