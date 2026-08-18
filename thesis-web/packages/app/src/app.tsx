import "@/index.css"
import * as Sentry from "@sentry/solid"
import { I18nProvider } from "@opencode-ai/ui/context"
import { DialogProvider } from "@opencode-ai/ui/context/dialog"
import { FileComponentProvider } from "@opencode-ai/ui/context/file"
import { File } from "@opencode-ai/session-ui/file"
import { Font } from "@opencode-ai/ui/font"
import { Splash } from "@opencode-ai/ui/logo"
import { ThemeProvider } from "@opencode-ai/ui/theme/context"
import { MetaProvider } from "@solidjs/meta"
import {
  type BaseRouterProps,
  Navigate,
  Route,
  Router,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "@solidjs/router"
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import { Effect } from "effect"
import { base64Encode } from "@opencode-ai/core/util/encode"
import {
  type Component,
  createEffect,
  createMemo,
  createRenderEffect,
  createResource,
  createSignal,
  ErrorBoundary,
  For,
  type JSX,
  lazy,
  onCleanup,
  type ParentProps,
  Show,
  Suspense,
} from "solid-js"
import { Dynamic } from "solid-js/web"
import { makeEventListener } from "@solid-primitives/event-listener"
import { CommandProvider, useCommand, type CommandOption } from "@/context/command"
import { CommentsProvider } from "@/context/comments"
import { FileProvider } from "@/context/file"
import { ServerSDKProvider, useServerSDK } from "@/context/server-sdk"
import { ServerSyncProvider, useServerSync } from "@/context/server-sync"
import { GlobalProvider, useGlobal } from "@/context/global"
import { HighlightsProvider } from "@/context/highlights"
import { LanguageProvider, type Locale, useLanguage } from "@/context/language"
import { LayoutProvider } from "@/context/layout"
import { ModelsProvider } from "@/context/models"
import { NotificationProvider } from "@/context/notification"
import { PermissionProvider } from "@/context/permission"
import { usePlatform } from "@/context/platform"
import { PromptProvider } from "@/context/prompt"
import { ServerConnection, ServerProvider, serverName, useServer } from "@/context/server"
import { SettingsProvider, useSettings } from "@/context/settings"
import { TabsProvider, useTabs, type DraftTab } from "@/context/tabs"
import { SDKProvider, useSDK } from "@/context/sdk"
import { setBackToWorkbench } from "@/utils/back-to-workbench"
import { WslServersProvider } from "@/wsl/context"
import DirectoryLayout, { decodeDirectory, DirectoryDataProvider } from "@/pages/directory-layout"
import LegacyLayout from "@/pages/layout"
import NewLayout from "@/pages/layout-new"
import { ErrorPage } from "./pages/error"
import { useCheckServerHealth } from "./utils/server-health"
import { legacySessionHref, legacySessionServer, requireServerKey, sessionHref } from "./utils/session-route"
import { createSessionLineage } from "@/pages/session/session-lineage"

import { SessionPage, SessionRouteErrorBoundary, TargetSessionRouteContent } from "@/pages/session"
import { NewHome } from "@/pages/home"
import { LegacyHome } from "@/pages/home/legacy-home"
import { ThesisSkillsPage } from "@/pages/skills"

const NewSession = lazy(() => import("@/pages/new-session"))
// [论文助手定制] 论文工作台：四步标准化流程页面（提纲→写作→排版→评审）。
const ThesisWorkbench = lazy(() => import("@/pages/thesis-workbench"))

// [论文助手定制] 论文工作台独立顶层路由：
// 提供与 DirectoryLayout 相同的 SDK / 数据同步上下文，直接渲染在新布局主区域。
// 之前把工作台挂在 /:dir 旧版布局下，会被新布局 main 的 items-start 挤压成窄条（排版错乱），
// 这里改为和会话页一样的自给自足路由，避免嵌套旧版侧边栏布局。
function ThesisWorkbenchRoute() {
  const params = useParams<{ dir: string }>()
  const resolved = createMemo(() => decodeDirectory(params.dir) ?? "")

  return (
    <Show when={resolved()} keyed>
      {(dir) => (
        <ServerSDKProvider>
          <ServerSyncProvider>
            {/* [论文助手定制] LayoutProvider：让工作台在旧版布局（无侧边栏外壳）下也能读取项目列表 */}
            <LayoutProvider>
              {/* [论文助手定制] ModelsProvider：完整会话输入框（PromptInputV2）的模型选择依赖它 */}
              <ModelsProvider directory={() => dir}>
                <SDKProvider directory={dir}>
                  <DirectoryDataProvider directory={dir}>
                    {/* [论文助手定制] DraftProviders（File/Prompt/Comments）：PromptInput 依赖文件搜索、
                        prompt 状态与评论上下文；会话视图接入完整输入框后必须提供，否则输入框组件会报错。 */}
                    <DraftProviders>
                      <Suspense fallback={<div class="size-full" />}>
                        <ThesisWorkbench />
                      </Suspense>
                    </DraftProviders>
                  </DirectoryDataProvider>
                </SDKProvider>
              </ModelsProvider>
            </LayoutProvider>
          </ServerSyncProvider>
        </ServerSDKProvider>
      )}
    </Show>
  )
}

const SessionRoute = () => {
  const settings = useSettings()
  const params = useParams()
  const [search] = useSearchParams<{ draftId?: string; prompt?: string }>()
  const sdk = useSDK()
  const server = useServer()
  const tabs = useTabs()

  if (params.id && settings.general.newLayoutDesigns()) {
    const sessionID = params.id
    return (
      <Show when={tabs.ready()}>
        {(_) => {
          const persisted = tabs.store.filter((item) => item.type === "session")
          return <Navigate href={sessionHref(legacySessionServer(persisted, sessionID, server.key), sessionID)} />
        }}
      </Show>
    )
  }

  // When the new layout is enabled, the legacy new-session route (/:dir/session with no id)
  // is replaced by a draft at /new-session?draftId=…
  createEffect(() => {
    if (!settings.general.newLayoutDesigns()) return
    if (params.id || search.draftId) return
    if (!tabs.ready() || !sdk().directory) return
    tabs.newDraft({ server: server.key, directory: sdk().directory }, search.prompt)
  })

  return (
    <SessionRouteErrorBoundary sessionID={params.id}>
      <SessionPage />
    </SessionRouteErrorBoundary>
  )
}

function TargetServerRoute(props: ParentProps) {
  const params = useParams<{ serverKey: string; id: string }>()
  const global = useGlobal()
  const conn = createMemo(() => {
    const key = requireServerKey(params.serverKey)
    return global.servers.list().find((item) => ServerConnection.key(item) === key)
  })

  return (
    // Owns the server-identity remount. Session changes must NOT remount this
    // subtree (SessionRouteErrorBoundary resets and createSessionLineage
    // re-resolves reactively instead); both rely on this key for server changes.
    <Show when={requireServerKey(params.serverKey)} keyed>
      <ServerSDKProvider server={conn}>
        <ServerSyncProvider server={conn}>{props.children}</ServerSyncProvider>
      </ServerSDKProvider>
    </Show>
  )
}

function TargetSessionRoute() {
  const params = useParams<{ serverKey: string; id: string }>()
  const serverSDK = useServerSDK()
  const navigate = useNavigate()
  // [论文助手定制] 顶部标题栏已整个删除，会话页需要返回工作台的入口：
  // /server/... 路由下没有 directory-scoped 的 SDK，改用 useServerSDK 拉会话信息拿到所属论文目录，
  // 按钮本身挂载到会话标题行（与标题并列，不再悬浮遮挡标题）。
  const [sessionInfo] = createResource(
    () => params.id,
    async (id) => {
      if (!id) return undefined
      const result = await serverSDK().client.session.get({ sessionID: id })
      return result.data
    },
  )
  createEffect(() => {
    setBackToWorkbench({
      onClick: () => {
        const directory = sessionInfo()?.directory
        navigate(directory ? `/${base64Encode(directory)}/workbench` : "/")
      },
    })
  })
  onCleanup(() => setBackToWorkbench(undefined))
  return (
    <TargetServerRoute>
      <TargetSessionRouteContent />
    </TargetServerRoute>
  )
}

function LegacyTargetSessionRoute() {
  const params = useParams<{ serverKey: string; id: string }>()
  return (
    <TargetServerRoute>
      <SessionRouteErrorBoundary sessionID={params.id} serverKey={requireServerKey(params.serverKey)}>
        <LegacyTargetSessionRedirect />
      </SessionRouteErrorBoundary>
    </TargetServerRoute>
  )
}

function LegacyTargetSessionRedirect() {
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const sync = useServerSync()
  const current = createSessionLineage(
    () => params.id,
    () => sync().session.lineage,
  )

  createEffect(() => {
    const directory = current()?.session.directory
    if (!directory) return
    navigate(legacySessionHref(directory, params.id), { replace: true })
  })

  return null
}

// Wraps the non-draft routes. They are gated on (and keyed to) the globally selected
// server via ServerKey, then provide the server-scoped shell for that server.
function SelectedServerProviders(props: ParentProps) {
  return (
    <ServerKey>
      <ServerSDKProvider>
        <ServerSyncProvider>{props.children}</ServerSyncProvider>
      </ServerSDKProvider>
    </ServerKey>
  )
}

function LegacyServerLayout(props: ParentProps<{ serverScoped?: JSX.Element }>) {
  return (
    <SelectedServerProviders>
      <LegacyServerScopedShell serverScoped={props.serverScoped}>{props.children}</LegacyServerScopedShell>
    </SelectedServerProviders>
  )
}

function DraftRoute() {
  const [search] = useSearchParams<{ draftId?: string }>()
  const settings = useSettings()
  const tabs = useTabs()
  return (
    <Show when={tabs.ready()}>
      <Show
        when={tabs.store.find((tab): tab is DraftTab => tab.type === "draft" && tab.draftID === search.draftId)}
        keyed
        fallback={<Navigate href="/" />}
      >
        {(draft) => (
          <Show
            when={settings.general.newLayoutDesigns()}
            fallback={<Navigate href={`/${base64Encode(draft.directory)}/session`} />}
          >
            <ResolvedDraftRoute draft={draft} />
          </Show>
        )}
      </Show>
    </Show>
  )
}

function ResolvedDraftRoute(props: { draft: DraftTab }) {
  const global = useGlobal()
  const conn = createMemo(() => global.servers.list().find((item) => ServerConnection.key(item) === props.draft.server))
  const directory = () => props.draft.directory
  const serverKey = () => props.draft.server

  return (
    <Show when={`${props.draft.server}\0${props.draft.directory}`} keyed>
      <ServerSDKProvider server={conn}>
        <ServerSyncProvider server={conn}>
          <ModelsProvider directory={directory}>
            <SDKProvider directory={directory}>
              <DirectoryDataProvider directory={directory} server={serverKey}>
                <DraftProviders>
                  <NewSession />
                </DraftProviders>
              </DirectoryDataProvider>
            </SDKProvider>
          </ModelsProvider>
        </ServerSyncProvider>
      </ServerSDKProvider>
    </Show>
  )
}

function UiI18nBridge(props: ParentProps) {
  const language = useLanguage()
  return (
    <I18nProvider
      value={{ locale: language.intl, layoutLocale: language.layoutLocale, t: language.t, plural: language.plural }}
    >
      {props.children}
    </I18nProvider>
  )
}

function LayoutCompatibility(props: ParentProps) {
  const global = useGlobal()
  const navigate = useNavigate()
  const server = useServer()
  const settings = useSettings()

  createEffect(() => {
    if (settings.general.newLayoutDesigns()) return
    const current = server.current
    if (!current) return
    const protocol = global.ensureServerCtx(current).sdk.protocolKind()
    if (protocol !== "v2") return
    const next = global.servers.list().find((s) => {
      if (ServerConnection.key(s) === ServerConnection.key(current)) return false
      return global.ensureServerCtx(s).sdk.protocolKind() !== "v2"
    })
    if (!next) return
    navigate("/")
    queueMicrotask(() => server.setActive(ServerConnection.key(next)))
  })

  return <>{props.children}</>
}

declare global {
  interface Window {
    __OPENCODE__?: {
      deepLinks?: string[]
    }
    api?: {
      setTitlebar?: (theme: { mode: "light" | "dark"; scheme?: "system" | "light" | "dark" }) => Promise<void>
      exportDebugLogs?: () => Promise<string>
    }
  }
}

function QueryProvider(props: ParentProps) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnReconnect: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
      },
    },
  })
  return <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
}

