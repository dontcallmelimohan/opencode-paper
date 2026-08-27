import type { ServerConnection } from "@/context/server"
import { authTokenFromCredentials } from "./server"

export type ServerProtocol = "v1" | "v2"

function headers(server: ServerConnection.HttpBase) {
  if (!server.password) return
  return {
    Authorization: `Basic ${authTokenFromCredentials({ username: server.username, password: server.password })}`,
  }
}

async function probe(server: ServerConnection.HttpBase, fetch: typeof globalThis.fetch, path: string) {
  const response = await fetch(new URL(path, server.url), {
    headers: headers(server),
    // The rest of the app authenticates with `credentials: "include"` (cookie /
    // AppAuth sessions), so the protocol probes must send credentials too.
    // Without this, cross-origin probes silently fail auth and the fallback
    // incorrectly pins the app to the v2 protocol.
    credentials: "include",
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return
  const value: unknown = await response.json()
  if (!value || typeof value !== "object") return
  return value
}

function fromHealth(
  legacy: unknown,
  current: unknown,
): ServerProtocol | undefined {
  const legacyHealth = legacy && typeof legacy === "object" ? (legacy as Record<string, unknown>) : undefined
  const currentHealth = current && typeof current === "object" ? (current as Record<string, unknown>) : undefined
  if (legacyHealth?.healthy === true) return "v1"
  if (typeof currentHealth?.pid === "number") return "v2"
  if (currentHealth?.healthy === true) return "v1"
  return undefined
}

export async function detectServerProtocol(
  server: ServerConnection.HttpBase,
  fetch: typeof globalThis.fetch,
): Promise<ServerProtocol> {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  for (let attempt = 0; ; attempt++) {
    const legacy = await probe(server, fetch, "/global/health").catch(() => undefined)
    const current = await probe(server, fetch, "/api/health").catch(() => undefined)
    const protocol = fromHealth(legacy, current)
    if (protocol) return protocol

    // Both probes failed — e.g. the server is still starting up, or auth was
    // not available yet. Retry once before falling back so a transient failure
    // does not permanently pin the app to the v2 protocol.
    if (attempt === 1) return "v2"
    await wait(1_000)
  }
}
