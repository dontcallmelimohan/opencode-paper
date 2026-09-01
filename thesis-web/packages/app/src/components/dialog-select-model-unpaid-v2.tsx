import { DialogBody, DialogHeader, DialogTitle, DialogV2 } from "@opencode-ai/ui/v2/dialog-v2"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createMemo, onCleanup, onMount, type Component, For, Show } from "solid-js"
import { useLocal } from "@/context/local"
import { useLanguage } from "@/context/language"

type ModelState = ReturnType<typeof useLocal>["model"]
type ModelListItem = ReturnType<ModelState["list"]>[number]
// [论文助手定制] 模型选择器只显示用户通过「模型 API 配置」添加的模型，
// 不再展示 opencode 的免费模型与供应商目录。
const openModelSettings = (dialog: ReturnType<typeof useDialog>) => {
  void import("./settings-v2/dialog-settings-v2").then((x) => {
    dialog.close()
    void dialog.show(() => <x.DialogSettings defaultValue="models" />)
  })
}

export const DialogSelectModelUnpaidV2: Component<{ model?: ModelState }> = (props) => {
  const local = useLocal()
  const model = props.model ?? local.model
  const dialog = useDialog()
  const language = useLanguage()
  const modelKey = (item: ReturnType<ModelState["list"]>[number]) => `${item.provider.id}:${item.id}`
  const currentKey = createMemo(() => {
    const c = model.current()
    return c ? `${c.provider.id}:${c.id}` : undefined
  })
  // [论文助手定制] 只显示 API 配置添加的模型（source === "config"）。
  const configModels = createMemo(() =>
    model
      .list()
      .filter((item) => item.provider.source === "config")
      .sort((a, b) => a.provider.name.localeCompare(b.provider.name) || a.name.localeCompare(b.name)),
  )
  const grouped = createMemo(() => {
    const groups: Array<{ provider: string; items: ModelListItem[] }> = []
    for (const item of configModels()) {
      const last = groups[groups.length - 1]
      if (last && last.provider === item.provider.name) last.items.push(item)
      else groups.push({ provider: item.provider.name, items: [item] })
    }
    return groups
  })

  const selectModel = (item: ReturnType<ModelState["list"]>[number]) => {
    model.set({ modelID: item.id, providerID: item.provider.id }, { recent: true })
    dialog.close()
  }

  // Focus starts on the dialog's close button, outside the list, so listen at the
  // document level while the dialog is mounted instead of on the list container.
  let listEl: HTMLDivElement | undefined
  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
      if (!listEl) return
      const buttons = Array.from(listEl.querySelectorAll<HTMLButtonElement>("button"))
      if (buttons.length === 0) return
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const next =
        index < 0 ? (e.key === "ArrowDown" ? 0 : buttons.length - 1) : index + (e.key === "ArrowDown" ? 1 : -1)
      buttons[(next + buttons.length) % buttons.length]?.focus()
      e.preventDefault()
    }
    document.addEventListener("keydown", handleKeyDown)
    onCleanup(() => document.removeEventListener("keydown", handleKeyDown))
  })

  return (
    <DialogV2
      fit
      containerClass="!h-auto max-h-[calc(100vh_-_16px)] !w-[min(calc(100vw_-_16px),640px)]"
      class="[font-family:var(--v2-font-family-sans)] [&_[data-slot=dialog-header]]:!px-5 [&_[data-slot=dialog-header-title]]:!text-[15px] [&_[data-slot=dialog-header-title]]:!tracking-[-0.13px]"
    >
      <DialogHeader closeLabel={language.t("common.close")}>
        <DialogTitle>{language.t("dialog.model.select.title")}</DialogTitle>
      </DialogHeader>
      <DialogBody class="max-h-[calc(100vh_-_68px)] min-h-0 flex-none gap-0 overflow-y-auto px-2 pb-2">
        <div ref={listEl} class="flex min-h-0 flex-col gap-2">
          <Show
            when={configModels().length > 0}
            fallback={
              <div class="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <Icon name="models" class="size-6 text-v2-icon-icon-faint" />
                <span class="text-[13px] text-v2-text-text-muted">
                  还没有配置任何模型 API，先添加一个（名称 + Base URL + API Key + 模型 ID）。
                </span>
                <ButtonV2 size="small" variant="contrast" onClick={() => openModelSettings(dialog)}>
                  添加 API 配置
                </ButtonV2>
              </div>
            }
          >
            <For each={grouped()}>
              {(group) => (
                <div class="flex w-full flex-col">
                  <div class="flex h-7 items-center px-2 text-[11px] font-[440] uppercase tracking-wide text-v2-text-text-faint">
                    {group.provider}
                  </div>
                  <For each={group.items}>
                    {(item) => (
                      <button
                        type="button"
                        class="flex w-full scroll-my-3.5 flex-row items-center gap-1.5 rounded-md px-3 py-2 text-left text-[13px] font-[530] leading-5 tracking-[-0.04px] text-v2-text-text-base [font-family:var(--v2-font-family-sans)] [font-variation-settings:'slnt'_0] hover:bg-v2-overlay-simple-overlay-hover focus:bg-v2-overlay-simple-overlay-hover focus:outline-none"
                        onClick={() => selectModel(item)}
                      >
                        <span class="min-w-0 truncate">{item.name}</span>
                        <Show when={currentKey() === modelKey(item)}>
                          <Icon name="check" class="ml-auto size-4 shrink-0 text-v2-icon-icon-base" />
                        </Show>
                      </button>
                    )}
                  </For>
                </div>
              )}
            </For>
            <div class="mt-1 flex items-center justify-between border-t-[0.5px] border-v2-border-border-muted pt-2">
              <span class="text-[11px] text-v2-text-text-faint">{configModels().length} 个模型</span>
              <ButtonV2 size="small" variant="neutral" onClick={() => openModelSettings(dialog)}>
                管理 API 配置
              </ButtonV2>
            </div>
          </Show>
        </div>
      </DialogBody>
    </DialogV2>
  )
}
