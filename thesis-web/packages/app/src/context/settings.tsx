import { createStore } from "solid-js/store"
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { persisted } from "@/utils/persist"
import { usePlatform } from "@/context/platform"

export interface NotificationSettings {
  agent: boolean
  permissions: boolean
  errors: boolean
}

export interface Settings {
  general: {
    autoSave: boolean
    followup: "queue" | "steer"
    showFileTree: boolean
    showNavigation: boolean
    showSearch: boolean
    showReasoningSummaries: boolean
    mobileTitlebarPosition: "top" | "bottom"
    newLayoutDesigns?: boolean
    layoutTransitionEligible?: boolean
    newInterfaceNoticeDismissed?: boolean
  }
  notifications: NotificationSettings
}

const legacyNewLayoutDesignsDefault = import.meta.env.VITE_OPENCODE_CHANNEL !== "prod"
export const newLayoutDesignsDefault = true
// Existing users can switch layouts until local midnight on this date. Set new Date(YYYY, M-1, D) to show.
export const oldInterfaceSunset = new Date(2026, 8, 14)
const newLayoutDesignsUpgradeCutoff = "1.17.19"

function compareVersions(a: string, b: string) {
  const parse = (version: string) => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i.exec(version.trim())
    if (!match) return
    return match.slice(1).map(Number)
  }
  const left = parse(a)
  const right = parse(b)
  if (!left || !right) return
  const index = left.findIndex((part, index) => part !== right[index])
  return index === -1 ? 0 : left[index]! - right[index]!
}

export function isAppUpgrade(previous: string | undefined, current: string | undefined) {
  if (!previous || !current) return false
  const comparison = compareVersions(current, previous)
  return comparison !== undefined && comparison > 0
}

export function hasExistingWebState(settings: Promise<string> | string | null, previousVersion: string | undefined) {
  return settings !== null || previousVersion !== undefined
}

export function shouldEnableNewLayout(previous: string | undefined, current: string | undefined) {
  if (!current) return false
  const currentComparison = compareVersions(current, newLayoutDesignsUpgradeCutoff)
  if (!previous) return currentComparison !== undefined && currentComparison > 0
  if (!isAppUpgrade(previous, current)) return false
  const previousComparison = compareVersions(previous, newLayoutDesignsUpgradeCutoff)
  return (
    previousComparison !== undefined &&
    currentComparison !== undefined &&
    previousComparison <= 0 &&
    currentComparison > 0
  )
}

export function layoutTransitionState(scheduled: boolean, eligible: boolean, retired: boolean, dismissed: boolean) {
  return {
    available: scheduled && eligible && !retired,
    notice: scheduled && eligible && retired && !dismissed,
  }
}

export const maximumSunsetTimeout = 2_147_483_647

export function nextSunsetCheckDelay(sunset: number, now: number) {
  return Math.min(Math.max(0, sunset - now), maximumSunsetTimeout)
}

export function resolveNewLayoutDesigns(retired: boolean, preference: boolean | undefined, fallback = true) {
  if (retired) return true
  return preference ?? fallback
}

const terminalFallback =
  '"JetBrainsMono Nerd Font Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

const terminalBase = terminalFallback

