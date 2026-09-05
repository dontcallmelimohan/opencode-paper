// [论文助手定制] 模型 API 配置管理：放弃 opencode 的 models.dev 目录/免费模型模式，
// 改为用户自己通过「名称 + Base URL + API Key + 模型 ID」添加 API 配置。
// 添加/编辑走 PATCH /global/config（provider 段），删除走后端 /thesis/model-api/remove。
import { createMemo, createSignal, For, Show } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { Icon } from "@opencode-ai/ui/icon"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { TextareaV2 } from "@opencode-ai/ui/v2/textarea-v2"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { useServer } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { authTokenFromCredentials } from "@/utils/server"
import { showToast } from "@/utils/toast"
import type { Provider as ProviderInfo } from "@opencode-ai/sdk/v2/client"
import { SettingsListV2 } from "./parts/list"
import "./settings-v2.css"

type Draft = {
  id: string
  baseURL: string
  apiKey: string
  models: string
}

export const SettingsModelApisV2 = () => {
  const server = useServer()
  const serverSync = useServerSync()

  // [论文助手定制] 直接读全局 provider 数据（source === "config"），只显示用户通过 API 配置
  // 添加的 provider，models.dev 目录（custom/api/env）一律不展示。
  // 修复：旧实现依赖「当前论文目录」的 useProviders(local.slug())，在主页设置里没有目录上下文，
  // 组件一渲染就出错、面板变成空白；模型 API 本来就是全局配置，不应当按目录过滤。
  const configApis = createMemo<ProviderInfo[]>(() => {
    const all = serverSync().data.provider.all
    const values = all?.values?.() ?? []
    return [...values].filter((provider) => provider.source === "config")
  })

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
      showToast({ variant: "error", title: "请填写名称、Base URL 和至少一个模型 ID" })
      return
    }
    setSaving(true)
    try {
      await serverSync().updateConfig({
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
      serverSync().refreshProviders()
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
    <>
      <div class="settings-v2-tab-header settings-v2-modelapi-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">模型 API 配置</h2>
          <ButtonV2 variant="contrast" onClick={startAdd}>
            添加 API 配置
          </ButtonV2>
        </div>
      </div>

      <div class="settings-v2-tab-body settings-v2-modelapi">
        <Show
          when={configApis().length > 0}
          fallback={
            <div class="settings-v2-modelapi-empty">
              <span class="settings-v2-modelapi-empty-title">还没有配置任何模型 API</span>
              <span>
                添加一个 OpenAI 兼容接口（如 DeepSeek、通义千问、智谱等），
                配置后即可在会话与论文写作中选择对应模型。
              </span>
              <div class="settings-v2-modelapi-empty-action">
                <ButtonV2 variant="contrast" onClick={startAdd}>
                  添加 API 配置
                </ButtonV2>
              </div>
            </div>
          }
        >
          <div class="settings-v2-modelapi-list">
            <div class="settings-v2-modelapi-section-title">已配置 API</div>
            <SettingsListV2>
              <For each={configApis()}>
                {(provider) => {
                  const modelIDs = Object.keys(provider.models)
                  const firstModel = Object.values(provider.models)[0]
                  const url = firstModel?.api?.url
                  return (
                    <div class="settings-v2-modelapi-item">
                      <div class="settings-v2-modelapi-lead">
                        <ProviderIcon id={provider.id} class="size-4 shrink-0" />
                        <div class="settings-v2-modelapi-copy">
                          <div class="settings-v2-modelapi-name">{provider.name}</div>
                          <div class="settings-v2-modelapi-models">{modelIDs.join(" · ")}</div>
                          <Show when={url}>{(value) => <div class="settings-v2-modelapi-url">{value()}</div>}</Show>
                        </div>
                      </div>
                      <div class="settings-v2-modelapi-actions">
                        <IconButtonV2
                          icon={<Icon name="pencil-line" size="small" />}
                          size="small"
                          variant="ghost"
                          onClick={() => startEdit(provider)}
                          aria-label={`编辑 ${provider.name}`}
                        />
                        <IconButtonV2
                          icon={<Icon name="trash" size="small" />}
                          size="small"
                          variant="ghost"
                          onClick={() => void remove(provider.id)}
                          aria-label={`删除 ${provider.name}`}
                        />
                      </div>
                    </div>
                  )
                }}
              </For>
            </SettingsListV2>
          </div>
        </Show>

        <Show when={editing()}>
          {(draft) => {
            const isEdit = configApis().some((item) => item.id === draft().id)
            return (
              <div class="settings-v2-modelapi-form">
                <div class="settings-v2-modelapi-form-header">
                  <div class="settings-v2-modelapi-form-title">
                    <Show
                      when={isEdit}
                      fallback={<IconV2 name="plus" class="size-3.5 shrink-0 text-v2-icon-icon-base" />}
                    >
                      <ProviderIcon id={draft().id} class="size-4 shrink-0" />
                    </Show>
                    <span>{isEdit ? "编辑 API 配置" : "新增 API 配置"}</span>
                  </div>
                  <IconButtonV2
                    icon={<IconV2 name="close" size="small" />}
                    size="small"
                    variant="ghost"
                    onClick={() => setEditing(null)}
                    aria-label="关闭"
                  />
                </div>

                <div class="settings-v2-modelapi-form-grid">
                  <div class="settings-v2-modelapi-field">
                    <label class="settings-v2-modelapi-label">名称</label>
                    <TextInputV2
                      appearance="base"
                      placeholder="my-api"
                      value={draft().id}
                      disabled={isEdit}
                      aria-label="名称"
                      onInput={(event) => setEditing({ ...draft(), id: event.currentTarget.value })}
                    />
                    <span class="settings-v2-modelapi-hint">
                      全局唯一标识，例如 my-api；保存后不可修改。
                    </span>
                  </div>
                  <div class="settings-v2-modelapi-field">
                    <label class="settings-v2-modelapi-label">API Key</label>
                    <TextInputV2
                      appearance="base"
                      type="password"
                      placeholder="sk-..."
                      value={draft().apiKey}
                      aria-label="API Key"
                      onInput={(event) => setEditing({ ...draft(), apiKey: event.currentTarget.value })}
                    />
                    <span class="settings-v2-modelapi-hint">用于请求该接口的密钥。</span>
                  </div>
                  <div class="settings-v2-modelapi-field settings-v2-modelapi-field--full">
                    <label class="settings-v2-modelapi-label">Base URL</label>
                    <TextInputV2
                      appearance="base"
                      placeholder="https://api.example.com/v1"
                      value={draft().baseURL}
                      aria-label="Base URL"
                      onInput={(event) => setEditing({ ...draft(), baseURL: event.currentTarget.value })}
                    />
                    <span class="settings-v2-modelapi-hint">
                      OpenAI 兼容的接口地址，例如 https://api.deepseek.com/v1
                    </span>
                  </div>
                  <div class="settings-v2-modelapi-field settings-v2-modelapi-field--full">
                    <label class="settings-v2-modelapi-label">模型 ID</label>
                    <TextareaV2
                      rows={4}
                      placeholder={"deepseek-chat\ndeepseek-reasoner"}
                      value={draft().models}
                      aria-label="模型 ID"
                      onInput={(event) => setEditing({ ...draft(), models: event.currentTarget.value })}
                    />
                    <span class="settings-v2-modelapi-hint">每行一个，对应接口实际支持的模型名称。</span>
                  </div>
                </div>

                <div class="settings-v2-modelapi-form-footer">
                  <ButtonV2 variant="neutral" onClick={() => setEditing(null)}>
                    取消
                  </ButtonV2>
                  <ButtonV2 variant="contrast" disabled={saving()} onClick={() => void save()}>
                    {saving() ? "保存中…" : "保存"}
                  </ButtonV2>
                </div>
              </div>
            )
          }}
        </Show>
      </div>
    </>
  )
}
