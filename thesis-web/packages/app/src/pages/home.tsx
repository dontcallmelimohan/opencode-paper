import { createMemo, createResource, createSignal } from "solid-js"
import { useServer } from "@/context/server"
import { ThesisHome } from "./home/thesis-home"

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
  const data = (await response.json().catch(() => ({}))) as { error?: string; user?: { username?: string } }
  if (!response.ok) throw new Error(data.error ?? "请求失败")
  return data
}

export function NewHome() {
  const server = useServer()
  const base = createMemo(() => server.current?.http.url ?? location.origin)
  const [loggingOut, setLoggingOut] = createSignal(false)

  // [论文助手定制] 顶栏账号菜单显示真实登录用户名（后端 /auth/me），不再硬编码占位账号。
  const [session] = createResource(base, async (url) => {
    try {
      const data = await requestAuth(url, "/auth/me")
      return data.user?.username ?? undefined
    } catch {
      return undefined
    }
  })

  const logout = async () => {
    if (loggingOut()) return
    setLoggingOut(true)
    try {
      await requestAuth(base(), "/auth/logout", {})
      window.location.assign("/")
    } finally {
      setLoggingOut(false)
    }
  }

  // [论文助手定制] 主页整页铺满（不再套一层圆角卡片 + 悬浮退出按钮），退出入口收进顶栏账号菜单。
  return (
    <ThesisHome
      userName={session() ?? session.latest ?? "已登录用户"}
      loggingOut={loggingOut()}
      onLogout={() => void logout()}
    />
  )
}