function BodyDesignClass() {
  const settings = useSettings()

  createRenderEffect(() => {
    if (typeof document === "undefined") return

    const enabled = settings.general.newLayoutDesigns()
    document.body.toggleAttribute("data-new-layout", enabled)
    document.body.classList.toggle("text-12-regular", !enabled)
    document.body.classList.toggle("font-(family-name:--font-family-text)", enabled)
    document.body.classList.toggle("text-[13px]", enabled)
    document.body.classList.toggle("font-[440]", enabled)
  })

  return null
}

// Server-agnostic providers shared across every route. These live in the shared
// shell (router root) so they stay mounted regardless of the active server/route.
function SharedProviders(props: ParentProps) {
  return (
    <>
      <BodyDesignClass />
      <CommandProvider>
        <DesktopCommands />
        <HighlightsProvider>{props.children}</HighlightsProvider>
      </CommandProvider>
    </>
  )
}

function DesktopCommands() {
  const command = useCommand()
  const language = useLanguage()
  const platform = usePlatform()

  command.register("desktop", () => {
    const commands: CommandOption[] = []
    if (platform.platform === "desktop" && platform.exportDebugLogs) {
      commands.push({
        id: "logs.export",
        title: language.t("command.logs.export"),
        category: language.t("command.category.settings"),
        onSelect: () => {
          void platform.exportDebugLogs?.()
        },
      })
    }
    return commands
  })

  return null
}

