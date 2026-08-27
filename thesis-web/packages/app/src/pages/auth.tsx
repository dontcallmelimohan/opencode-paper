import { createMemo, createResource, type ParentProps, Show } from "solid-js"
import { createStore, type SetStoreFunction } from "solid-js/store"
import { useServer } from "@/context/server"

type AuthMode = "login" | "register"

type AuthState = {
  mode: AuthMode
  username: string
  password: string
  loading: boolean
  error: string
  user: { id: string; username: string } | null
}

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
    <main class="min-h-dvh w-screen bg-background-base text-text-base flex items-center justify-center px-4">
      <section class="w-full max-w-sm">
        <div class="mb-8">
          <h1 class="text-24-bold text-text-strong">论文助手</h1>
          <p class="mt-2 text-14-regular text-text-muted">登录后继续使用论文项目、资料库和写作工作台。</p>
        </div>
        <form class="flex flex-col gap-4" onSubmit={props.onSubmit}>
          <label class="flex flex-col gap-1.5">
            <span class="text-12-medium text-text-base">用户名</span>
            <input
              class="h-10 rounded-md border border-border-subtle bg-surface-base px-3 text-14-regular outline-none focus:border-border-strong"
              value={props.state.username}
              autocomplete="username"
              required
              minlength={1}
              maxlength={64}
              onInput={(event) => props.setState("username", event.currentTarget.value)}
            />
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-12-medium text-text-base">密码</span>
            <input
              class="h-10 rounded-md border border-border-subtle bg-surface-base px-3 text-14-regular outline-none focus:border-border-strong"
              type="password"
              value={props.state.password}
              autocomplete={isLogin() ? "current-password" : "new-password"}
              required
              minlength={8}
              onInput={(event) => props.setState("password", event.currentTarget.value)}
            />
          </label>
          <Show when={props.state.error}>
            <p class="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-12-regular text-red-600">
              {props.state.error}
            </p>
          </Show>
          <button
            type="submit"
            disabled={props.state.loading}
            class="h-10 rounded-md bg-text-strong text-background-base text-14-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            {props.state.loading ? "处理中..." : isLogin() ? "登录" : "注册并登录"}
          </button>
        </form>
        <button
          type="button"
          class="mt-4 text-13-regular text-text-muted hover:text-text-strong"
          onClick={() => {
            props.setState("mode", isLogin() ? "register" : "login")
            props.setState("error", "")
          }}
        >
          {isLogin() ? "还没有账号？去注册" : "已有账号？去登录"}
        </button>
      </section>
    </main>
  )
}
