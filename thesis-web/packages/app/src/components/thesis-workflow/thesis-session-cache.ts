// [论文助手定制] 论文工作台侧边栏会话列表缓存。
// 会话创建接口返回后，先把新会话写进 TanStack Query cache，让侧边栏即时刷新；
// 随后再后台 refetch，用服务端真实 title/time 覆盖占位或旧数据。
import type { Session, SessionV2Info } from "@opencode-ai/sdk/v2/client"
import type { QueryClient } from "@tanstack/solid-query"

export const thesisSessionsQueryKey = (directory: string) => ["thesis", "sessions", directory] as const

type MinimalSession = {
  id: string
  title?: string
  directory?: string
  location?: SessionV2Info["location"]
  projectID?: string
  parentID?: string
  agent?: string
  model?: SessionV2Info["model"]
  time?: Partial<SessionV2Info["time"]>
}

type CacheSession = SessionV2Info | Session | MinimalSession

const emptyTokens = (): SessionV2Info["tokens"] => ({
  input: 0,
  output: 0,
  reasoning: 0,
  cache: { read: 0, write: 0 },
})

const isV2Info = (session: CacheSession): session is SessionV2Info => "location" in session && !!session.location

const toV2Info = (session: CacheSession, directory: string): { info: SessionV2Info; placeholder: boolean } => {
  if (isV2Info(session)) return { info: session, placeholder: false }

  const now = Date.now()
  const source = session as Session | MinimalSession
  const sessionDirectory =
    "directory" in source && source.directory ? source.directory : "location" in source && source.location ? source.location.directory : directory
  const created = source.time?.created ?? now
  const updated = source.time?.updated ?? created

  return {
    placeholder: !source.title,
    info: {
      id: source.id,
      parentID: source.parentID,
      projectID: source.projectID ?? "",
      agent: source.agent,
      model: source.model,
      cost: "cost" in source && typeof source.cost === "number" ? source.cost : 0,
      tokens: "tokens" in source && source.tokens ? source.tokens : emptyTokens(),
      time: { created, updated, archived: source.time?.archived },
      title: source.title ?? "未命名对话",
      location: "location" in source && source.location ? source.location : { directory: sessionDirectory },
      subpath:
        "path" in source && typeof source.path === "string"
          ? source.path
          : "subpath" in source && typeof source.subpath === "string"
            ? source.subpath
            : undefined,
      revert: "revert" in source ? source.revert : undefined,
    },
  }
}

const sessionTime = (session: SessionV2Info) => session.time.updated ?? session.time.created

export function upsertThesisSessionCache(queryClient: QueryClient, directory: string, session: CacheSession) {
  const { info, placeholder } = toV2Info(session, directory)
  const key = thesisSessionsQueryKey(directory)

  queryClient.setQueryData<SessionV2Info[]>(key, (current) => {
    const list = current ? [...current] : []
    const index = list.findIndex((item) => item.id === info.id)

    if (index >= 0) {
      if (!placeholder) list[index] = info
      return list.sort((a, b) => sessionTime(b) - sessionTime(a))
    }

    list.unshift(info)
    return list.sort((a, b) => sessionTime(b) - sessionTime(a))
  })
}

export function refreshThesisSessions(queryClient: QueryClient, directory: string) {
  const key = thesisSessionsQueryKey(directory)
  void queryClient.invalidateQueries({ queryKey: key })
  void queryClient.refetchQueries({ queryKey: key, type: "active" })
}