// Server-scoped providers shared by the legacy shell and the top-level new shell.
type ServerScopedShellProps = ParentProps<{
  directory?: () => string | undefined
  serverScoped?: JSX.Element
}>

function ServerScopedProviders(props: ServerScopedShellProps) {
  return (
    <LayoutProvider>
      {props.serverScoped}
      <ModelsProvider directory={props.directory}>{props.children}</ModelsProvider>
    </LayoutProvider>
  )
}

function LegacyServerScopedShell(props: ServerScopedShellProps) {
  return (
    <ServerScopedProviders directory={props.directory} serverScoped={props.serverScoped}>
      <LegacyLayout>{props.children}</LegacyLayout>
    </ServerScopedProviders>
  )
}

function NewAppLayout(props: ParentProps<{ serverScoped?: JSX.Element }>) {
  return (
    <SelectedServerProviders>
      <ServerScopedProviders serverScoped={props.serverScoped}>
        <NewLayout>{props.children}</NewLayout>
      </ServerScopedProviders>
    </SelectedServerProviders>
  )
}

// The draft page only renders the prompt composer, so it drops TerminalProvider.
// FileProvider and CommentsProvider stay because PromptInput uses file search and comment context.
function DraftProviders(props: ParentProps) {
  return (
    <FileProvider>
      <PromptProvider>
        <CommentsProvider>{props.children}</CommentsProvider>
      </PromptProvider>
    </FileProvider>
  )
}

