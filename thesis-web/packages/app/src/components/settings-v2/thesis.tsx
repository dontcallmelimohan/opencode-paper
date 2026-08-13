import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { Component, Show, createEffect, createSignal } from "solid-js"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

export const SettingsThesisV2: Component = () => {
  const sdk = useServerSDK()
  const queryClient = useQueryClient()
  const [value, setValue] = createSignal<string | undefined>(undefined)

  const config = useQuery(() => ({
    queryKey: ["thesis-settings-config"],
    queryFn: async () => {
      const res = await sdk().client.global.config.get()
      if (res.error) throw new Error("读取配置失败")
      return res.data
    },
  }))

  createEffect(() => {
    if (value() === undefined && config.data) setValue(config.data.thesisWorkspace ?? "")
  })

  const save = useMutation(() => ({
    mutationFn: async () => {
      const current = config.data ?? {}
      const next = value()?.trim() || ""
      const res = await sdk().client.global.config.update({ config: { ...current, thesisWorkspace: next } })
      if (res.error) {
        // Config changes dispose running instances; the update endpoint can
        // return 500 even though the change was already persisted.
        const check = await sdk().client.global.config.get()
        const persisted = check.data?.thesisWorkspace?.trim() || ""
        if (persisted !== next) throw new Error("保存配置失败")
      }
      return next
    },
    onSuccess: (next) => {
      void queryClient.invalidateQueries({ queryKey: ["thesis-settings-config"] })
      showToast({
        variant: "success",
        icon: "circle-check",
        title: next ? `论文工作区已设置为 ${next}` : "已恢复默认论文工作区",
      })
    },
    onError: (err) => {
      showToast({ variant: "error", title: err instanceof Error ? err.message : String(err) })
    },
  }))

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">论文设置</h2>
      </div>
      <div class="settings-v2-tab-body">
        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">论文工作区</h3>
          <SettingsListV2>
            <SettingsRowV2 title="论文工作区路径" description="新论文创建时存放的根目录，留空则使用默认 ~/thesis-workspace">
              <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <div class="w-full sm:w-[280px]">
                  <TextInputV2
                    data-action="settings-thesis-workspace"
                    type="text"
                    appearance="base"
                    value={value() ?? ""}
                    placeholder="~/thesis-workspace"
                    spellcheck={false}
                    autocorrect="off"
                    autocomplete="off"
                    autocapitalize="off"
                    aria-label="论文工作区路径"
                    onInput={(event) => setValue(event.currentTarget.value)}
                  />
                </div>
                <Show when={config.data || config.isError}>
                  <ButtonV2
                    size="normal"
                    variant="contrast"
                    disabled={save.isPending}
                    onClick={() => save.mutate()}
                  >
                    {save.isPending ? "保存中…" : "保存"}
                  </ButtonV2>
                </Show>
              </div>
            </SettingsRowV2>
          </SettingsListV2>
        </div>
      </div>
    </>
  )
}
