import { describe, expect, test } from "bun:test"
import { detectServerProtocol } from "./server-protocol"

const server = { url: "http://localhost:4096" }
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } })
const mockFetch = (run: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) =>
  Object.assign(run, { preconnect: globalThis.fetch.preconnect })

describe("detectServerProtocol", () => {
  test("prefers the legacy health endpoint when both API generations exist", async () => {
    const fetcher = mockFetch((input) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname
      if (path === "/global/health") return Promise.resolve(json({ healthy: true, version: "1.18.4" }))
      return Promise.resolve(json({ healthy: true, version: "2.0.0", pid: 123 }))
    })

    expect(await detectServerProtocol(server, fetcher)).toBe("v1")
  })

  test("recognizes V2 health by its process identifier", async () => {
    const fetcher = mockFetch((input) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname
      if (path === "/global/health") return Promise.resolve(json({}, 404))
      return Promise.resolve(json({ healthy: true, version: "2.0.0", pid: 123 }))
    })

    expect(await detectServerProtocol(server, fetcher)).toBe("v2")
  })

  test("recognizes the transitional V1 API health response", async () => {
    const fetcher = mockFetch((input) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname
      if (path === "/global/health") return Promise.resolve(json({}, 404))
      return Promise.resolve(json({ healthy: true }))
    })

    expect(await detectServerProtocol(server, fetcher)).toBe("v1")
  })

  test("sends credentials on probes so cookie-authenticated servers are detected", async () => {
    let seen: RequestInit | undefined
    const fetcher = mockFetch((input, init) => {
      seen = init
      const path = new URL(input instanceof Request ? input.url : input).pathname
      if (path === "/global/health") return Promise.resolve(json({ healthy: true, version: "1.18.4" }))
      return Promise.resolve(json({}))
    })

    expect(await detectServerProtocol(server, fetcher)).toBe("v1")
    expect(seen?.credentials).toBe("include")
  })

  test("retries before falling back to V2 when both probes fail transiently", async () => {
    let calls = 0
    const fetcher = mockFetch((input) => {
      calls += 1
      const path = new URL(input instanceof Request ? input.url : input).pathname
      if (path === "/global/health") {
        // First attempt: server unreachable. Second attempt: server is up.
        return calls === 1 ? Promise.resolve(json({}, 503)) : Promise.resolve(json({ healthy: true, version: "1.18.4" }))
      }
      return Promise.resolve(json({}, 503))
    })

    expect(await detectServerProtocol(server, fetcher)).toBe("v1")
    expect(calls).toBeGreaterThan(1)
  })
})