export function AppBaseProviders(
  props: ParentProps<{
    locale?: Locale
    onNativeTranslations?: Parameters<typeof LanguageProvider>[0]["onNativeTranslations"]
  }>,
) {
  return (
    <MetaProvider>
      <Font />
      <ThemeProvider
        onThemeApplied={(_, mode, scheme) => {
          void window.api?.setTitlebar?.({ mode, scheme })
        }}
      >
        <LanguageProvider locale={props.locale} onNativeTranslations={props.onNativeTranslations}>
          <UiI18nBridge>
            <ErrorBoundary
              fallback={(error) => {
                Sentry.captureException(error)
                return <ErrorPage error={error} />
              }}
            >
              <QueryProvider>
                <WslServersProvider>
                  <DialogProvider>
                    <FileComponentProvider component={File}>{props.children}</FileComponentProvider>
                  </DialogProvider>
                </WslServersProvider>
              </QueryProvider>
            </ErrorBoundary>
          </UiI18nBridge>
        </LanguageProvider>
      </ThemeProvider>
    </MetaProvider>
  )
}

function ConnectionGate(props: ParentProps<{ disableHealthCheck?: boolean; startup?: Promise<void> }>) {
  const server = useServer()
  const checkServerHealth = useCheckServerHealth()

  const [checkMode, setCheckMode] = createSignal<"blocking" | "background">("blocking")

  // performs repeated health check with a grace period for
  // non-http connections, otherwise fails instantly
  const [startupHealthCheck, healthCheckActions] = createResource(() =>
    props.disableHealthCheck
      ? true
      : Effect.gen(function* () {
          if (!server.current) return true
          const { http, type } = server.current

          while (true) {
            const res = yield* Effect.promise(() => checkServerHealth(http))
            if (res.healthy) return true
            if (checkMode() === "background" || type === "http") return false
          }
        }).pipe(
          Effect.timeoutOrElse({ duration: "10 seconds", orElse: () => Effect.succeed(false) }),
          Effect.ensuring(Effect.sync(() => setCheckMode("background"))),
          Effect.runPromise,
        ),
  )
  const checking = createMemo(
    () => checkMode() === "blocking" && ["unresolved", "pending"].includes(startupHealthCheck.state),
  )
  const [startup] = createResource(async () => {
    if (!props.startup) return true
    await props.startup.catch((error) => {
      console.error("[startup] startup gate failed", error)
    })
    return true
  })
  const startupChecking = createMemo(
    () => startupHealthCheck.latest === true && ["unresolved", "pending"].includes(startup.state),
  )
  const loading = createMemo(() => checking() || startupChecking())

  return (
    <>
      <Show when={!checking()}>
        <Show
          when={startupHealthCheck.latest}
          fallback={
            <ConnectionError
              onRetry={() => {
                if (checkMode() === "background") void healthCheckActions.refetch()
              }}
              onServerSelected={(key) => {
                setCheckMode("blocking")
                server.setActive(key)
                void healthCheckActions.refetch()
              }}
            />
          }
        >
          {props.children}
        </Show>
      </Show>
      <Show when={loading()}>
        <div class="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background-base">
          <Splash class="w-16 h-20 opacity-50 animate-pulse" />
        </div>
      </Show>
    </>
  )
}

