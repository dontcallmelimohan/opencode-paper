// [论文助手定制] 模型 API 配置管理：放弃 opencode 的 models.dev 目录/免费模型模式，
// 改为用户自己通过「名称 + Base URL + API Key + 模型 ID」添加 API 配置。
// 添加/编辑走 PATCH /global/config（provider 段），删除走后端 /thesis/model-api/remove。
import { createMemo, createSignal, For, Show } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { TextareaV2 } from "@opencode-ai/ui/v2/textarea-v2"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { useLocal } from "@/context/local"
import { useProviders } from "@/hooks/use-providers"
import { useServer } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { decode64 } from "@/utils/base64"
import { authTokenFromCredentials } from "@/utils/server"
import { showToast } from "@/utils/toast"
import type { Provider as ProviderInfo } from "@opencode-ai/sdk/v2/client"
import "./settings-v2.css"

type Draft = {
  id: string
  baseURL: string
  apiKey: string
  models: string
}

export const SettingsModelApisV2 = () => {
  const local = useLocal()
  const server = useServer()
  const serverSync = useServerSync()
  const directory = () => decode64(local.slug())
  const providers = useProviders(directory)

  // 只显示用户通过 API 配置添加的 provider（source === "config"），
  // models.dev 目录（custom/api/env）一律不展示。
  const configApis = createMemo<ProviderInfo[]>(() =>
    [...providers.all().values()].filter((provider) => provider.source === "config"),
  )

  const [editing, setEditing] = createSignal<Draft | null>(null)
  const [saving, setSaving] = createSignal(false)

  const startAdd = () => setEditing({ id: "", baseURL: "", apiKey: "", models: "" })

  const startEdit = (provider: ProviderInfo) => {
    const first = Object.values(provider.models)[0]
    setEditing({
      id: provider.id,
      baseURL: first?.api.url ?? "",
      apiKey: typeof provider.options?.apiKey === "string" ? provider.options.apiKey : "",
      models: Object.keys(provider.models).join("\n"),
    })
  }

  const save = async () => {
    const draft = editing()
    if (!draft) return
    const id = draft.id.trim()
    const baseURL = draft.baseURL.trim()
    const modelIDs = draft.models
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
    if (!id || !baseURL || modelIDs.length === 0) {
      showToast({ variant: "warning", title: "请填写名称、Base URL 和至少一个模型 ID" })
      return
    }
    setSaving(true)
    try {
      await serverSync.updateConfig({
        provider: {
          [id]: {
            name: id,
            api: baseURL,
            options: { apiKey: draft.apiKey.trim() },
            models: Object.fromEntries(modelIDs.map((modelID) => [modelID, { name: modelID, tool_call: true }])),
          },
        },
      })
      setEditing(null)
      showToast({ variant: "success", title: "模型 API 配置已保存" })
    } catch (error) {
      showToast({
        variant: "error",
        title: "保存失败",
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (providerID: string) => {
    const conn = server.current
    const base = conn?.http?.url
    if (!base) return
    const headers: Record<string, string> = {}
    if (conn?.type === "http" && conn.http.password) {
      headers["Authorization"] = `Basic ${authTokenFromCredentials({
        username: conn.http.username,
        password: conn.http.password,
      })}`
    }
    try {
      const response = await fetch(
        `${base}/thesis/model-api/remove?providerID=${encodeURIComponent(providerID)}`,
        { method: "POST", headers, credentials: "include" },
      )
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      serverSync.refreshProviders()
      showToast({ variant: "success", title: "已删除该模型 API 配置" })
    } catch (error) {
      showToast({
        variant: "error",
        title: "删除失败",
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <div class="settings-v2-tab-body">
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <h2 class="settings-v2-tab-title">模型 API 配置</h2>
        <div class="settings-v2-tab-description">
          在这里添加你自己的模型 API（名称 + Base URL + API Key + 模型 ID），
          添加后即可在模型选择器中使用。不再展示 opencode 内置的供应商目录与免费模型。
        </div>
      </div>

      <div class="flex flex-col gap-2 p-3">
        <For each={configApis()}>
          {(provider) => (
            <div class="flex flex-col gap-2 rounded-lg border-[0.5px] border-v2-border-border-muted bg-v2-background-bg-layer-02 p-3">
              <div class="flex items-center gap-2">
                <ProviderIcon id={provider.id} class="size-4 shrink-0 text-v2-icon-icon-base" />
                <span class="min-w-0 flex-1 truncate text-[13px] font-[530] text-v2-text-text-base">{provider.name}</span>
                <IconButtonV2 icon="pencil" size="small" variant="ghost" onClick={() => startEdit(provider)} aria-label="编辑" />
                <IconButtonV2 icon="trash" size="small" variant="ghost" onClick={() => void remove(provider.id)} aria-label="删除" />
              </div>
              <div class="flex flex-wrap gap-1">
                <For each={Object.keys(provider.models)}>
                  {(modelID) => (
                    <span class="rounded bg-v2-background-bg-base px-1.5 py-0.5 text-[11px] text-v2-text-text-muted">{modelID}</span>
                  )}
                </For>
              </div>
              <Show when={provider.models && Object.values(provider.models)[0]?.api.url}>
                {(url) => (
                  <div class="truncate text-[11px] text-v2-text-text-faint">{url()}</div>
                )}
              </Show>
            </div>
          )}
        </For>

        <Show
          when={configApis().length === 0}
          fallback={
            <ButtonV2 size="small" variant="neutral" class="self-start" onClick={startAdd}>
              添加 API 配置
            </ButtonV2>
          }
        >
          <div class="flex flex-col items-start gap-2 rounded-lg border-[0.5px] border-dashed border-v2-border-border-muted p-4">
            <span class="text-[13px] text-v2-text-text-muted">还没有配置任何模型 API。</span>
            <ButtonV2 size="small" variant="neutral" onClick={startAdd}>
              添加 API 配置
            </ButtonV2>
          </div>
        </Show>

        <Show when={editing()}>
          {(draft) => (
            <div class="flex flex-col gap-3 rounded-lg border-[0.5px] border-v2-border-border-focus bg-v2-background-bg-layer-02 p-3">
              <div class="flex flex-col gap-1.5">
                <label class="text-[12px] text-v2-text-text-muted">名称（唯一标识，如 my-api）</label>
                <TextInputV2
                  appearance="base"
                  placeholder="my-api"
                  value={draft().id}
                  disabled={configApis().some((item) => item.id === draft().id)}
                  onInput={(event) => setEditing({ ...draft(), id: event.currentTarget.value })}
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-[12px] text-v2-text-text-muted">Base URL（OpenAI 兼容接口，如 https://api.deepseek.com/v1）</label>
                <TextInputV2
                  appearance="base"
                  placeholder="https://api.example.com/v1"
                  value={draft().baseURL}
                  onInput={(event) => setEditing({ ...draft(), baseURL: event.currentTarget.value })}
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-[12px] text-v2-text-text-muted">API Key</label>
                <TextInputV2
                  appearance="base"
                  type="password"
                  placeholder="sk-..."
                  value={draft().apiKey}
                  onInput={(event) => setEditing({ ...draft(), apiKey: event.currentTarget.value })}
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-[12px] text-v2-text-text-muted">模型 ID（每行一个）</label>
                <TextareaV2
                  rows={4}
                  placeholder={"deepseek-chat\ndeepseek-reasoner"}
                  value={draft().models}
                  onInput={(event) => setEditing({ ...draft(), models: event.currentTarget.value })}
                />
              </div>
              <div class="flex items-center gap-2">
                <ButtonV2 size="small" variant="contrast" disabled={saving()} onClick={() => void save()}>
                  {saving() ? "保存中…" : "保存"}
                </ButtonV2>
                <ButtonV2 size="small" variant="neutral" onClick={() => setEditing(null)}>
                  取消
                </ButtonV2>
              </div>
            </div>
          )}
        </Show>
      </div>
    </div>
  )
}