function family(font: string) {
  if (/^[\w-]+$/.test(font)) return font
  return `"${font.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

function stack(font: string | undefined, base: string) {
  const value = font?.trim() ?? ""
  if (!value) return base
  return `${family(value)}, ${base}`
}

export function terminalFontFamily(font: string | undefined) {
  return stack(font, terminalBase)
}

const defaultSettings: Settings = {
  general: {
    autoSave: true,
    followup: "steer",
    showFileTree: false,
    showNavigation: false,
    showSearch: false,
    // [论文助手定制] 默认展示思考过程：用户以全屏会话页为主要会话界面，
    // 且偏好看到模型的推理细节（与论文工作台内嵌会话视图保持一致）。
    showReasoningSummaries: true,
    mobileTitlebarPosition: "top",
  },
  notifications: {
    agent: true,
    permissions: true,
    errors: false,
  },
}

function withFallback<T>(read: () => T | undefined, fallback: T) {
  return createMemo(() => read() ?? fallback)
}

export const { use: useSettings, provider: SettingsProvider } = createSimpleContext({
  name: "Settings",
  gate: false,
  init: () => {
    const platform = usePlatform()
    const [store, setStore, settingsInit, ready] = persisted("settings.v3", createStore<Settings>(defaultSettings))
    const [launch, setLaunch, , launchReady] = persisted(
      "app-version.v1",
      createStore<{ version?: string }>({ version: undefined }),
    )
    const [launchState, setLaunchState] = createStore({
      classified: false,
      migrationApplied: false,
      previous: undefined as string | undefined,
    })
    const showFileTree = withFallback(() => store.general?.showFileTree, defaultSettings.general.showFileTree)
    const showSearch = withFallback(() => store.general?.showSearch, defaultSettings.general.showSearch)
    const sunset = oldInterfaceSunset
    const [oldInterfaceRetired, setOldInterfaceRetired] = createSignal(sunset ? Date.now() >= sunset.getTime() : false)
    const layoutTransitionClassified = createMemo(() => typeof store.general?.layoutTransitionEligible === "boolean")
    const layoutTransitionEligible = withFallback(() => store.general?.layoutTransitionEligible, false)
    const newInterfaceNoticeDismissed = withFallback(() => store.general?.newInterfaceNoticeDismissed, false)
    const layoutUpgrade = createMemo(() =>
      launchState.classified && !launchState.migrationApplied
        ? shouldEnableNewLayout(launchState.previous, platform.version)
        : false,
    )
    const layoutTransition = createMemo(() =>
      layoutTransitionState(!!sunset, layoutTransitionEligible(), oldInterfaceRetired(), newInterfaceNoticeDismissed()),
    )
    const newLayoutDesigns = createMemo(() => {
      if (layoutUpgrade()) return true
      if (!ready() && !oldInterfaceRetired()) return legacyNewLayoutDesignsDefault
      if (!layoutTransitionClassified()) {
        return resolveNewLayoutDesigns(
          oldInterfaceRetired(),
          store.general?.newLayoutDesigns,
          legacyNewLayoutDesignsDefault,
        )
      }
      return resolveNewLayoutDesigns(
        oldInterfaceRetired(),
        store.general?.newLayoutDesigns,
        layoutTransitionEligible() ? legacyNewLayoutDesignsDefault : newLayoutDesignsDefault,
      )
    })
    const visible = (preference: () => boolean) => createMemo(() => !newLayoutDesigns() || preference())

    if (sunset && !oldInterfaceRetired()) {
      const timeout = { current: undefined as ReturnType<typeof setTimeout> | undefined }
      const checkSunset = () => {
        if (Date.now() >= sunset.getTime()) {
          setOldInterfaceRetired(true)
          return
        }
        timeout.current = setTimeout(checkSunset, nextSunsetCheckDelay(sunset.getTime(), Date.now()))
      }
      checkSunset()
      onCleanup(() => {
        if (timeout.current !== undefined) clearTimeout(timeout.current)
      })
    }

    createEffect(() => {
      if (!launchReady() || launchState.classified) return
      setLaunchState({
        classified: true,
        previous: launch.version,
      })
      if (!platform.version || launch.version === platform.version) return
      setLaunch("version", platform.version)
    })

    createEffect(() => {
      if (!ready() || !launchState.classified || platform.platform !== "web") return
      const existing = hasExistingWebState(settingsInit, launchState.previous)
      if (!layoutTransitionClassified()) setStore("general", "layoutTransitionEligible", existing)
    })

    createEffect(() => {
      if (!ready() || !launchState.classified || launchState.migrationApplied) return
      if (layoutUpgrade() && store.general?.newLayoutDesigns !== true) {
        setStore("general", "newLayoutDesigns", true)
      }
      setLaunchState("migrationApplied", true)
    })

    createEffect(() => {
      if (!ready() || !oldInterfaceRetired()) return
      if (store.general?.newLayoutDesigns === true) return
      setStore("general", "newLayoutDesigns", true)
    })

    createEffect(() => {
      if (store.general?.followup !== "queue") return
      setStore("general", "followup", "steer")
    })

    return {
      ready,
      get current() {
        return store
      },
      general: {
        autoSave: withFallback(() => store.general?.autoSave, defaultSettings.general.autoSave),
        setAutoSave(value: boolean) {
          setStore("general", "autoSave", value)
        },
        followup: withFallback(
          () => (store.general?.followup === "queue" ? "steer" : store.general?.followup),
          defaultSettings.general.followup,
        ),
        setFollowup(value: "queue" | "steer") {
          setStore("general", "followup", value === "queue" ? "steer" : value)
        },
        showFileTree,
        setShowFileTree(value: boolean) {
          setStore("general", "showFileTree", value)
        },
        showNavigation: withFallback(() => store.general?.showNavigation, defaultSettings.general.showNavigation),
        setShowNavigation(value: boolean) {
          setStore("general", "showNavigation", value)
        },
        showSearch,
        setShowSearch(value: boolean) {
          setStore("general", "showSearch", value)
        },
        showReasoningSummaries: withFallback(
          () => store.general?.showReasoningSummaries,
          defaultSettings.general.showReasoningSummaries,
        ),
        setShowReasoningSummaries(value: boolean) {
          setStore("general", "showReasoningSummaries", value)
        },
        mobileTitlebarPosition: withFallback(
          () => store.general?.mobileTitlebarPosition,
          defaultSettings.general.mobileTitlebarPosition,
        ),
        setMobileTitlebarPosition(value: "top" | "bottom") {
          setStore("general", "mobileTitlebarPosition", value)
        },
        newLayoutDesigns,
        setNewLayoutDesigns(value: boolean) {
          const next = oldInterfaceRetired() ? true : value
          if (newLayoutDesigns() === next) return
          setStore("general", "newLayoutDesigns", next)
          if (typeof window !== "undefined") setTimeout(() => window.location.reload())
        },
        layoutTransitionClassified,
        setOldLayoutEligible(eligible: boolean) {
          const current = store.general?.layoutTransitionEligible
          if (typeof current === "boolean") return
          setStore("general", "layoutTransitionEligible", eligible)
        },
        layoutTransitionAvailable: createMemo(() => ready() && layoutTransition().available),
        newInterfaceNoticeVisible: createMemo(() => ready() && layoutTransition().notice),
        dismissNewInterfaceNotice() {
          setStore("general", "newInterfaceNoticeDismissed", true)
        },
      },
      // [论文助手定制] status/customAgents 已无设置入口：状态栏保持隐藏，智能体选择保持可用。
      visibility: {
        fileTree: visible(showFileTree),
        search: visible(showSearch),
        status: createMemo(() => false),
        customAgents: createMemo(() => true),
      },
      notifications: {
        agent: withFallback(() => store.notifications?.agent, defaultSettings.notifications.agent),
        setAgent(value: boolean) {
          setStore("notifications", "agent", value)
        },
        permissions: withFallback(() => store.notifications?.permissions, defaultSettings.notifications.permissions),
        setPermissions(value: boolean) {
          setStore("notifications", "permissions", value)
        },
        errors: withFallback(() => store.notifications?.errors, defaultSettings.notifications.errors),
        setErrors(value: boolean) {
          setStore("notifications", "errors", value)
        },
      },
    }
  },
})