function ConnectionError(props: { onRetry?: () => void; onServerSelected?: (key: ServerConnection.Key) => void }) {
  const language = useLanguage()
  const server = useServer()
  const others = () => server.list.filter((s) => ServerConnection.key(s) !== server.key)
  const name = createMemo(() => server.name || server.key)
  const serverToken = "\u0000server\u0000"
  const unreachable = createMemo(() => language.t("app.server.unreachable", { server: serverToken }).split(serverToken))

  const timer = setInterval(() => props.onRetry?.(), 1000)
  onCleanup(() => clearInterval(timer))

  return (
    <div class="h-dvh w-screen flex flex-col items-center justify-center bg-background-base gap-6 p-6">
      <div class="flex flex-col items-center max-w-md text-center">
        <Splash class="w-12 h-15 mb-4" />
        <p class="text-14-regular text-text-base">
          {unreachable()[0]}
          <span class="text-text-strong font-medium">{name()}</span>
          {unreachable()[1]}
        </p>
        <p class="mt-1 text-12-regular text-text-weak">{language.t("app.server.retrying")}</p>
      </div>
      <Show when={others().length > 0}>
        <div class="flex flex-col gap-2 w-full max-w-sm">
          <span class="text-12-regular text-text-base text-center">{language.t("app.server.otherServers")}</span>
          <div class="flex flex-col gap-1 bg-surface-base rounded-lg p-2">
            <For each={others()}>
              {(conn) => {
                const key = ServerConnection.key(conn)
                return (
                  <button
                    type="button"
                    class="flex items-center gap-3 w-full px-3 py-2 rounded-md hover:bg-surface-raised-base-hover transition-colors text-left"
                    onClick={() => props.onServerSelected?.(key)}
                  >
                    <span class="text-14-regular text-text-strong truncate">{serverName(conn)}</span>
                  </button>
                )
              }}
            </For>
          </div>
        </div>
      </Show>
    </div>
  )
}

