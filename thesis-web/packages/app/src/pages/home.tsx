import { createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
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
  const data = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new Error(data.error ?? "请求失败")
  return data
}

export function NewHome() {
  const server = useServer()
  const base = () => server.current?.http.url ?? location.origin
  const [loggingOut, setLoggingOut] = createSignal(false)

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

  return (
    <>
      <div
        class={`
          m-2 min-h-0 flex-1 self-stretch overflow-hidden rounded-[10px]
          bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]
        `}
      >
        <ThesisHome />
      </div>
      <Button
        type="button"
        variant="secondary"
        size="small"
        icon="circle-x"
        class="fixed bottom-4 right-4 z-50 shadow-[var(--v2-elevation-floating)]"
        disabled={loggingOut()}
        onClick={() => void logout()}
      >
        {loggingOut() ? "退出中…" : "退出登录"}
      </Button>
    </>
  )
}
