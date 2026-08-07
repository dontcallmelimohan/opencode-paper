import { For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useLocal } from "@/context/local"

export function SessionAgentSidebar() {
  const language = useLanguage()
  const local = useLocal()

  return (
    <Show when={local.agent.list().length > 0}>
      <aside class="hidden w-52 shrink-0 flex-col overflow-hidden rounded-[10px] bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)] md:flex">
        <div class="px-3 pb-1.5 pt-3 text-13-medium text-v2-text-text-strong">
          {language.t("agent.sidebar.title")}
        </div>
        <div class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
          <For each={local.agent.list()}>
            {(agent) => {
              const active = () => agent.name === local.agent.current()?.name
              return (
                <button
                  type="button"
                  classList={{
                    "flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors": true,
                    "bg-v2-background-bg-layer-01 text-v2-text-text-strong": active(),
                    "text-v2-text-text-base hover:bg-v2-background-bg-layer-01": !active(),
                  }}
                  onClick={() => local.agent.set(agent.name)}
                >
                  <span class="flex w-full items-center gap-1.5 text-13-medium">
                    <span class="size-1.5 shrink-0 rounded-full" style={agent.color ? { background: agent.color } : undefined} />
                    <span class="truncate">{agent.name}</span>
                  </span>
                  <Show when={agent.description}>
                    <span class="line-clamp-2 text-11-regular text-v2-text-text-faint">{agent.description}</span>
                  </Show>
                </button>
              )
            }}
          </For>
        </div>
      </aside>
    </Show>
  )
}