function ServerKey(props: ParentProps) {
  const server = useServer()
  return (
    <Show when={server.key} keyed>
      {props.children}
    </Show>
  )
}

export function AppInterface(props: {
  children?: JSX.Element
  defaultServer: ServerConnection.Key
  canonicalLocalServer?: ServerConnection.Key
  servers?: Array<ServerConnection.Any>
  router?: Component<BaseRouterProps>
  disableHealthCheck?: boolean
  startup?: Promise<void>
  serverScoped?: JSX.Element
}) {
  // The visual new layout lives in the router root so it remains mounted across
  // route changes. Draft and session routes override only their server-bound data
  // providers beneath it.
  const ServerShell = (shellProps: ParentProps) => (
    <QueryProvider>
      <SharedProviders>
        {props.children}
        {shellProps.children}
      </SharedProviders>
    </QueryProvider>
  )

  return (
    <ServerProvider
      defaultServer={props.defaultServer}
      canonicalLocalServer={props.canonicalLocalServer}
      servers={props.servers}
    >
      <GlobalProvider>
        <SettingsProvider>
          <ConnectionGate disableHealthCheck={props.disableHealthCheck} startup={props.startup}>
            <Show when={useSettings().general.newLayoutDesigns().toString()} keyed>
              <Dynamic
                component={props.router ?? Router}
                root={(routerProps) => (
                  <TabsProvider>
                    <PermissionProvider>
                      <NotificationProvider>
                        <ServerShell>
                          <Show when={useSettings().general.newLayoutDesigns()} fallback={routerProps.children}>
                            <NewAppLayout serverScoped={props.serverScoped}>{routerProps.children}</NewAppLayout>
                          </Show>
                        </ServerShell>
                      </NotificationProvider>
                    </PermissionProvider>
                  </TabsProvider>
                )}
              >
                <Routes serverScoped={props.serverScoped} />
              </Dynamic>
            </Show>
          </ConnectionGate>
        </SettingsProvider>
      </GlobalProvider>
    </ServerProvider>
  )
}

function Routes(props: { serverScoped?: JSX.Element }) {
  const settings = useSettings()

  return (
    <>
      {/* [论文助手定制] Skill 管理独立页面（主页右上角按钮作为入口跳转到这里） */}
      <Route path="/skills" component={ThesisSkillsPage} />
      <Route
        component={(routeProps) => (
          <LegacyServerLayout serverScoped={props.serverScoped}>{routeProps.children}</LegacyServerLayout>
        )}
      >
        <Show when={!settings.general.newLayoutDesigns()}>
          {
            <>
              <Route path="/" component={LegacyHome} />
              <Route path="/server/:serverKey/session/:id" component={LegacyTargetSessionRoute} />
            </>
          }
        </Show>
        <Route path="/:dir" component={DirectoryLayout}>
          <Route path="/" component={() => <Navigate href="session" />} />
          <Route path="/session/:id?" component={SessionRoute} />
        </Route>
      </Route>
      {/* [论文助手定制] 论文工作台顶层路由：/论文目录/workbench（比 /:dir 更具体，优先匹配） */}
      <Route path="/:dir/workbench" component={ThesisWorkbenchRoute} />
      <Show when={settings.general.newLayoutDesigns()}>
        <Route path="/" component={NewHome} />
        <Route path="/:dir/session/:id" component={NewLayoutLegacySessionRedirect} />
        <Route path="/server/:serverKey/session/:id" component={TargetSessionRoute} />
      </Show>
      <Route path="/new-session" component={DraftRoute} />
    </>
  )
}

function NewLayoutLegacySessionRedirect() {
  const server = useServer()
  const tabs = useTabs()
  const params = useParams<{ id: string }>()

  return (
    <Show when={tabs.ready()}>
      <Navigate
        href={sessionHref(
          legacySessionServer(
            tabs.store.filter((item) => item.type === "session"),
            params.id,
            server.key,
          ),
          params.id,
        )}
      />
    </Show>
  )
}
