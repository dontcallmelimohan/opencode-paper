import { For, createSignal } from "solid-js"
import { useLanguage } from "@/context/language"
import { useLocal } from "@/context/local"

const THESIS_AGENTS = [
  { name: "提纲助手", description: "梳理论文结构，生成写作提纲", color: "#4f8cff" },
  { name: "辅助写作", description: "协助撰写与润色论文正文", color: "#22c55e" },
  { name: "论文排版", description: "调整格式、引用与排版规范", color: "#f59e0b" },
  { name: "论文评审", description: "以审稿人视角评审论文质量", color: "#a855f7" },
]

export function SessionAgentSidebar() {
  const language = useLanguage()
  const local = useLocal()
  const [active, setActive] = createSignal(THESIS_AGENTS[0]?.name ?? "")

  return (
    <aside class="hidden w-52 shrink-0 flex-col overflow-hidden rounded-[10px] bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)] md:flex">
      <div class="px-3 pb-1.5 pt-3 text-13-medium text-v2-text-text-strong">
        {language.t("agent.sidebar.title")}
      </div>
      <div class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
        <For each={THESIS_AGENTS}>
          {(agent) => {
            const isActive = () => active() === agent.name
            return (
              <button
                type="button"
                classList={{
                  "flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors": true,
                  "bg-v2-background-bg-layer-01 text-v2-text-text-strong": isActive(),
                  "text-v2-text-text-base hover:bg-v2-background-bg-layer-01": !isActive(),
                }}
                onClick={() => {
                  setActive(agent.name)
                  local.agent.set(agent.name)
                }}
              >
                <span class="flex w-full items-center gap-1.5 text-13-medium">
                  <span class="size-1.5 shrink-0 rounded-full" style={{ background: agent.color }} />
                  <span class="truncate">{agent.name}</span>
                </span>
                <span class="line-clamp-2 text-11-regular text-v2-text-text-faint">{agent.description}</span>
              </button>
            )
          }}
        </For>
      </div>
    </aside>
  )
}
