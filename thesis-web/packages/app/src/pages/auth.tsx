import { createMemo, createResource, type ParentProps, Show } from "solid-js"
import { createStore, type SetStoreFunction } from "solid-js/store"
import { useServer } from "@/context/server"
import { Mark } from "@opencode-ai/ui/logo"

type AuthMode = "login" | "register"

type AuthState = {
  mode: AuthMode
  username: string
  password: string
  loading: boolean
  error: string
  user: { id: string; username: string } | null
}

const DEMO_CREDENTIALS = { username: "测试用户", password: "12345678" }

function authUrl(base: string, path: string) {
  return new URL(path, base).toString()
}

async function requestAuth(base: string, path: string, body?: unknown) {
  const response = await fetch(authUrl(base, path), {
    method: body ? "POST" : "GET",
    credentials: "include",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = (await response.json().catch(() => ({}))) as { error?: string; user?: AuthState["user"] }
  if (!response.ok) throw new Error(data.error ?? "请求失败")
  return data
}

export function AuthGate(props: ParentProps) {
  const server = useServer()
  const base = createMemo(() => server.current?.http.url ?? location.origin)
  const [state, setState] = createStore<AuthState>({
    mode: "login",
    username: "",
    password: "",
    loading: false,
    error: "",
    user: null,
  })
  const [session, sessionActions] = createResource(
    base,
    async (url) => {
      const result = await requestAuth(url, "/auth/me")
      setState("user", result.user ?? null)
      return result.user ?? null
    },
  )
  const authenticated = createMemo(() => !!state.user || !!session())

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    setState("loading", true)
    setState("error", "")
    try {
      const result = await requestAuth(base(), state.mode === "login" ? "/auth/login" : "/auth/register", {
        username: state.username,
        password: state.password,
      })
      setState("user", result.user ?? null)
      setState("password", "")
      await sessionActions.refetch()
    } catch (error) {
      setState("error", error instanceof Error ? error.message : "请求失败")
    } finally {
      setState("loading", false)
    }
  }

  return (
    <Show
      when={session.state !== "pending" && session.state !== "unresolved"}
      fallback={<div class="h-dvh w-screen bg-background-base" />}
    >
      <Show when={authenticated()} fallback={<AuthForm state={state} setState={setState} onSubmit={submit} />}>
        <div class="flex h-dvh w-screen flex-col overflow-hidden bg-background-base">{props.children}</div>
      </Show>
    </Show>
  )
}

function AuthForm(props: {
  state: AuthState
  setState: SetStoreFunction<AuthState>
  onSubmit: (event: SubmitEvent) => void
}) {
  const isLogin = () => props.state.mode === "login"
  return (
    // [论文助手定制] GitHub 式登录页：浅灰底（#f6f8fa / #0d1117）+ 白色居中卡片，
    // 细边框、无品牌渐变与浮层阴影；账号密码提示小字放页面底部。
    <main class="auth-page-bg flex min-h-dvh w-screen items-center justify-center px-4">
      <section class="w-full max-w-[360px]">
        <div class="mb-7 flex flex-col items-center gap-2 text-center">
          <div class="flex size-12 items-center justify-center rounded-[10px] border workbench-border bg-v2-background-bg-base">
            <Mark class="size-7" />
          </div>
          <h1 class="mt-1 text-20-medium text-v2-text-text-strong">论文助手</h1>
          <p class="text-13-regular text-v2-text-text-muted">登录后继续使用论文项目、资料库和写作工作台。</p>
        </div>
        <form class="auth-card flex flex-col gap-4 p-6" onSubmit={props.onSubmit}>
          <label class="flex flex-col gap-1.5">
            <span class="text-12-medium text-v2-text-text-base">用户名</span>
            <input
              class="auth-input"
              value={props.state.username}
              autocomplete="username"
              placeholder="输入用户名"
              required
              minlength={1}
              maxlength={64}
              onInput={(event) => props.setState("username", event.currentTarget.value)}
            />
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-12-medium text-v2-text-text-base">密码</span>
            <input
              class="auth-input"
              type="password"
              value={props.state.password}
              autocomplete={isLogin() ? "current-password" : "new-password"}
              placeholder="输入密码"
              required
              minlength={8}
              onInput={(event) => props.setState("password", event.currentTarget.value)}
            />
          </label>
          <Show when={props.state.error}>
            <p class="rounded-[6px] border border-red-500/30 bg-red-500/10 px-3 py-2 text-12-regular text-red-600">
              {props.state.error}
            </p>
          </Show>
          <button
            type="submit"
            disabled={props.state.loading}
            class="h-9 w-full cursor-pointer rounded-[6px] border border-[var(--brand-primary-border)] bg-[var(--brand-primary-bg)] text-14-medium text-white transition-colors hover:border-[var(--brand-primary-border-hover)] hover:bg-[var(--brand-primary-bg-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {props.state.loading ? "处理中..." : isLogin() ? "登录" : "注册并登录"}
          </button>
        </form>
        {/* [论文助手定制] 注册/登录切换：独立细边框小卡片，GitHub 登录页样式。 */}
        <div class="auth-card mt-3 flex items-center justify-center gap-1 px-4 py-3 text-13-regular text-v2-text-text-muted">
          {isLogin() ? "还没有账号？" : "已有账号？"}
          <button
            type="button"
            class="auth-link text-13-regular"
            onClick={() => {
              props.setState("mode", isLogin() ? "register" : "login")
              props.setState("error", "")
            }}
          >
            {isLogin() ? "去注册" : "去登录"}
          </button>
        </div>
        {/* [论文助手定制] 测试账号小字放页面底部，方便登录的人直接查看。 */}
        <p class="mt-4 text-center text-12-regular text-v2-text-text-faint">
          测试账号：{DEMO_CREDENTIALS.username}　密码：{DEMO_CREDENTIALS.password}
        </p>
      </section>
    </main>
  )
}
