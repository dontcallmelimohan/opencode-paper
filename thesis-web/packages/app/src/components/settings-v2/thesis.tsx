// [论文助手定制] 论文设置：面向本平台的写作偏好，而不是 opencode 的编辑器配置。
// 目前包含「论文工作区根目录」与「写作默认模型」两项，均写入全局 config。
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { SelectV2 } from "@opencode-ai/ui/v2/select-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { Component, Show, createEffect, createMemo, createSignal } from "solid-js"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

type ModelChoice = { value: string; label: string }

const AUTO_MODEL = "auto"

export const SettingsThesisV2: Component = () => {
  const sdk = useServerSDK()
  const serverSync = useServerSync()
  const queryClient = useQueryClient()
  const [value, setValue] = createSignal<string | undefined>(undefined)
  const [savingModel, setSavingModel] = createSignal(false)

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
  const savedValue = createMemo(() => config.data?.thesisWorkspace?.trim() ?? "")
  const currentValue = createMemo(() => value()?.trim() ?? savedValue())
  const dirty = createMemo(() => currentValue() !== savedValue())

  // [论文助手定制] 只列出用户自己通过「模型与 API」添加的接口，与模型 API 页保持一致。
  const modelOptions = createMemo<ModelChoice[]>(() => {
    const providers = [...(serverSync().data.provider.all?.values?.() ?? [])].filter(
      (provider) => provider.source === "config",
    )
    return [
      { value: AUTO_MODEL, label: "自动选择（默认）" },
      ...providers.flatMap((provider) =>
        Object.keys(provider.models).map((modelID) => ({
          value: `${provider.id}/${modelID}`,
          label: `${provider.name} · ${modelID}`,
        })),
      ),
    ]
  })

  const currentModel = createMemo(() => {
    const stored = config.data?.model?.trim()
    if (!stored) return AUTO_MODEL
    return modelOptions().some((option) => option.value === stored) ? stored : AUTO_MODEL
  })

  const updateConfig = async (next: Record<string, unknown>) => {
    const res = await sdk().client.global.config.update({ config: next })
    if (!res.error) return
    // Config changes dispose running instances; the update endpoint can
    // return 500 even though the change was already persisted.
    const check = await sdk().client.global.config.get()
    if (check.error) throw new Error("保存配置失败")
    const saved = (check.data ?? {}) as Record<string, unknown>
    for (const key of ["thesisWorkspace", "model"]) {
      if ((next[key] ?? "") !== (saved[key] ?? "")) throw new Error("保存配置失败")
    }
  }

  const save = useMutation(() => ({
    mutationFn: async () => {
      const next = currentValue()
      await updateConfig({ ...(config.data ?? {}), thesisWorkspace: next })
      return next
    },
    onSuccess: (next) => {
      setValue(next)
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

  const selectModel = async (choice: ModelChoice) => {
    setSavingModel(true)
    try {
      // 配置更新走 JSONC 合并：null 表示删除该键，模型选择会回落到自动挑选。
      const next = { ...(config.data ?? {}) } as Record<string, unknown>
      next.model = choice.value === AUTO_MODEL ? null : choice.value
      await updateConfig(next)
      void queryClient.invalidateQueries({ queryKey: ["thesis-settings-config"] })
      showToast({
        variant: "success",
        icon: "circle-check",
        title: choice.value === AUTO_MODEL ? "已改为自动选择模型" : `写作默认模型已设置为 ${choice.label}`,
      })
    } catch (err) {
      showToast({ variant: "error", title: err instanceof Error ? err.message : String(err) })
    } finally {
      setSavingModel(false)
    }
  }

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">论文设置</h2>
      </div>
      <div class="settings-v2-tab-body">
        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">论文工作区</h3>
          <SettingsListV2>
            <SettingsRowV2
              title="论文工作区路径"
              description="新论文的存放根目录，留空则使用默认的 ~/thesis-workspace。"
            >
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
                <ButtonV2
                  size="normal"
                  variant="ghost-muted"
                  disabled={!dirty() || save.isPending}
                  onClick={() => setValue("")}
                >
                  恢复默认
                </ButtonV2>
                <Show when={config.data || config.isError}>
                  <ButtonV2
                    size="normal"
                    variant="contrast"
                    disabled={save.isPending || !dirty()}
                    onClick={() => save.mutate()}
                  >
                    {save.isPending ? "保存中…" : "保存"}
                  </ButtonV2>
                </Show>
              </div>
            </SettingsRowV2>
          </SettingsListV2>
        </div>

        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">写作模型</h3>
          <SettingsListV2>
            <SettingsRowV2
              title="默认写作模型"
              description="新建会话与论文写作时默认使用的模型。可选「自动选择」交给平台判断，或在「模型与 API」中添加接口后在此指定。"
            >
              <Show
                when={modelOptions().length > 1}
                fallback={<span class="text-12-regular text-v2-text-text-faint">请先在「模型与 API」中添加接口</span>}
              >
                <SelectV2
                  appearance="inline"
                  data-action="settings-thesis-model"
                  options={modelOptions()}
                  current={modelOptions().find((option) => option.value === currentModel()) ?? modelOptions()[0]}
                  placement="bottom-end"
                  gutter={6}
                  disabled={savingModel()}
                  value={(option) => option.value}
                  label={(option) => option.label}
                  onSelect={(option) => option && void selectModel(option)}
                />
              </Show>
            </SettingsRowV2>
          </SettingsListV2>
        </div>
      </div>
    </>
  )
}
