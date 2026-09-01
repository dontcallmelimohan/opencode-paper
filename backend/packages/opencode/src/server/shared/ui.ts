import { FSUtil } from "@opencode-ai/core/fs-util"
import { Effect, Stream } from "effect"
import { HttpBody, HttpClient, HttpClientRequest, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { createHash } from "node:crypto"
import { brotliCompressSync, gzipSync } from "node:zlib"
import { ProxyUtil } from "../proxy-util"

let embeddedUIPromise: Promise<Record<string, string> | null> | undefined

// [论文助手定制] 后端直接访问时，把 UI 代理到本地 Vite 前端。
// 默认使用本项目 Vite 端口 3000；需要临时换端口时可设 OPENCODE_UI_UPSTREAM=http://localhost:<port>。
export const UI_UPSTREAM = new URL(process.env.OPENCODE_UI_UPSTREAM ?? "http://localhost:3000")


export const csp = (hash = "") =>
  // [论文助手定制] 加 frame-src blob: data:，否则文件空间面板里 PDF 预览的 iframe（blob: URL）会被 CSP 拦截显示空白。
  `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'${hash ? ` 'sha256-${hash}'` : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; media-src 'self' data:; frame-src 'self' blob: data:; connect-src * data: blob:`
export const DEFAULT_CSP = csp()

export function themePreloadHash(body: string) {
  return body.match(/<script\b(?![^>]*\bsrc\s*=)[^>]*\bid=(['"])oc-theme-preload-script\1[^>]*>([\s\S]*?)<\/script>/i)
}

export function cspForHtml(body: string) {
  const match = themePreloadHash(body)
  return csp(match ? createHash("sha256").update(match[2]).digest("base64") : "")
}

function requestBody(request: HttpServerRequest.HttpServerRequest) {
  if (request.method === "GET" || request.method === "HEAD") return HttpBody.empty
  const len = request.headers["content-length"]
  return HttpBody.stream(request.stream, request.headers["content-type"], len === undefined ? undefined : Number(len))
}

function proxyResponseHeaders(headers: Record<string, string>) {
  const result = new Headers(headers)
  // FetchHttpClient exposes decoded response bodies, so forwarding upstream
  // transfer metadata makes browsers decode already-decoded assets again.
  result.delete("content-encoding")
  result.delete("content-length")
  result.delete("transfer-encoding")
  return result
}

export function upstreamURL(path: string) {
  return new URL(path, UI_UPSTREAM).toString()
}

export function embeddedUI(disableEmbeddedWebUi: boolean) {
  if (disableEmbeddedWebUi) return Promise.resolve(null)
  return (embeddedUIPromise ??=
    // @ts-expect-error - generated file is written into this package root at deploy/build time
    import("../../../opencode-web-ui.gen.ts").then((module) => module.default as Record<string, string>).catch(() => null))
}

function notFound() {
  return HttpServerResponse.jsonUnsafe({ error: "Not Found" }, { status: 404 })
}

function shouldCompress(mime: string) {
  return (
    mime.startsWith("text/") ||
    mime.includes("javascript") ||
    mime.includes("json") ||
    mime.includes("xml") ||
    mime === "image/svg+xml"
  )
}

// [论文助手定制] 压缩结果缓存（按 算法+文件），避免每个请求都重复压缩大文件（index 2.9MB 压缩约几十 ms）。
const compressionCache = new Map<string, Uint8Array>()

// [论文助手定制] 静态资源响应：优先 Brotli（比 gzip 再省 15~20%），并给带 hash 的产物加长缓存，
// 让低带宽服务器上二次访问/刷新直接走浏览器缓存，不用反复下载大包；HTML 保持 no-cache 每次校验。
function embeddedUIResponse(file: string, body: Uint8Array, acceptEncoding?: string) {
  const mime = FSUtil.mimeType(file)
  const headers = new Headers({ "content-type": mime })
  if (mime.startsWith("text/html")) {
    headers.set("content-security-policy", cspForHtml(new TextDecoder().decode(body)))
    headers.set("cache-control", "no-cache")
  } else {
    headers.set("cache-control", "public, max-age=31536000, immutable")
  }
  const enc = acceptEncoding?.toLowerCase() ?? ""
  if (body.byteLength >= 1024 && shouldCompress(mime)) {
    if (enc.includes("br")) {
      const key = `br:${file}`
      let compressed = compressionCache.get(key)
      if (!compressed) {
        compressed = brotliCompressSync(body)
        compressionCache.set(key, compressed)
      }
      headers.set("content-encoding", "br")
      headers.set("vary", "Accept-Encoding")
      return HttpServerResponse.uint8Array(compressed, { headers })
    }
    if (enc.includes("gzip")) {
      const key = `gz:${file}`
      let compressed = compressionCache.get(key)
      if (!compressed) {
        compressed = gzipSync(body)
        compressionCache.set(key, compressed)
      }
      headers.set("content-encoding", "gzip")
      headers.set("vary", "Accept-Encoding")
      return HttpServerResponse.uint8Array(compressed, { headers })
    }
  }
  return HttpServerResponse.uint8Array(body, { headers })
}

export function serveEmbeddedUIEffect(
  requestPath: string,
  requestHeaders: Record<string, string>,
  fs: FSUtil.Interface,
  embeddedWebUI: Record<string, string>,
) {
  const file = embeddedWebUI[requestPath.replace(/^\//, "")] ?? embeddedWebUI["index.html"] ?? null
  if (!file) return Effect.succeed(notFound())

  return fs.readFile(file).pipe(
    Effect.map((body) => embeddedUIResponse(file, body, requestHeaders["accept-encoding"])),
    Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(notFound())),
  )
}

export function serveUIEffect(
  request: HttpServerRequest.HttpServerRequest,
  services: { fs: FSUtil.Interface; client: HttpClient.HttpClient; disableEmbeddedWebUi: boolean },
) {
  return Effect.gen(function* () {
    const embeddedWebUI = yield* Effect.promise(() => embeddedUI(services.disableEmbeddedWebUi))
    const url = new URL(request.url, "http://localhost")
    const path = url.pathname

    if (embeddedWebUI) return yield* serveEmbeddedUIEffect(path, request.headers, services.fs, embeddedWebUI)

    const response = yield* services.client.execute(
      HttpClientRequest.make(request.method)(upstreamURL(url.pathname + url.search), {
        headers: ProxyUtil.headers(request.headers, { host: UI_UPSTREAM.host }),
        body: requestBody(request),
      }),
    )
    const headers = proxyResponseHeaders(response.headers)

    if (response.headers["content-type"]?.includes("text/html")) {
      const body = yield* response.text
      headers.set("Content-Security-Policy", cspForHtml(body))
      return HttpServerResponse.text(body, { status: response.status, headers })
    }

    headers.set("Content-Security-Policy", csp())
    return HttpServerResponse.stream(response.stream.pipe(Stream.catchCause(() => Stream.empty)), {
      status: response.status,
      headers,
    })
  })
}
